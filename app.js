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
  try {
    await loadProfile();
    show("home");
  } catch (e) {
    app.innerHTML = `<div class="card center" style="margin-top:15vh"><h2>Could not load your account</h2>
      <p class="muted">Check that the Firestore database exists and the rules are published. (${esc(e.code || e.message)})</p>
      <button class="full" id="lo">Log out</button></div>`;
    $("#lo").onclick = () => signOut(auth);
  }
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
  // just for display; the Firestore rules are what really enforce it.
  try {
    const s = await getDoc(doc(db, "admins", me.uid));
    isAdmin = s.exists() && s.data().enabled === true;
  } catch {
    isAdmin = false;
  }
}

function showAuth(mode = "login") {
  const login = mode === "login";
  app.innerHTML = `<div class="center" style="margin-top:12vh"><h1>My Reward</h1>
    <p class="muted">Test mode · no real money</p></div>
    <div class="card"><input id="em" type="email" placeholder="Email" autocomplete="email">
    <input id="pw" type="password" placeholder="Password (6+ characters)" autocomplete="${login ? "current-password" : "new-password"}">
    <button class="full" id="go">${login ? "Log in" : "Create account"}</button>
    <p class="muted center" style="margin-top:12px"><a href="#" id="sw" style="color:var(--p2)">${login ? "New here? Sign up" : "Have an account? Log in"}</a></p></div>`;
  $("#sw").onclick = (e) => { e.preventDefault(); showAuth(login ? "signup" : "login"); };
  $("#go").onclick = async () => {
    const email = $("#em").value.trim(), pw = $("#pw").value;
    try {
      if (login) await signInWithEmailAndPassword(auth, email, pw);
      else { const c = await createUserWithEmailAndPassword(auth, email, pw); await sendEmailVerification(c.user); toast("Verification email sent"); }
    } catch (e) { toast(e.code?.replace("auth/", "").replace(/-/g, " ") || "Error"); }
  };
}

function showVerify() {
  app.innerHTML = `<div class="card center" style="margin-top:15vh"><h2>Verify your email</h2>
    <p class="muted">We sent a link to ${esc(me.email)}. Open it, then tap the button below. Check spam too.</p>
    <button class="full" id="chk">I have verified</button>
    <button class="full alt" id="re">Resend email</button>
    <button class="full alt" id="lo">Log out</button></div>`;
  $("#chk").onclick = async () => { await me.reload(); me.emailVerified ? location.reload() : toast("Not verified yet"); };
  $("#re").onclick = async () => { try { await sendEmailVerification(me); toast("Email sent"); } catch { toast("Wait a minute and retry"); } };
  $("#lo").onclick = () => signOut(auth);
}

// ---------- Layout ----------
function show(t) {
  if (t === "admin" && !isAdmin) t = "home";
  tab = t;
  const tabs = [["home", "Home"], ["quiz", "Quiz"], ["tasks", "Tasks"], ["redeem", "Redeem"], ["history", "History"]];
  if (isAdmin) tabs.push(["admin", "Admin"]);
  app.innerHTML = `<div class="row"><h1>My Reward</h1><button class="alt" id="lo">Log out</button></div>
    <div id="view"></div><nav>${tabs.map(([k, n]) => `<button data-t="${k}" class="${k === t ? "on" : ""}">${n}</button>`).join("")}</nav>`;
  $("#lo").onclick = () => signOut(auth);
  document.querySelectorAll("nav button").forEach((b) => (b.onclick = () => show(b.dataset.t)));
  ({ home, quiz, tasks, redeem, history, admin })[t]();
}

async function refresh() { await loadProfile(); show(tab); }

// Test-mode award: one batch = new transaction + coin increase (+ optional extra writes).
// Firestore rules only accept it if the transaction is new and the amount matches.
async function award(txId, type, amount, note, ref, extra) {
  const b = writeBatch(db);
  b.set(doc(db, "users", me.uid, "tx", txId), { type, amount, note, ref, createdAt: serverTimestamp() });
  b.update(doc(db, "users", me.uid), { testCoins: increment(amount), lastTx: txId });
  if (extra) extra(b);
  await b.commit();
}
const done = async (txId) => (await getDoc(doc(db, "users", me.uid, "tx", txId))).exists();

