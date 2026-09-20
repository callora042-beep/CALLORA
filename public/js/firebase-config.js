// public/js/firebase-config.js
//
// Shared Firebase client init. Import this from any page that needs auth or Firestore.
// Fill in your actual Firebase project config below (from Firebase Console → Project settings).

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCzztKRE-oRrPaPpR6l8XnI7ea1OhzW7Rw",
  authDomain: "callora-9fd33.firebaseapp.com",
  projectId: "callora-9fd33",
  storageBucket: "callora-9fd33.firebasestorage.app",
  messagingSenderId: "877730969854",
  appId: "1:877730969854:web:39f19393f703eaafd98daf",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
