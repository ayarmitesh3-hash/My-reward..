import { auth, db } from "./firebase-config.js";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut,
  onAuthStateChanged, sendEmailVerification } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc, setDoc, updateDoc, collection, getDocs, deleteDoc, writeBatch,
  serverTimestamp, increment, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $ = (s) => document.querySelector(s);
const app = $("#app");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const toast = (m) => { const t = $("#toast"); t.textContent = m; t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 2800); };
const rupees = (c) => (c / 100).toFixed(2);
const today = () => new Date().toISOString().slice(0, 10);
const COIN_RATE = "100 coins = ₹1";

let me = null, profile = null, isAdmin = false, tab = "home";

// ---------- Auth ----------
onAuthStateChanged(auth, async (user) => {
  me = user;
  if (!user) return showAuth();
  if (!user.emailVerified) return showVerify();
  await loadProfile();
  show("home");
});

async function loadProfile() {
  const ref = doc(db, "users", me.uid);
  let snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, { email: me.email, testCoins: 0, createdAt: serverTimestamp() });
    snap = await getDoc(ref);
  }
  profile = snap.data();
  // Admin status comes from the console-only "admins" collection. The UI check is
