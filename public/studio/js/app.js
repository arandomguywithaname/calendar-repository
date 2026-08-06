/* ===========================================================
   app.js — screens, sign-in flow, dashboard, project creation,
   editor loading and the chat drawer.
   =========================================================== */

import * as store from "./store.js";
import { generate, chatReply, checkAI } from "./ai.js";

const $ = (s) => document.querySelector(s);
const el = (t, cls, html) => {
  const n = document.createElement(t);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
};

const SCREENS = ["gate", "role", "profiles", "signin", "dashboard", "editor"];
function show(name) {
  SCREENS.forEach((s) => ($("#screen-" + s).hidden = s !== name));
}

export function toast(msg, ms = 2200) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(t._t);
  t._t = setTimeout(() => (t.hidden = true), ms);
}

/* ===================== 1. password gate ===================== */
$("#gate-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const val = $("#gate-pass").value;
  if (store.unlock(val)) {
    $("#gate-err").textContent = "";
    $("#gate-pass").value = "";
    show("role");
  } else {
    $("#gate-err").textContent = "Wrong password — ask Joseph.";
    $("#gate-pass").select();
  }
});
$("#btn-back-gate").addEventListener("click", () => {
  store.lock();
  show("gate");
});

/* ===================== 2. teacher or student ===================== */
$("#role-teacher").addEventListener("click", () => {
  const joseph = store.users().find((u) => u.role === "teacher");
  openSignIn(joseph || null, "teacher");
});
$("#role-student").addEventListener("click", () => {
  renderProfiles();
  show("profiles");
});
$("#btn-back-role").addEventListener("click", () => show("role"));

/* ===================== 3. student picker ===================== */
function renderProfiles() {
  const grid = $("#profile-grid");
  grid.innerHTML = "";
  // the teacher has his own entrance, so only students are listed here
  for (const u of store.users().filter((u) => u.role !== "teacher")) {
    const card = el("div", "profile");
    const av = el("div", "avatar", u.avatar);
    av.style.background = `linear-gradient(135deg, ${u.color}, #a78bfa)`;
    card.append(av, el("div", "name", u.name), el("div", "role", "Student"));
    card.addEventListener("click", () => openSignIn(u));
    grid.append(card);
  }
  const add = el("div", "profile add");
  add.append(el("div", "avatar", "+"), el("div", "name", "New student"), el("div", "role", "Make your own space"));
  add.addEventListener("click", () => openSignIn(null));
  grid.append(add);
}

/* ===================== 3. sign in ===================== */
let pendingUser = null;
let pendingRole = "student";

function openSignIn(user, role = "student") {
  pendingUser = user;
  pendingRole = user ? user.role : role;
  const av = $("#signin-avatar");
  av.textContent = user ? user.avatar : pendingRole === "teacher" ? "🧑‍🏫" : "+";
  av.style.background = user ? `linear-gradient(135deg, ${user.color}, #a78bfa)` : "var(--panel-2)";
  $("#signin-title").textContent = user
    ? `Sign in as ${user.name}`
    : pendingRole === "teacher" ? "Set up the teacher area" : "New student";
  $("#signin-sub").textContent = user
    ? user.role === "teacher"
      ? "The teacher area."
      : "Welcome back."
    : "Pick a name and a passcode you'll remember.";
  $("#lbl-name").hidden = !!user;
  $("#signin-name").hidden = !!user;
  $("#signin-name").value = "";
  $("#signin-code").value = "";
  $("#signin-hint").textContent =
    user && !user.passcode ? "No passcode set yet — type one now and it becomes yours." : "";
  $("#signin-err").textContent = "";
  $("#signin-btn").textContent = user ? "Sign in" : "Create profile";
  show("signin");
  setTimeout(() => (user ? $("#signin-code") : $("#signin-name")).focus(), 40);
}

$("#btn-back-profiles").addEventListener("click", () => {
  // back to whichever entrance you came in through
  if (pendingRole === "teacher") return show("role");
  renderProfiles();
  show("profiles");
});