// ---------- Home ----------
function home() {
  $("#view").innerHTML = `<div class="card hero"><p class="muted">Your test coins</p>
    <div class="coins">${profile.testCoins} 🪙</div>
    <span class="pill">≈ ₹${rupees(profile.testCoins)} · ${COIN_RATE}</span></div>
    <div class="card"><b>Test mode</b><p class="muted">These coins are for testing only. They have no cash value and cannot be withdrawn.</p></div>
    <div class="card"><b>Earn coins</b><p class="muted">Play the daily quiz, finish tasks from the admin, or redeem a code.</p></div>`;
}

// ---------- Quiz ----------
const QUESTIONS = [
  ["What is the capital of India?", ["Mumbai", "New Delhi", "Chennai"], 1],
  ["How many days are in a leap year?", ["365", "366", "364"], 1],
  ["Which planet is known as the Red Planet?", ["Mars", "Venus", "Jupiter"], 0],
];
async function quiz() {
  const id = "quiz_" + today();
  if (await done(id)) return ($("#view").innerHTML = `<div class="card center"><h2>Quiz complete</h2><p class="muted">You already earned today's coins. Come back tomorrow.</p></div>`);
  let i = 0, score = 0;
  const ask = () => {
    if (i >= QUESTIONS.length) return finish();
    const [q, opts, ans] = QUESTIONS[i];
    $("#view").innerHTML = `<div class="card"><p class="muted">Question ${i + 1} of ${QUESTIONS.length} · 5 test coins each</p><h2>${esc(q)}</h2>
      ${opts.map((o, k) => `<button class="opt" data-k="${k}">${esc(o)}</button>`).join("")}</div>`;
    document.querySelectorAll(".opt").forEach((b) => (b.onclick = () => {
      const k = +b.dataset.k; if (k === ans) score++;
      document.querySelectorAll(".opt").forEach((x) => { x.disabled = true; x.classList.add(+x.dataset.k === ans ? "right" : "wrong"); if (+x.dataset.k !== ans && +x.dataset.k !== k) x.classList.remove("wrong"); });
      setTimeout(() => { i++; ask(); }, 900);
    }));
  };
  const finish = async () => {
    const coins = score * 5;
    if (!coins) return ($("#view").innerHTML = `<div class="card center"><h2>0 of 3 correct</h2><button class="full" id="again">Try again</button></div>`, ($("#again").onclick = quiz));
    try { await award(id, "quiz", coins, `Daily quiz: ${score}/3`, ""); toast(`+${coins} test coins`); refresh(); }
    catch { toast("Could not save reward"); }
  };
  ask();
}

// ---------- Tasks ----------
async function tasks() {
  $("#view").innerHTML = `<h2>Tasks</h2><div id="list" class="muted">Loading…</div>`;
  const snap = await getDocs(collection(db, "tasks"));
  const items = await Promise.all(snap.docs.map(async (d) => ({ id: d.id, ...d.data(), got: await done("task_" + d.id) })));
  $("#list").innerHTML = items.length ? items.map((t) => `<div class="card row"><div><b>${esc(t.title)}</b><p class="muted">${esc(t.desc)}</p></div>
    <button data-id="${t.id}" ${t.got ? "disabled" : ""}>${t.got ? "Done" : `+${t.reward} 🪙`}</button></div>`).join("") : `<div class="card center muted">No tasks yet. Check back soon.</div>`;
  document.querySelectorAll("#list button").forEach((b) => (b.onclick = async () => {
    const t = items.find((x) => x.id === b.dataset.id);
    try { await award("task_" + t.id, "task", t.reward, t.title, t.id); toast(`+${t.reward} test coins`); refresh(); }
    catch { toast("Could not claim task"); }
  }));
}

// ---------- Redeem ----------
function redeem() {
  $("#view").innerHTML = `<h2>Redeem a code</h2><div class="card"><input id="code" placeholder="Enter code" autocapitalize="characters">
    <button class="full" id="go">Redeem</button></div>`;
  $("#go").onclick = async () => {
    const code = $("#code").value.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{3,30}$/.test(code)) return toast("Invalid code format");
    try {
      const snap = await getDoc(doc(db, "codes", code));
      if (!snap.exists() || snap.data().used) return toast("Code not valid or already used");
      const reward = snap.data().reward;
      await award("code_" + code, "code", reward, "Code " + code, code,
        (b) => b.update(doc(db, "codes", code), { used: true, usedBy: me.uid }));
      toast(`+${reward} test coins`); refresh();
    } catch { toast("Could not redeem code"); }
  };
}

