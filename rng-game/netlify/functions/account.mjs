/* account.mjs — Netlify Function for online accounts: a 7-digit ID loads the same save on any device,
   and a short "roll lease" lets only one device roll on an account at a time.

   POST /.netlify/functions/account with JSON { action, ... }:
     ping                                   is the server there?
     create  { name, device, save, preferId }  new account; preferId keeps an ID made before accounts went online
     load    { id }                         the account's save
     peek    { id }                         the account's revision only (cheap "has it changed?" check)
     claim   { id, device, rev }            take or renew the roll lease; returns the newest save if `rev` is old
     save    { id, device, rev, save }      store a new save; refused while another device holds the lease
     release { id, device }                 give the lease back (tab closed, logged out)
     admin   { key, op, ... }               owner tools, locked by the admin password (see ADMIN_HASH):
               list                             every account with its aura count, coins and luck
               erase    { id, aura }            remove one aura (both forms) or, without `aura`, every aura
               coins    { id, amount }          add coins (a negative amount takes them away)
               luck     { id, mult, rolls }     add a luck boost for a number of rolls
               eraseAll { except: [ids] }       remove every aura on every account except the ones listed

   Error codes in replies match the game's: 145 two devices rolling at once, 98 account problem,
   404 server or network problem. */
import { createHash, randomInt, scrypt, timingSafeEqual } from "node:crypto";
import { getStore } from "../vendor/netlify-blobs.mjs";

const STORE_NAME = "aura-realms";
const LEASE_MS = 20000;   /* a device keeps rolling rights this long after its last roll or renewal */
const CONTEST_MS = 30000; /* how long the rolling device keeps hearing that another device tried */
const MAX_SAVE_CHARS = 1000000;
const ID_RE = /^\d{7}$/;
const DEVICE_RE = /^[a-z0-9]{8,40}$/;
const NAME_RE = /^[\p{L}\p{N} _'.-]+$/u;
const DUAL_MSG = "You are rolling on two devices simultaneously. Only one device can roll on an account at a time.";
const ADMIN_DEVICE = "admin"; /* recorded as the last writer of admin edits; too short to be a real device ID */
/* The admin password, stored only as an scrypt hash so reading this file doesn't reveal it. To change it, run
   node -e "const c=require('crypto'),s=c.randomBytes(16).toString('hex');console.log(s,c.scryptSync('NEW PASSWORD',s,32,{N:16384,r:8,p:1}).toString('hex'))"
   and paste the two values here; also update ADMIN_PW in game.js, which checks the same password in the browser.
   An ADMIN_KEY environment variable in Netlify, if set, is used instead of the built-in password. */
const ADMIN_SALT = "bdc221214b42e7e3e3de23737b9c3a57";
const ADMIN_HASH = "9746b9f763102389b6b66dd6966db0ddd399da13fa85b6e8f8e245fbb89dac0a";

const accountKey = (id) => "account/" + id;
const leaseKey = (id) => "lease/" + id;

/** JSON reply that is never cached. */
function reply(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}

/** The save object if it looks like a game save and is not too big, otherwise null. */
function checkSave(save) {
  if (!save || typeof save !== "object" || Array.isArray(save) || typeof save.rolls !== "number") return null;
  return JSON.stringify(save).length <= MAX_SAVE_CHARS ? save : null;
}

/** True when `given` is the admin password: the ADMIN_KEY environment variable if set, else the built-in hash. */
async function adminKeyOk(given, envKey) {
  if (envKey) {
    const a = createHash("sha256").update(String(given || "")).digest();
    const b = createHash("sha256").update(String(envKey)).digest();
    return timingSafeEqual(a, b);
  }
  const got = await new Promise((resolve, reject) => scrypt(String(given || ""), ADMIN_SALT, 32, { N: 16384, r: 8, p: 1 }, (e, k) => (e ? reject(e) : resolve(k))));
  return timingSafeEqual(got, Buffer.from(ADMIN_HASH, "hex"));
}

/** Run `fn` over `items`, at most `limit` at a time. */
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => { while (next < items.length) { const i = next++; out[i] = await fn(items[i]); } };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/** Remove one aura (both forms) or, when auraId is null, every aura from a save, and clear anything
    that pointed at a removed aura. Returns how many owned auras were removed. */
function eraseAuras(save, auraId) {
  const drop = (id) => auraId === null || Number(id) === auraId;
  let removed = 0;
  for (const bag of ["inventory", "shinyInventory"]) {
    const inv = save[bag] && typeof save[bag] === "object" ? save[bag] : {};
    for (const k of Object.keys(inv)) if (drop(k)) { if (inv[k] > 0) removed++; delete inv[k]; }
    save[bag] = inv;
  }
  if (save.equipped != null && drop(save.equipped)) { save.equipped = null; save.equippedShiny = false; }
  if (save.lastRoll != null && drop(save.lastRoll)) { save.lastRoll = null; save.lastShiny = false; }
  if (Array.isArray(save.history)) save.history = save.history.filter((h) => !drop(typeof h === "number" ? h : h && h.id));
  if (save.stats && save.stats.best != null && drop(save.stats.best)) { save.stats.best = null; save.stats.bestShiny = false; }
  return removed;
}

/** The numbers the admin list shows for one account. */
function summary(acct) {
  const s = acct.save || {};
  const owned = (o) => Object.keys(o || {}).filter((k) => o[k] > 0).length;
  const luck = (Array.isArray(s.luckEffects) ? s.luckEffects : []).reduce((m, e) => Math.max(m, Number(e && e.mult) || 1), 1);
  return { id: acct.id, name: acct.name, auras: owned(s.inventory) + owned(s.shinyInventory), coins: Math.floor(Number(s.coins) || 0), luck, rolls: Number(s.rolls) || 0, updatedAt: acct.updatedAt };
}

/** Apply an admin change to an account's save and store it as a new revision; players' devices then load it. */
async function adminEdit(store, id, now, change) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const cur = await store.getWithMetadata(accountKey(id), { type: "json" });
    if (!cur) return null;
    const acct = cur.data;
    const save = acct.save && typeof acct.save === "object" ? acct.save : { rolls: 0, coins: 0 };
    const result = change(save);
    const next = { ...acct, save, rev: acct.rev + 1, updatedAt: now, device: ADMIN_DEVICE };
    const res = await store.setJSON(accountKey(id), next, { onlyIfMatch: cur.etag });
    if (res.modified) return { acct: next, result };
  }
  throw new Error("Account " + id + " kept changing; try again.");
}