$("#signin-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const code = $("#signin-code").value;
  const errEl = $("#signin-err");

  if (!pendingUser) {
    const name = $("#signin-name").value.trim();
    if (!name) return (errEl.textContent = "Please type a name.");
    if (store.findUserByName(name)) return (errEl.textContent = "That name is taken — pick it on the previous screen.");
    const u = store.addUser({ name, role: pendingRole, passcode: code });
    store.signIn(u.id);
  } else {
    if (!pendingUser.passcode) {
      pendingUser.passcode = code;
      store.save();
    } else if (pendingUser.passcode !== code) {
      return (errEl.textContent = "That passcode doesn't match.");
    }
    store.signIn(pendingUser.id);
  }
  openDashboard();
});

$("#btn-signout").addEventListener("click", () => {
  store.signOut();
  showEveryone = false;
  show("role");
});

/* ===================== 4. dashboard ===================== */
let filter = "all";
let showEveryone = false;      // teacher-only, and off unless asked for

function openDashboard() {
  const u = store.currentUser();
  if (!u) return show("profiles");
  $("#dash-hello").textContent = `Hi ${u.name} 👋`;
  $("#dash-sub").textContent = showEveryone
    ? "Showing everyone's work — click the button again for just yours."
    : "Your own projects, saved on this device.";
  // only Joseph gets the class view, and only when he turns it on
  $("#chip-everyone").hidden = u.role !== "teacher";
  $("#chip-everyone").classList.toggle("active", showEveryone);
  $("#who").innerHTML = "";
  const av = el("div", "avatar sm", u.avatar);
  av.style.background = `linear-gradient(135deg, ${u.color}, #a78bfa)`;
  $("#who").append(av, el("span", "", u.name));
  renderProjects();
  show("dashboard");
}

/**
 * Your dashboard shows your own projects and nothing else. Joseph can switch on
 * "Everyone's work" to see the whole class — but only when he asks for it, so
 * other people's projects never appear on a dashboard unannounced.
 */
function visibleProjects() {
  const u = store.currentUser();
  const mine = u.role === "teacher" && showEveryone;
  const all = mine
    ? store.get().projects.slice().sort((a, b) => b.updatedAt - a.updatedAt)
    : store.projectsFor(u.id);
  return filter === "all" ? all : all.filter((p) => p.type === filter);
}

function renderProjects() {
  const grid = $("#project-grid");
  grid.innerHTML = "";
  const list = visibleProjects();
  $("#dash-empty").hidden = list.length > 0;

  for (const p of list) {
    const card = el("div", "pcard");
    const t = store.TYPES[p.type];
    const thumb = el("div", "thumb", thumbFor(p));
    const meta = el("div", "meta");
    meta.append(
      el("div", "pname", escapeHtml(p.name)),
      el("div", "pinfo", `${t.icon} ${t.label} · ${p.mode === "ai" ? "AI" : "From scratch"} · ${timeAgo(p.updatedAt)}`)
    );
    const owner = store.get().users.find((u) => u.id === p.ownerId);
    if (store.currentUser().role === "teacher" && owner && owner.id !== store.currentUser().id) {
      meta.append(el("div", "pinfo", "by " + escapeHtml(owner.name)));
    }
    const row = el("div", "row");
    const editBtn = el("button", "btn sm primary", "✏️ Edit");
    const presentBtn = el("button", "btn sm", "▶ Present");
    const moreBtn = el("button", "btn sm", "⋯");
    moreBtn.title = "More";
    editBtn.onclick = (e) => { e.stopPropagation(); openEditor(p.id); };
    presentBtn.onclick = (e) => { e.stopPropagation(); presentProject(p.id); };
    moreBtn.onclick = (e) => { e.stopPropagation(); projectMenu(p.id); };
    row.append(editBtn, presentBtn, moreBtn);
    meta.append(row);
    card.append(thumb, meta);
    // selecting the card asks what you want to do with it
    card.addEventListener("click", () => projectMenu(p.id));
    grid.append(card);
  }
}

