// Firebase web config (public by design; Firestore rules protect the data).
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBsxFl8PmhZrG0NZlnW3JQ43y0a2bIfxMs",
  authDomain: "my-reward-e3d5e.firebaseapp.com",
  projectId: "my-reward-e3d5e",
  storageBucket: "my-reward-e3d5e.firebasestorage.app",
  messagingSenderId: "441694729132",
  appId: "1:441694729132:web:cde7c07f1ea74f1b358009"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
