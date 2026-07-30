import { db } from './firebase-config.js';
import {
  collection,
  addDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";

// ── Helpers ──────────────────────────────────────────────────

function pad(n) { return String(n).padStart(2, '0'); }

function toISODate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatTime12(time24) {
  const [h, m] = time24.split(':').map(Number);
  const period = h < 12 ? 'AM' : 'PM';
  const hour   = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour}:${pad(m)} ${period}`;
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

// ── Populate time dropdowns ──────────────────────────────────

function buildTimeOptions() {
  ['startTime', 'endTime'].forEach(id => {
    const sel = document.getElementById(id);
    for (let h = 0; h < 24; h++) {
      for (let m = 0; m < 60; m += 30) {
        const value = `${pad(h)}:${pad(m)}`;
        sel.add(new Option(formatTime12(value), value));
      }
    }
  });
  document.getElementById('startTime').value = '09:00';
  document.getElementById('endTime').value   = '22:00';
}

// ── Default dates ────────────────────────────────────────────

function initDates() {
  const today  = new Date();
  const endDef = new Date(today);
  endDef.setDate(endDef.getDate() + 6);

  const startInput = document.getElementById('startDate');
  const endInput   = document.getElementById('endDate');

  startInput.value = toISODate(today);
  startInput.min   = toISODate(today);
  endInput.value   = toISODate(endDef);
  endInput.min     = toISODate(today);

  startInput.addEventListener('change', () => {
    endInput.min = startInput.value;
    if (endInput.value < startInput.value) endInput.value = startInput.value;
  });
}

// ── Create event ─────────────────────────────────────────────

async function createEvent() {
  const name      = document.getElementById('eventName').value.trim();
  const startDate = document.getElementById('startDate').value;
  const endDate   = document.getElementById('endDate').value;
  const startTime = document.getElementById('startTime').value;
  const endTime   = document.getElementById('endTime').value;
  const passcode  = document.getElementById('passcode').value.trim();

  if (!name)                { showToast('give your event a name first! 🌸'); return; }
  if (!startDate)           { showToast('pick a start date! 📅'); return; }
  if (!endDate)             { showToast('pick an end date! 📅'); return; }
  if (startDate > endDate)  { showToast('end date must be after start date!'); return; }
  if (startTime >= endTime) { showToast('end time must be after start time!'); return; }
  if (!passcode)            { showToast('set a passcode so you can edit later! 🔑'); return; }

  const btn = document.getElementById('createBtn');
  btn.textContent = 'creating... 🌸';
  btn.disabled    = true;

  try {
    const ref = await addDoc(collection(db, 'events'), {
      name,
      startDate,
      endDate,
      startTime,
      endTime,
      passcode,
      createdAt: serverTimestamp()
    });
    window.location.href = `event.html?id=${ref.id}`;
  } catch (err) {
    console.error(err);
    showToast('something went wrong 😢 check your Firebase setup!');
    btn.textContent = 'create event 🌸';
    btn.disabled    = false;
  }
}

// ── Init ─────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  buildTimeOptions();
  initDates();
  document.getElementById('createBtn').addEventListener('click', createEvent);
  document.getElementById('eventName').addEventListener('keydown', e => {
    if (e.key === 'Enter') createEvent();
  });
});