/** Shown when you select a project: edit it, present it, or manage it. */
function projectMenu(projectId) {
  const p = store.projectById(projectId);
  if (!p) return;
  const t = store.TYPES[p.type];
  const m = openModal();
  m.innerHTML = `
    <h1>${escapeHtml(p.name)}</h1>
    <p class="sub">${t.icon} ${t.label} · last worked on ${timeAgo(p.updatedAt)}</p>
    <div class="pick-grid">
      <button class="pick" data-do="edit"><span class="ico">✏️</span>
        <div class="t">Edit</div>
        <div class="d">Open it in the editor and keep working on it.</div></button>
      <button class="pick" data-do="present"><span class="ico">▶</span>
        <div class="t">Present</div>
        <div class="d">${escapeHtml(PRESENT_BLURB[p.type])}</div></button>
    </div>
    <div class="modal-actions">
      <button class="btn ghost" data-act="rename">Rename</button>
      <button class="btn ghost" data-act="copy">Make a copy</button>
      <button class="btn danger" data-act="delete">Delete</button>
      <button class="btn ghost" data-close>Cancel</button>
    </div>`;

  m.querySelector('[data-do="edit"]').onclick = () => { closeModal(); openEditor(p.id); };
  m.querySelector('[data-do="present"]').onclick = () => { closeModal(); presentProject(p.id); };
  m.querySelector('[data-act="rename"]').onclick = () => {
    const name = prompt("Name for this project:", p.name);
    if (name && name.trim()) {
      store.updateProject(p.id, { name: name.trim() });
      renderProjects();
      toast("Renamed");
    }
    closeModal();
  };
  m.querySelector('[data-act="copy"]').onclick = () => {
    store.duplicateProject(p.id);
    closeModal();
    renderProjects();
    toast("Copied");
  };
  m.querySelector('[data-act="delete"]').onclick = () => {
    confirmModal(`Delete "${p.name}"?`, "This cannot be undone.", () => {
      store.deleteProject(p.id);
      renderProjects();
      toast("Deleted");
    });
  };
}

const PRESENT_BLURB = {
  "3d": "Full screen, spinning, with no toolbars in the way.",
  "2d": "Full screen slideshow — arrow keys move through it.",
  whiteboard: "Full screen board, ready to show the class.",
  animation: "Full screen, playing on a loop.",
};

function thumbFor(p) {
  if (p.type === "2d") {
    const first = p.content.slides?.[0];
    const txt = first?.elements?.find((e) => e.kind === "text")?.text || "Slides";
    return `<div style="font-size:15px;padding:0 14px;text-align:center;color:#cfe0ff">${escapeHtml(txt.slice(0, 48))}</div>`;
  }
  if (p.type === "animation") return `🎬 <span style="font-size:15px;margin-left:8px;color:#cfe0ff">${p.content.layers?.length || 0} layers</span>`;
  if (p.type === "whiteboard") return `🧑‍🏫 <span style="font-size:15px;margin-left:8px;color:#cfe0ff">${(p.content.items?.length || 0) + (p.content.widgets?.length || 0)} things</span>`;
  return `🧊 <span style="font-size:15px;margin-left:8px;color:#cfe0ff">${p.content.shape || "model"}</span>`;
}

$("#filters").addEventListener("click", (e) => {
  const b = e.target.closest(".chip");
  if (!b) return;
  if (b.id === "chip-everyone") {
    showEveryone = !showEveryone;
    openDashboard();
    return;
  }
  filter = b.dataset.filter;
  [...$("#filters").querySelectorAll("[data-filter]")].forEach((c) => c.classList.toggle("active", c === b));
  renderProjects();
});

/* ---- delete everything currently listed ---- */
$("#btn-delete-all").addEventListener("click", () => {
  const list = visibleProjects();
  if (!list.length) return toast("There are no projects to delete.");

  const u = store.currentUser();
  const whose = showEveryone && u.role === "teacher" ? "everyone's" : "your";
  confirmModal(
    `Delete all ${list.length} ${list.length === 1 ? "project" : "projects"}?`,
    `This deletes ${whose} ${filter === "all" ? "" : store.TYPES[filter].label.toLowerCase() + " "}projects on this device. It cannot be undone.`,
    () => {
      const n = store.deleteProjects(list.map((p) => p.id));
      renderProjects();
      toast(`Deleted ${n} ${n === 1 ? "project" : "projects"}`);
    }
  );
});

/* ===================== new project flow ===================== */
$("#btn-new-project").addEventListener("click", pickType);