/** Every account ID in the store. */
async function allIds(store) {
  const { blobs } = await store.list({ prefix: "account/" });
  return blobs.map((b) => b.key.slice("account/".length)).filter((id) => ID_RE.test(id));
}

/** A name with spaces tidied, or null if it breaks the game's name rules. */
function cleanName(raw) {
  const name = String(raw || "").trim().replace(/\s+/g, " ");
  return name.length >= 2 && name.length <= 50 && NAME_RE.test(name) ? name : null;
}

const ACTIONS = {
  async ping() {
    return reply(200, { ok: true });
  },

  async create(body, store, now) {
    const name = cleanName(body.name);
    if (!name) return reply(400, { ok: false, code: 98, error: "Name must be 2 to 50 characters: letters, numbers, spaces, _ ' . or -" });
    const save = body.save == null ? null : checkSave(body.save);
    if (body.save != null && !save) return reply(400, { ok: false, code: 98, error: "That save is not valid." });
    const prefer = ID_RE.test(String(body.preferId)) ? String(body.preferId) : null;
    for (let i = 0; i < 25; i++) {
      const id = i === 0 && prefer ? prefer : String(randomInt(1000000, 10000000));
      const record = { id, name, created: now, updatedAt: now, rev: 1, device: body.device, save };
      const res = await store.setJSON(accountKey(id), record, { onlyIfNew: true });
      if (res.modified) return reply(200, { ok: true, id, name, rev: 1 });
    }
    return reply(503, { ok: false, code: 404, error: "Could not find a free ID. Try again." });
  },

  async load(body, store) {
    const acct = await store.get(accountKey(body.id), { type: "json" });
    if (!acct) return reply(404, { ok: false, code: 98, error: "No player with ID " + body.id + "." });
    return reply(200, { ok: true, id: acct.id, name: acct.name, rev: acct.rev, save: acct.save, updatedAt: acct.updatedAt, by: acct.device === ADMIN_DEVICE ? "admin" : undefined });
  },

  async peek(body, store) {
    const acct = await store.get(accountKey(body.id), { type: "json" });
    if (!acct) return reply(404, { ok: false, code: 98, error: "No player with ID " + body.id + "." });
    return reply(200, { ok: true, id: acct.id, name: acct.name, rev: acct.rev });
  },

  async claim(body, store, now) {
    const acct = await store.get(accountKey(body.id), { type: "json" });
    if (!acct) return reply(404, { ok: false, code: 98, error: "No player with ID " + body.id + "." });
    for (let attempt = 0; attempt < 3; attempt++) {
      const cur = await store.getWithMetadata(leaseKey(body.id), { type: "json" });
      const lease = cur ? cur.data : null;
      if (lease && lease.device !== body.device && lease.until > now) {
        /* Tell the device that is rolling, too: it sees this on its next renewal. */
        await store.setJSON(leaseKey(body.id), { ...lease, contest: { device: body.device, at: now } }, { onlyIfMatch: cur.etag });
        return reply(409, { ok: false, code: 145, error: DUAL_MSG, waitMs: lease.until - now });
      }
      const mine = !!lease && lease.device === body.device;
      const contestAt = mine && lease.contest && now - lease.contest.at < CONTEST_MS ? lease.contest.at : 0;
      const next = { device: body.device, until: now + LEASE_MS, contest: mine ? lease.contest || null : null };
      const res = cur ? await store.setJSON(leaseKey(body.id), next, { onlyIfMatch: cur.etag }) : await store.setJSON(leaseKey(body.id), next, { onlyIfNew: true });
      if (res.modified) {
        const out = { ok: true, leaseMs: LEASE_MS, rev: acct.rev, contestAt };
        /* Another device played since this one last synced: hand it the newest save before it rolls.
           (If this device made the newer save itself, its upload's reply just hasn't arrived yet.) */
        if (acct.rev !== body.rev && acct.device !== body.device) { out.save = acct.save; out.name = acct.name; if (acct.device === ADMIN_DEVICE) out.by = "admin"; }
        return reply(200, out);
      }
    }
    return reply(409, { ok: false, code: 145, error: DUAL_MSG, waitMs: LEASE_MS });
  },

  async save(body, store, now) {
    const save = checkSave(body.save);
    if (!save) return reply(400, { ok: false, code: 98, error: "That save is not valid." });
    const lease = await store.get(leaseKey(body.id), { type: "json" });
    if (lease && lease.device !== body.device && lease.until > now) return reply(409, { ok: false, code: 145, error: DUAL_MSG, waitMs: lease.until - now });
    for (let attempt = 0; attempt < 3; attempt++) {
      const cur = await store.getWithMetadata(accountKey(body.id), { type: "json" });
      if (!cur) return reply(404, { ok: false, code: 98, error: "No player with ID " + body.id + "." });
      const acct = cur.data;
      /* Someone else saved since this device last synced: send theirs back instead of overwriting it.
         A matching device means our own earlier save landed but its reply was lost, so it is safe. */
      if (acct.rev !== body.rev && acct.device !== body.device) {
        return reply(409, { ok: false, code: 98, error: "This account was changed on another device.", rev: acct.rev, save: acct.save, name: acct.name, by: acct.device === ADMIN_DEVICE ? "admin" : undefined });
      }
      const next = { ...acct, save, rev: acct.rev + 1, updatedAt: now, device: body.device };
      const res = await store.setJSON(accountKey(body.id), next, { onlyIfMatch: cur.etag });
      if (res.modified) return reply(200, { ok: true, rev: next.rev });
    }
    return reply(409, { ok: false, code: 98, error: "The account is busy. Try again." });
  },

  async admin(body, store, now, env) {
    if (!(await adminKeyOk(body.key, env.ADMIN_KEY))) {
      await new Promise((r) => setTimeout(r, 400)); /* slows down guessing */
      return reply(403, { ok: false, code: 98, error: "Wrong admin password." });
    }
    if (body.op === "list") {
      const accts = await mapLimit(await allIds(store), 10, (id) => store.get(accountKey(id), { type: "json" }));
      return reply(200, { ok: true, accounts: accts.filter(Boolean).map(summary).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)) });
    }
    if (body.op === "eraseAll") {
      const keep = new Set((Array.isArray(body.except) ? body.except : []).map(String).filter((id) => ID_RE.test(id)));
      if (!keep.size) return reply(400, { ok: false, code: 98, error: "Give at least one account ID to keep." });
      const ids = (await allIds(store)).filter((id) => !keep.has(id));
      const done = await mapLimit(ids, 10, (id) => adminEdit(store, id, now, (save) => eraseAuras(save, null)));
      const hit = done.filter(Boolean);
      return reply(200, { ok: true, accounts: hit.length, removed: hit.reduce((n, d) => n + d.result, 0), kept: [...keep] });
    }
    if (!ID_RE.test(String(body.id))) return reply(400, { ok: false, code: 98, error: "An ID is 7 digits." });
    let change;
    if (body.op === "erase") {
      const auraId = body.aura == null ? null : Number(body.aura);
      if (auraId !== null && !(Number.isInteger(auraId) && auraId >= 0)) return reply(400, { ok: false, code: 98, error: "Unknown aura." });
      change = (save) => eraseAuras(save, auraId);
    } else if (body.op === "coins") {
      const amount = Math.trunc(Number(body.amount));
      if (!Number.isFinite(amount) || amount === 0 || Math.abs(amount) > 1e12) return reply(400, { ok: false, code: 98, error: "Coins must be a whole number, up to 1,000,000,000,000." });
      change = (save) => { save.coins = Math.max(0, Math.floor(Number(save.coins) || 0) + amount); return save.coins; };
    } else if (body.op === "luck") {
      const mult = Number(body.mult), rolls = Math.trunc(Number(body.rolls));
      if (!(mult > 1 && mult <= 1e9) || !(rolls >= 1 && rolls <= 1e6)) return reply(400, { ok: false, code: 98, error: "Luck needs a multiplier above 1 (up to 1,000,000,000) and 1 to 1,000,000 rolls." });
      change = (save) => { if (!Array.isArray(save.luckEffects)) save.luckEffects = []; save.luckEffects.push({ mult, rolls }); return mult; };
    } else {
      return reply(400, { ok: false, code: 98, error: "Unknown admin command." });
    }
    const done = await adminEdit(store, String(body.id), now, change);
    if (!done) return reply(404, { ok: false, code: 98, error: "No player with ID " + body.id + "." });
    return reply(200, { ok: true, account: summary(done.acct), result: done.result });
  },

  async release(body, store, now) {
    const cur = await store.getWithMetadata(leaseKey(body.id), { type: "json" });
    if (cur && cur.data.device === body.device && cur.data.until > now) {
      await store.setJSON(leaseKey(body.id), { ...cur.data, until: 0 }, { onlyIfMatch: cur.etag });
    }
    return reply(200, { ok: true });
  }
};

