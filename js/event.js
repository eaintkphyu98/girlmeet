import { db } from './firebase-config.js';
import {
  doc,
  getDoc,
  setDoc,
  collection,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";

// ── Emoji options ─────────────────────────────────────────────
const EMOJIS = [
  '🌸','🌺','🌹','🌷','🌻','🌼','🌈','🦋',
  '🌙','⭐','🌟','✨','💫','🎀','🍓','🍒',
  '🍰','🧁','🦄','🐱','🐰','🐻','🐼','🐨',
  '🦊','🐸','🍭','🍬','💝','🫧','🎠','🎡'
];

// ── State ─────────────────────────────────────────────────────
let eventData       = null;
let myParticipant   = null;
let allParticipants = [];
let mySelection     = new Set();
let isDragging      = false;
let dragMode        = null;
let unsubscribe     = null;

const params  = new URLSearchParams(window.location.search);
const eventId = params.get('id');

// ── Helpers ───────────────────────────────────────────────────

function pad(n) { return String(n).padStart(2, '0'); }

function formatTime12(time24) {
  const [h, m] = time24.split(':').map(Number);
  const period = h < 12 ? 'AM' : 'PM';
  const hour   = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour}:${pad(m)} ${period}`;
}

function formatDateRange(start, end) {
  const s    = new Date(start + 'T00:00:00');
  const e    = new Date(end   + 'T00:00:00');
  const opts = { month: 'short', day: 'numeric' };
  const full = { month: 'short', day: 'numeric', year: 'numeric' };
  return s.getFullYear() === e.getFullYear()
    ? `${s.toLocaleDateString('en-US', opts)} – ${e.toLocaleDateString('en-US', full)}`
    : `${s.toLocaleDateString('en-US', full)} – ${e.toLocaleDateString('en-US', full)}`;
}

function getDates() {
  const dates = [];
  const cur   = new Date(eventData.startDate + 'T00:00:00');
  const end   = new Date(eventData.endDate   + 'T00:00:00');
  while (cur <= end) {
    dates.push(cur.toISOString().split('T')[0]);
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

function getTimeSlots() {
  const slots = [];
  const [sh, sm] = eventData.startTime.split(':').map(Number);
  const [eh, em] = eventData.endTime.split(':').map(Number);
  let cur = sh * 60 + sm;
  const end = eh * 60 + em;
  while (cur < end) {
    slots.push(`${pad(Math.floor(cur / 60))}:${pad(cur % 60)}`);
    cur += 30;
  }
  return slots;
}

function slotKey(date, time) { return `${date}|${time}`; }

function el(tag, cls) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

// ── Local storage ─────────────────────────────────────────────

function loadSavedParticipant() {
  try {
    const raw = localStorage.getItem(`girlmeet_${eventId}`);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveParticipantLocal(p) {
  localStorage.setItem(`girlmeet_${eventId}`, JSON.stringify(p));
}

// ── Drag-to-select (set up once on document) ──────────────────
// Using mousemove + elementFromPoint instead of mouseover —
// more reliable when mouse button is held down across cells.

function toggleCell(cell) {
  if (!cell?.dataset.key) return;
  if (dragMode === 'select') {
    mySelection.add(cell.dataset.key);
    cell.classList.add('selected');
  } else {
    mySelection.delete(cell.dataset.key);
    cell.classList.remove('selected');
  }
}

function setupDragHandlers() {
  // Mouse
  document.addEventListener('mousemove', e => {
    if (!isDragging) return;
    const cell = document.elementFromPoint(e.clientX, e.clientY)?.closest('.my-cell');
    toggleCell(cell);
  });

  document.addEventListener('mouseup', () => { isDragging = false; });

  // Touch
  document.addEventListener('touchmove', e => {
    if (!isDragging) return;
    const t    = e.touches[0];
    const cell = document.elementFromPoint(t.clientX, t.clientY)?.closest('.my-cell');
    toggleCell(cell);
  }, { passive: true });

  document.addEventListener('touchend', () => { isDragging = false; }, { passive: true });
}

// ── Render event header ───────────────────────────────────────

function renderEventHeader() {
  document.title = `${eventData.name} — girlmeet 💕`;
  document.getElementById('eventTitle').textContent     = eventData.name;
  document.getElementById('eventDateRange').textContent = '📅 ' + formatDateRange(eventData.startDate, eventData.endDate);
  document.getElementById('eventTimeRange').textContent = '🕐 ' + formatTime12(eventData.startTime) + ' – ' + formatTime12(eventData.endTime);

  const shareUrl = window.location.href;
  document.getElementById('shareUrl').textContent = shareUrl;
  document.getElementById('copyBtn').addEventListener('click', () => {
    navigator.clipboard.writeText(shareUrl).then(() => showToast('link copied! 🌸'));
  });

  ['eventHeaderSection','shareSection','participantsSection','panelsSection'].forEach(id => {
    document.getElementById(id).style.display = '';
  });
  document.getElementById('saveBar').style.display     = '';
  document.getElementById('loadingState').style.display = 'none';
}

// ── My availability grid ──────────────────────────────────────

function renderMyGrid() {
  const dates = getDates();
  const slots = getTimeSlots();
  const grid  = document.getElementById('myGrid');

  grid.style.gridTemplateColumns = `52px repeat(${dates.length}, 46px)`;
  grid.innerHTML = '';

  const DAY = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  grid.appendChild(el('div', 'grid-corner'));
  dates.forEach(date => {
    const d    = new Date(date + 'T00:00:00');
    const cell = el('div', 'date-header');
    cell.innerHTML = `<div class="day-name">${DAY[d.getDay()]}</div><div class="day-num">${d.getDate()}</div>`;
    grid.appendChild(cell);
  });

  slots.forEach(slot => {
    const isHour = slot.endsWith(':00');
    const label  = el('div', `time-label${isHour ? ' hour-mark' : ''}`);
    label.textContent = isHour ? formatTime12(slot) : '';
    grid.appendChild(label);

    dates.forEach(date => {
      const key  = slotKey(date, slot);
      const cell = el('div', `grid-cell my-cell${isHour ? ' hour-top' : ''}${mySelection.has(key) ? ' selected' : ''}`);
      cell.dataset.key = key;
      grid.appendChild(cell);
    });
  });

  // Only mousedown/touchstart go on the grid — move/up are on document (set up once)
  grid.addEventListener('mousedown', e => {
    const cell = e.target.closest('.my-cell');
    if (!cell) return;
    e.preventDefault();
    isDragging = true;
    dragMode   = cell.classList.contains('selected') ? 'deselect' : 'select';
    toggleCell(cell);
  });

  grid.addEventListener('touchstart', e => {
    const t    = e.touches[0];
    const cell = document.elementFromPoint(t.clientX, t.clientY)?.closest('.my-cell');
    if (!cell) return;
    isDragging = true;
    dragMode   = cell.classList.contains('selected') ? 'deselect' : 'select';
    toggleCell(cell);
  }, { passive: true });
}

// ── Load & save availability ──────────────────────────────────

async function loadMyAvailability() {
  if (!myParticipant) return;
  try {
    const snap = await getDoc(doc(db, 'events', eventId, 'participants', myParticipant.id));
    if (snap.exists()) mySelection = new Set(snap.data().availability || []);
  } catch (err) {
    console.error('Could not load availability:', err);
  }
}

async function saveAvailability() {
  if (!myParticipant) { showModal(); return; }

  const btn = document.getElementById('saveBtn');
  btn.textContent = 'saving... 💾';
  btn.disabled    = true;

  try {
    await setDoc(doc(db, 'events', eventId, 'participants', myParticipant.id), {
      name:         myParticipant.name,
      emoji:        myParticipant.emoji,
      availability: Array.from(mySelection),
      updatedAt:    serverTimestamp()
    });
    showToast('saved! 🌸✨');
  } catch (err) {
    console.error(err);
    showToast('save failed 😢 try again!');
  } finally {
    btn.textContent = 'save my availability 💕';
    btn.disabled    = false;
  }
}

// ── Participants list ─────────────────────────────────────────

function renderParticipants() {
  const container = document.getElementById('participants');
  container.innerHTML = '';

  if (allParticipants.length === 0) {
    container.innerHTML = '<span style="font-size:0.82rem;color:var(--text-light);font-weight:600">no one yet — be the first! 🌸</span>';
    return;
  }

  allParticipants.forEach(p => {
    const chip = el('div', `participant-chip${p.id === myParticipant?.id ? ' is-me' : ''}`);
    chip.textContent = `${p.emoji} ${p.name}`;
    container.appendChild(chip);
  });
}

// ── Group grid (heat map) ─────────────────────────────────────

function heatColor(ratio, count) {
  if (count === 0) return '#F8F9FF';
  // baby blue → sky blue → soft lavender → periwinkle
  const stops = ['#BFDBFE', '#93C5FD', '#DDD6FE', '#A5B4FC'];
  const scaled = ratio * (stops.length - 1);
  const i = Math.min(Math.floor(scaled), stops.length - 2);
  return lerpColor(stops[i], stops[i + 1], scaled - i);
}

function lerpColor(c1, c2, t) {
  const r = (s, i) => parseInt(s.slice(i, i + 2), 16);
  const lerp = (a, b) => Math.round(a + (b - a) * t);
  return `rgb(${lerp(r(c1,1),r(c2,1))},${lerp(r(c1,3),r(c2,3))},${lerp(r(c1,5),r(c2,5))})`;
}

function renderGroupGrid() {
  const dates = getDates();
  const slots = getTimeSlots();
  const grid  = document.getElementById('groupGrid');
  const n     = allParticipants.length;

  grid.style.gridTemplateColumns = `52px repeat(${dates.length}, 46px)`;
  grid.innerHTML = '';

  const countMap = {};
  allParticipants.forEach(p => {
    (p.availability || []).forEach(key => { countMap[key] = (countMap[key] || 0) + 1; });
  });

  const DAY = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  grid.appendChild(el('div', 'grid-corner'));
  dates.forEach(date => {
    const d    = new Date(date + 'T00:00:00');
    const cell = el('div', 'date-header');
    cell.innerHTML = `<div class="day-name">${DAY[d.getDay()]}</div><div class="day-num">${d.getDate()}</div>`;
    grid.appendChild(cell);
  });

  slots.forEach(slot => {
    const isHour = slot.endsWith(':00');
    const label  = el('div', `time-label${isHour ? ' hour-mark' : ''}`);
    label.textContent = isHour ? formatTime12(slot) : '';
    grid.appendChild(label);

    dates.forEach(date => {
      const key   = slotKey(date, slot);
      const count = countMap[key] || 0;
      const ratio = n > 0 ? count / n : 0;
      const cell  = el('div', `grid-cell group-cell${isHour ? ' hour-top' : ''}`);
      cell.style.backgroundColor = heatColor(ratio, count);

      const names = allParticipants
        .filter(p => (p.availability || []).includes(key))
        .map(p => `${p.emoji} ${p.name}`)
        .join(', ');
      cell.title = count > 0 ? `${count}/${n} free: ${names}` : `0/${n} free`;

      grid.appendChild(cell);
    });
  });

  renderLegend(n);
}

function renderLegend(n) {
  const legend = document.getElementById('groupLegend');
  if (n === 0) { legend.innerHTML = ''; return; }
  const swatches = [0, 0.25, 0.5, 0.75, 1].map(ratio => {
    const bg = ratio === 0 ? '#FFF5F8' : heatColor(ratio, Math.round(ratio * n));
    return `<div class="legend-swatch" style="background:${bg}"></div>`;
  });
  legend.innerHTML = `<span>fewer free</span>${swatches.join('')}<span>more free</span>`;
}

// ── Real-time listener ────────────────────────────────────────

function subscribeToParticipants() {
  if (unsubscribe) unsubscribe();
  unsubscribe = onSnapshot(
    collection(db, 'events', eventId, 'participants'),
    snap => {
      allParticipants = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderParticipants();
      renderGroupGrid();
    },
    err => console.error('Subscription error:', err)
  );
}

// ── Modal ─────────────────────────────────────────────────────

function showModal() {
  document.getElementById('modal').style.display = 'flex';
  setTimeout(() => document.getElementById('participantName').focus(), 100);
}

function closeModal() {
  document.getElementById('modal').style.display = 'none';
}

function initModal() {
  const emojiGrid = document.getElementById('emojiGrid');
  let selectedEmoji = EMOJIS[0];

  EMOJIS.forEach((emoji, i) => {
    const btn = el('div', `emoji-option${i === 0 ? ' selected' : ''}`);
    btn.textContent = emoji;
    btn.addEventListener('click', () => {
      document.querySelectorAll('.emoji-option').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedEmoji = emoji;
    });
    emojiGrid.appendChild(btn);
  });

  document.getElementById('joinBtn').addEventListener('click', async () => {
    const name = document.getElementById('participantName').value.trim();
    if (!name) { showToast('tell us your name! 🌸'); return; }

    const savedId  = myParticipant?.id || Math.random().toString(36).slice(2, 10);
    myParticipant  = { id: savedId, name, emoji: selectedEmoji };
    saveParticipantLocal(myParticipant);
    updateUserBubble();
    closeModal();

    await loadMyAvailability();
    renderMyGrid();
  });

  document.getElementById('participantName').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('joinBtn').click();
  });
}

function updateUserBubble() {
  const bubble = document.getElementById('userBubble');
  bubble.textContent = myParticipant
    ? `${myParticipant.emoji} ${myParticipant.name}`
    : '👤 join event';
}

// ── Init ──────────────────────────────────────────────────────

async function init() {
  if (!eventId) { window.location.href = 'index.html'; return; }

  let snap;
  try {
    snap = await getDoc(doc(db, 'events', eventId));
  } catch (err) {
    document.getElementById('loadingState').textContent = 'could not connect 😢 check your Firebase setup!';
    return;
  }

  if (!snap.exists()) {
    document.getElementById('loadingState').innerHTML =
      '<div style="font-size:2rem;margin-bottom:0.5rem">😢</div>this event doesn\'t exist or has been deleted.';
    return;
  }

  eventData = snap.data();
  renderEventHeader();

  const saved = loadSavedParticipant();
  if (saved) {
    myParticipant = saved;
    updateUserBubble();
    await loadMyAvailability();
  } else {
    updateUserBubble();
    showModal();
  }

  renderMyGrid();
  subscribeToParticipants();
}

// ── Boot ──────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  setupDragHandlers();   // document-level drag listeners, set up once
  initModal();
  document.getElementById('saveBtn').addEventListener('click', saveAvailability);
  document.getElementById('userBubble').addEventListener('click', showModal);
  init();
});