function pickType() {
  const m = openModal();
  m.innerHTML = `
    <h1>New project</h1>
    <p class="sub">What kind of creation is this?</p>
    <div class="pick-grid">
      <button class="pick" data-type="3d"><span class="ico">🧊</span>
        <div class="t">3D Creation</div>
        <div class="d">Spin a model around — a built-in shape or your own <b>.obj</b> file — and give it motion.</div></button>
      <button class="pick" data-type="2d"><span class="ico">🖼️</span>
        <div class="t">2D Slides</div>
        <div class="d">Slides you can edit and present full screen with the arrow keys.</div></button>
      <button class="pick" data-type="whiteboard"><span class="ico">🧑‍🏫</span>
        <div class="t">Whiteboard</div>
        <div class="d">Draw, type, stickers, copy/paste, code blocks and playable games like Tetris.</div></button>
      <button class="pick" data-type="animation"><span class="ico">🎬</span>
        <div class="t">Animation</div>
        <div class="d">Animate photos, videos, web images, stickers and 3D models on a timeline.</div></button>
      <button class="pick" data-type="deck"><span class="ico">📊</span>
        <div class="t">Slide Project</div>
        <div class="d">A tidy presentation: pick a layout, type into the boxes, and a theme keeps every slide matching. Speaker notes included.</div></button>
    </div>
    <div class="modal-actions"><button class="btn ghost" data-close>Cancel</button></div>`;
  m.querySelectorAll(".pick").forEach((b) => (b.onclick = () => pickMode(b.dataset.type)));
}

function pickMode(type) {
  const t = store.TYPES[type];
  const m = openModal();
  m.innerHTML = `
    <h1>${t.icon} ${t.label}</h1>
    <p class="sub">How do you want to start?</p>
    <div class="pick-grid">
      <button class="pick" data-mode="ai"><span class="ico">✨</span>
        <div class="t">With AI</div>
        <div class="d">Describe what you want and it gets built for you. You can still edit everything afterwards.</div></button>
      <button class="pick" data-mode="scratch"><span class="ico">✋</span>
        <div class="t">From scratch</div>
        <div class="d">Start with a blank canvas and build it yourself.</div></button>
    </div>
    <div class="modal-actions">
      <button class="btn ghost" data-back>← Back</button>
      <button class="btn ghost" data-close>Cancel</button>
    </div>`;
  m.querySelector("[data-back]").onclick = pickType;
  m.querySelectorAll(".pick").forEach((b) => (b.onclick = () => {
    if (b.dataset.mode === "scratch") {
      const p = store.createProject({ ownerId: store.currentUser().id, type, mode: "scratch" });
      closeModal();
      openEditor(p.id);
    } else {
      aiPrompt(type);
    }
  }));
}

const AI_EXAMPLES = {
  "3d": ["a spinning red torus", "a blue pyramid that bobs up and down", "a green sphere orbiting"],
  "2d": ["a lesson on adding fractions", "intro to the Pythagorean theorem", "5 slides about prime numbers"],
  whiteboard: ["a place value board with stickers", "long division steps plus a Tetris break", "a coding lesson with a code block"],
  animation: ["a rocket flying across the screen", "fractions turning into a pizza", "a bouncing triangle with a title"],
  deck: ["a 6 slide lesson on percentages", "times tables tips for year 5", "what is a prime number"],
};