// ---------- History ----------
async function history() {
  $("#view").innerHTML = `<h2>Transaction history</h2><div id="list" class="muted">Loading…</div>`;
  const snap = await getDocs(query(collection(db, "users", me.uid, "tx"), orderBy("createdAt", "desc"), limit(50)));
  $("#list").innerHTML = snap.empty ? `<div class="card center muted">No transactions yet.</div>` : snap.docs.map((d) => {
    const t = d.data();
    return `<div class="card row"><div><b>${esc(t.note)}</b><p class="muted">${esc(t.type)} · ${t.createdAt?.toDate().toLocaleString() ?? ""}</p></div><span class="plus">+${t.amount}</span></div>`;
  }).join("");
}

// ---------- Admin ----------
async function admin() {
  $("#view").innerHTML = `<h2>Admin</h2>
    <div class="card"><b>New task</b><input id="tt" placeholder="Title"><input id="td" placeholder="Description">
      <input id="tr" type="number" min="1" max="100" placeholder="Reward (1-100 test coins)"><button class="full" id="addT">Add task</button></div>
    <div class="card"><b>New redeem code</b><input id="cc" placeholder="CODE (letters/numbers)"><input id="cr" type="number" min="1" max="100" placeholder="Reward (1-100)">
      <button class="full" id="addC">Add code</button></div>
    <h2>Tasks</h2><div id="tl"></div><h2>Codes</h2><div id="cl"></div><h2>Users</h2><div id="ul"></div>`;
  $("#addT").onclick = async () => {
    const reward = parseInt($("#tr").value), title = $("#tt").value.trim();
    if (!title || !(reward >= 1 && reward <= 100)) return toast("Enter a title and reward 1-100");
    await setDoc(doc(collection(db, "tasks")), { title, desc: $("#td").value.trim(), reward, createdAt: serverTimestamp() });
    admin();
  };
  $("#addC").onclick = async () => {
    const code = $("#cc").value.trim().toUpperCase(), reward = parseInt($("#cr").value);
    if (!/^[A-Z0-9_-]{3,30}$/.test(code) || !(reward >= 1 && reward <= 100)) return toast("Code 3-30 chars, reward 1-100");
    await setDoc(doc(db, "codes", code), { reward, used: false, usedBy: "" });
    admin();
  };
  const list = (el, snap, html, col) => {
    $(el).innerHTML = snap.docs.map((d) => html(d)).join("") || `<p class="muted">Nothing yet.</p>`;
    $(el).querySelectorAll("[data-del]").forEach((b) => (b.onclick = async () => { await deleteDoc(doc(db, col, b.dataset.del)); admin(); }));
  };
  list("#tl", await getDocs(collection(db, "tasks")), (d) => `<div class="card row"><div><b>${esc(d.data().title)}</b><p class="muted">${d.data().reward} coins</p></div><button class="bad" data-del="${d.id}">Delete</button></div>`, "tasks");
  list("#cl", await getDocs(collection(db, "codes")), (d) => `<div class="card row"><div><b>${esc(d.id)}</b><p class="muted">${d.data().reward} coins · ${d.data().used ? "used" : "unused"}</p></div><button class="bad" data-del="${d.id}">Delete</button></div>`, "codes");
  const us = await getDocs(collection(db, "users"));
  $("#ul").innerHTML = us.docs.map((d) => `<div class="card row"><div><b>${esc(d.data().email)}</b><p class="muted">${d.data().testCoins} coins${d.data().banned ? " · banned" : ""}</p></div>
    ${d.id === me.uid ? "" : `<button class="alt" data-ban="${d.id}" data-b="${!d.data().banned}">${d.data().banned ? "Unban" : "Ban"}</button>`}</div>`).join("");
  $("#ul").querySelectorAll("[data-ban]").forEach((b) => (b.onclick = async () => { await updateDoc(doc(db, "users", b.dataset.ban), { banned: b.dataset.b === "true" }); admin(); }));
    }// ---------- Google Play Gift Card Test Store ----------
async function redeemStore() {
  $("#view").innerHTML = `
    <h2>Google Play Gift Card</h2>

    <div class="card hero">
      <p class="muted">Available Test Coins</p>
      <div class="coins">${profile.testCoins} 🪙</div>
    </div>

    <div class="card">
      <h3>Google Play Gift Card</h3>
      <h2>₹10</h2>
      <p class="muted">1000 Test Coins required</p>
      <button class="full" id="requestGift">
        Request Gift Card
      </button>
      <p class="muted">Demo only. No real gift card is issued.</p>
    </div>
  `;

  $("#requestGift").onclick = () => {
    if (profile.testCoins < 1000) {
      return toast("Need 1000 test coins");
    }

    toast("Demo request screen ready. No coins deducted.");
  };
}

