import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey:            "AIzaSyC-31EtduvNy07LRj7kx_LHm7WA3dAQMmk",
  authDomain:        "girlmeet-fd852.firebaseapp.com",
  projectId:         "girlmeet-fd852",
  storageBucket:     "girlmeet-fd852.firebasestorage.app",
  messagingSenderId: "315197936856",
  appId:             "1:315197936856:web:0bb82f88e4b319e528b3ad"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