function aiPrompt(type) {
  const t = store.TYPES[type];
  const m = openModal();
  m.innerHTML = `
    <h1>✨ Describe your ${t.label.toLowerCase()}</h1>
    <p class="sub">Say what you want in plain English — it gets built into the editor.</p>
    <div class="ai-box">
      <textarea id="ai-text" placeholder="e.g. ${AI_EXAMPLES[type][0]}"></textarea>
      <div class="ai-examples">${AI_EXAMPLES[type].map((x) => `<span class="chip">${escapeHtml(x)}</span>`).join("")}</div>
      <p class="hint" id="ai-status"></p>
    </div>
    <div class="modal-actions">
      <button class="btn ghost" data-back>← Back</button>
      <button class="btn primary" id="ai-go">Create it</button>
    </div>`;
  m.querySelector("[data-back]").onclick = () => pickMode(type);
  m.querySelectorAll(".ai-examples .chip").forEach((c) => (c.onclick = () => ($("#ai-text").value = c.textContent)));
  setTimeout(() => $("#ai-text").focus(), 40);

  checkAI().then((on) => {
    const status = $("#ai-status");
    if (status && !on) {
      status.textContent =
        "Claude isn't switched on for this studio, so it will be built by the offline builder instead — still fully editable.";
    }
  });

  m.querySelector("#ai-go").onclick = async () => {
    const prompt = $("#ai-text").value.trim();
    if (!prompt) return ($("#ai-status").textContent = "Type what you'd like first.");
    const btn = $("#ai-go");
    btn.disabled = true;
    $("#ai-status").innerHTML = `<span class="spinner"></span> Building it…`;
    const { content, source } = await generate(type, prompt);
    const p = store.createProject({ ownerId: store.currentUser().id, type, mode: "ai", content });
    store.updateProject(p.id, { prompt });
    closeModal();
    openEditor(p.id);
    toast(source === "claude" ? "Built with Claude ✨" : "Built offline (no API key) — fully editable");
  };
}

/* ===================== editor shell ===================== */
let activeEditor = null;
let activeProjectId = null;

async function openEditor(projectId) {
  const p = store.projectById(projectId);
  if (!p) return;
  activeProjectId = projectId;
  if (activeEditor?.destroy) activeEditor.destroy();
  const body = $("#editor-body");
  body.innerHTML = "";
  $("#editor-badge").textContent = store.TYPES[p.type].label;
  $("#project-title").value = p.name;
  setStatus("");
  show("editor");

  const api = {
    save(content) {
      store.updateProject(projectId, { content });
      setStatus("Saved");
    },
    status: setStatus,
    toast,
    project: p,
  };

  const mod = await loadEditor(p.type);
  activeEditor = mod.mount(body, p, api);
}

/* ===================== present mode ===================== */
const PRESENT_HINT = {
  "3d": "Drag to spin · scroll to zoom",
  "2d": "← → or click to change slide",
  whiteboard: "Drag to move around · scroll to zoom",
  animation: "Click the picture to pause or play",
};

let presenting = null;

async function presentProject(projectId) {
  const p = store.projectById(projectId);
  if (!p) return;
  if (presenting) exitPresent();

  const shell = el("div", "present-shell");
  const bar = el("div", "present-bar");
  bar.innerHTML = `<b>${escapeHtml(p.name)}</b>
    <span class="mini">${escapeHtml(PRESENT_HINT[p.type] || "")}</span>
    <span class="grow"></span>
    <button class="btn sm ghost" id="present-exit">✕ Exit</button>`;
  const host = el("div", "present-host presenting");
  shell.append(bar, host);
  document.body.append(shell);

  const api = {
    save(content) { store.updateProject(projectId, { content }); },
    status() {},
    toast,
    project: p,
  };

  const mod = await loadEditor(p.type);
  const inst = mod.mount(host, p, api, { present: true });
  presenting = { shell, inst };

  bar.querySelector("#present-exit").onclick = exitPresent;
  document.addEventListener("keydown", onPresentKey);
  shell.requestFullscreen?.().catch(() => {});
}

function exitPresent() {
  if (!presenting) return;
  document.removeEventListener("keydown", onPresentKey);
  presenting.inst?.destroy?.();
  presenting.shell.remove();
  presenting = null;
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  renderProjects();
}

function onPresentKey(e) {
  if (e.key === "Escape") exitPresent();
}

/**
 * Each editor is loaded on demand. The import paths are written out in full on
 * purpose — a computed path can't be followed by a bundler, which silently
 * breaks the single-file build (the editor 404s at the moment you open it).
 */
const EDITORS = {
  "3d": () => import("./editors/threed.js"),
  "2d": () => import("./editors/slides.js"),
  whiteboard: () => import("./editors/whiteboard.js"),
  animation: () => import("./editors/animation.js"),
  deck: () => import("./editors/deck.js"),
};
const loadEditor = (type) => (EDITORS[type] || EDITORS.animation)();