/** Route one request; `store` is a Netlify Blobs store and `env` may hold ADMIN_KEY (both passed in so tests can fake them). */
export async function handle(req, store, now = Date.now(), env = process.env) {
  if (req.method !== "POST") return reply(405, { ok: false, code: 98, error: "Use POST." });
  let body;
  try { body = await req.json(); } catch (e) { body = null; }
  if (!body || typeof body !== "object") return reply(400, { ok: false, code: 98, error: "That request was not valid JSON." });
  const action = Object.prototype.hasOwnProperty.call(ACTIONS, body.action) ? ACTIONS[body.action] : null;
  if (!action) return reply(400, { ok: false, code: 98, error: "Unknown action." });
  if (!["ping", "create", "admin"].includes(body.action) && !ID_RE.test(String(body.id))) return reply(400, { ok: false, code: 98, error: "An ID is 7 digits." });
  if (["create", "claim", "save", "release"].includes(body.action) && !DEVICE_RE.test(String(body.device))) return reply(400, { ok: false, code: 98, error: "Missing device." });
  try {
    return await action(body, store, now, env);
  } catch (e) {
    console.error(e);
    return reply(500, { ok: false, code: 404, error: "The account server had a problem. Try again." });
  }
}

export default async (req) => handle(req, getStore({ name: STORE_NAME, consistency: "strong" }));
