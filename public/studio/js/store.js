/* ===========================================================
   store.js — everything persists in localStorage so the studio
   works with no database and no internet connection.
   =========================================================== */

const KEY = "joseph-math-studio-v1";
export const STUDIO_PASSWORD = "williamiscool123";

const BLANK = {
  users: [
    { id: "joseph", name: "Joseph", role: "teacher", passcode: "", avatar: "J", color: "#6ea8fe" },
  ],
  projects: [],
  chats: { class: [] },
  counter: 0,          // drives "Project 1", "Project 2", …
  session: null,       // { userId }
  unlocked: false,     // studio password accepted
};

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(BLANK);
    const parsed = JSON.parse(raw);
    return { ...structuredClone(BLANK), ...parsed };
  } catch {
    return structuredClone(BLANK);
  }
}

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    console.warn("Could not save (storage full?)", e);
  }
}

export const get = () => state;

/* ---------------- session ---------------- */
export const isUnlocked = () => !!state.unlocked;
export function unlock(pass) {
  if (pass !== STUDIO_PASSWORD) return false;
  state.unlocked = true;
  save();
  return true;
}
export function lock() {
  state.unlocked = false;
  state.session = null;
  save();
}
export const currentUser = () =>
  state.session ? state.users.find((u) => u.id === state.session.userId) || null : null;

export function signIn(userId) {
  state.session = { userId, at: Date.now() };
  save();
}
export function signOut() {
  state.session = null;
  save();
}

/* ---------------- users ---------------- */
export const users = () => state.users;
export function addUser({ name, role = "student", passcode = "" }) {
  const id = "u" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const palette = ["#6ea8fe", "#a78bfa", "#4ade80", "#fbbf24", "#f87171", "#38bdf8"];
  const user = {
    id,
    name: name.trim(),
    role,
    passcode,
    avatar: (name.trim()[0] || "?").toUpperCase(),
    color: palette[state.users.length % palette.length],
  };
  state.users.push(user);
  save();
  return user;
}
export function findUserByName(name) {
  const n = name.trim().toLowerCase();
  return state.users.find((u) => u.name.toLowerCase() === n) || null;
}

/* ---------------- projects ---------------- */
export const TYPES = {
  "3d": { label: "3D Creation", icon: "🧊" },
  "2d": { label: "2D Slides", icon: "🖼️" },
  whiteboard: { label: "Whiteboard", icon: "🧑‍🏫" },
  animation: { label: "Animation", icon: "🎬" },
  deck: { label: "Slide Project", icon: "📊" },
};

export function projectsFor(userId) {
  return state.projects
    .filter((p) => p.ownerId === userId)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}
export const projectById = (id) => state.projects.find((p) => p.id === id) || null;

export function createProject({ ownerId, type, mode, content }) {
  state.counter += 1;
  const p = {
    id: "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    ownerId,
    name: `Project ${state.counter}`,
    type,
    mode,                       // "ai" | "scratch"
    content: content || defaultContent(type),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  state.projects.push(p);
  state.chats[p.id] = state.chats[p.id] || [];
  save();
  return p;
}

export function updateProject(id, patch) {
  const p = projectById(id);
  if (!p) return null;
  Object.assign(p, patch, { updatedAt: Date.now() });
  save();
  return p;
}

export function deleteProject(id) {
  state.projects = state.projects.filter((p) => p.id !== id);
  delete state.chats[id];
  save();
}

/** Deletes a whole list of projects at once (the "delete all" button). */
export function deleteProjects(ids) {
  const gone = new Set(ids);
  state.projects = state.projects.filter((p) => !gone.has(p.id));
  for (const id of gone) delete state.chats[id];
  save();
  return gone.size;
}

export function duplicateProject(id) {
  const src = projectById(id);
  if (!src) return null;
  const copy = createProject({
    ownerId: src.ownerId,
    type: src.type,
    mode: src.mode,
    content: structuredClone(src.content),
  });
  updateProject(copy.id, { name: src.name + " copy" });
  return copy;
}

/* ---------------- starting content per project type ---------------- */
export function defaultContent(type) {
  switch (type) {
    case "3d":
      return {
        shape: "cube",
        params: { s: 1.6 },       // the letters in the shape's formula, e.g. r for a sphere
        drawing: null,            // what you drew on the pad, kept so you can change it
        useDrawing: false,
        drawDepth: 0.4,           // how thick the drawing comes out
        drawColours: true,        // keep the colours it was drawn in
        obj: null,                // pasted/loaded OBJ source
        color: "#6ea8fe",
        bg: "#0a0e14",
        wireframe: false,
        autoSpin: true,
        spinSpeed: 0.6,
        motion: "spin",           // spin | bob | orbit | pulse | none
        label: "",
      };
    case "2d":
      return {
        slides: [
          {
            id: "s1",
            bg: "#ffffff",
            elements: [
              { id: "e1", kind: "text", x: 8, y: 22, w: 84, text: "New lesson", size: 54, color: "#111827", bold: true, align: "center" },
              { id: "e2", kind: "text", x: 8, y: 46, w: 84, text: "Click any text to edit it.", size: 24, color: "#4b5563", align: "center" },
            ],
          },
        ],
      };
    case "whiteboard":
      return { items: [], widgets: [], camera: { x: 0, y: 0, z: 1 } };
    case "animation":
      return { duration: 6, fps: 30, bg: "#0b1220", layers: [] };
    case "deck":
      return {
        theme: "midnight",
        slides: [
          {
            id: "d1", layout: "title", title: "New lesson", subtitle: "Type your title on the right →",
            bullets: [], left: [], right: [], number: "", quote: "", src: "", notes: "",
          },
        ],
      };
    default:
      return {};
  }
}

/* ---------------- chat ---------------- */
export function chatRooms() {
  const rooms = [{ id: "class", name: "Class chat" }];
  for (const p of state.projects) rooms.push({ id: p.id, name: p.name });
  return rooms;
}
export const chatLog = (roomId) => state.chats[roomId] || (state.chats[roomId] = []);
export function pushChat(roomId, msg) {
  chatLog(roomId).push({ ...msg, at: Date.now() });
  save();
}

/* ---------------- import / export ---------------- */
export function exportAll() {
  return JSON.stringify(state, null, 2);
}
export function importAll(json) {
  const parsed = JSON.parse(json);
  state = { ...structuredClone(BLANK), ...parsed };
  save();
}