let statusTimer;
function setStatus(msg) {
  $("#save-status").textContent = msg;
  clearTimeout(statusTimer);
  if (msg) statusTimer = setTimeout(() => ($("#save-status").textContent = ""), 1600);
}

$("#btn-back-dash").addEventListener("click", () => {
  if (activeEditor?.destroy) activeEditor.destroy();
  activeEditor = null;
  activeProjectId = null;
  openDashboard();
});

$("#btn-editor-present").addEventListener("click", () => {
  if (activeProjectId) presentProject(activeProjectId);
});

$("#project-title").addEventListener("change", (e) => {
  if (!activeProjectId) return;
  const name = e.target.value.trim() || "Untitled";
  e.target.value = name;
  store.updateProject(activeProjectId, { name });
  setStatus("Renamed");
});

/* ===================== modal helpers ===================== */
function openModal() {
  $("#modal-back").hidden = false;
  const m = $("#modal");
  m.innerHTML = "";
  return m;
}
function closeModal() {
  $("#modal-back").hidden = true;
  $("#modal").innerHTML = "";
}
$("#modal-back").addEventListener("click", (e) => {
  if (e.target.id === "modal-back" || e.target.hasAttribute("data-close")) closeModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !$("#modal-back").hidden) closeModal();
});

function confirmModal(title, body, onYes) {
  const m = openModal();
  m.style.maxWidth = "440px";
  m.innerHTML = `<h1>${escapeHtml(title)}</h1><p class="sub">${escapeHtml(body)}</p>
    <div class="modal-actions"><button class="btn ghost" data-close>Cancel</button>
    <button class="btn danger" id="yes">Yes, delete</button></div>`;
  m.querySelector("#yes").onclick = () => { closeModal(); m.style.maxWidth = ""; onYes(); };
}

/* ===================== chat drawer ===================== */
const drawer = $("#chat-drawer");
function openChat(roomId) {
  drawer.hidden = false;
  const sel = $("#chat-room");
  sel.innerHTML = store.chatRooms().map((r) => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join("");
  sel.value = roomId && store.chatRooms().some((r) => r.id === roomId) ? roomId : "class";
  renderChat();
}
$("#btn-open-chat").addEventListener("click", () => openChat("class"));
$("#btn-editor-chat").addEventListener("click", () => openChat(activeProjectId));
$("#chat-close").addEventListener("click", () => (drawer.hidden = true));
$("#chat-room").addEventListener("change", renderChat);

function renderChat() {
  const room = $("#chat-room").value;
  const log = $("#chat-log");
  const me = store.currentUser();
  log.innerHTML = "";
  for (const m of store.chatLog(room)) {
    const d = el("div", "msg " + (m.ai ? "ai" : m.userId === me.id ? "me" : ""));
    d.append(el("div", "from", escapeHtml(m.from)));
    d.append(el("div", "", escapeHtml(m.text).replace(/\n/g, "<br>")));
    log.append(d);
  }
  log.scrollTop = log.scrollHeight;
}

$("#chat-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = $("#chat-input");
  const text = input.value.trim();
  if (!text) return;
  const me = store.currentUser();
  const room = $("#chat-room").value;
  store.pushChat(room, { from: me.name, userId: me.id, text });
  input.value = "";
  renderChat();

  if (/^@claude/i.test(text)) {
    store.pushChat(room, { from: "Claude", ai: true, text: "…thinking" });
    renderChat();
    const history = store.chatLog(room).slice(-8).map((m) => ({
      role: m.ai ? "assistant" : "user",
      content: m.text,
    }));
    const reply = await chatReply(history);
    const log = store.chatLog(room);
    log[log.length - 1].text = reply;
    store.save();
    renderChat();
  }
});

/* ===================== utils ===================== */
export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function timeAgo(ts) {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return Math.floor(s / 60) + "m ago";
  if (s < 86400) return Math.floor(s / 3600) + "h ago";
  return Math.floor(s / 86400) + "d ago";
}

/* ===================== boot ===================== */
(function boot() {
  if (store.isUnlocked() && store.currentUser()) openDashboard();
  else if (store.isUnlocked()) show("role");
  else show("gate");
})();
