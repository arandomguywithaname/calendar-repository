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

   Error codes in replies match the game's: 145 two devices rolling at once, 98 account problem,
   404 server or network problem. */
import { randomInt } from "node:crypto";
import { getStore } from "../vendor/netlify-blobs.mjs";

const STORE_NAME = "aura-realms";
const LEASE_MS = 20000;   /* a device keeps rolling rights this long after its last roll or renewal */
const CONTEST_MS = 30000; /* how long the rolling device keeps hearing that another device tried */
const MAX_SAVE_CHARS = 1000000;
const ID_RE = /^\d{7}$/;
const DEVICE_RE = /^[a-z0-9]{8,40}$/;
const NAME_RE = /^[\p{L}\p{N} _'.-]+$/u;
const DUAL_MSG = "You are rolling on two devices simultaneously. Only one device can roll on an account at a time.";

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
    return reply(200, { ok: true, id: acct.id, name: acct.name, rev: acct.rev, save: acct.save, updatedAt: acct.updatedAt });
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
        if (acct.rev !== body.rev && acct.device !== body.device) { out.save = acct.save; out.name = acct.name; }
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
        return reply(409, { ok: false, code: 98, error: "This account was changed on another device.", rev: acct.rev, save: acct.save, name: acct.name });
      }
      const next = { ...acct, save, rev: acct.rev + 1, updatedAt: now, device: body.device };
      const res = await store.setJSON(accountKey(body.id), next, { onlyIfMatch: cur.etag });
      if (res.modified) return reply(200, { ok: true, rev: next.rev });
    }
    return reply(409, { ok: false, code: 98, error: "The account is busy. Try again." });
  },

  async release(body, store, now) {
    const cur = await store.getWithMetadata(leaseKey(body.id), { type: "json" });
    if (cur && cur.data.device === body.device && cur.data.until > now) {
      await store.setJSON(leaseKey(body.id), { ...cur.data, until: 0 }, { onlyIfMatch: cur.etag });
    }
    return reply(200, { ok: true });
  }
};

/** Route one request; `store` is a Netlify Blobs store (passed in so tests can point it at a local server). */
export async function handle(req, store, now = Date.now()) {
  if (req.method !== "POST") return reply(405, { ok: false, code: 98, error: "Use POST." });
  let body;
  try { body = await req.json(); } catch (e) { body = null; }
  if (!body || typeof body !== "object") return reply(400, { ok: false, code: 98, error: "That request was not valid JSON." });
  const action = Object.prototype.hasOwnProperty.call(ACTIONS, body.action) ? ACTIONS[body.action] : null;
  if (!action) return reply(400, { ok: false, code: 98, error: "Unknown action." });
  if (body.action !== "ping" && body.action !== "create" && !ID_RE.test(String(body.id))) return reply(400, { ok: false, code: 98, error: "An ID is 7 digits." });
  if (["create", "claim", "save", "release"].includes(body.action) && !DEVICE_RE.test(String(body.device))) return reply(400, { ok: false, code: 98, error: "Missing device." });
  try {
    return await action(body, store, now);
  } catch (e) {
    console.error(e);
    return reply(500, { ok: false, code: 404, error: "The account server had a problem. Try again." });
  }
}

export default async (req) => handle(req, getStore({ name: STORE_NAME, consistency: "strong" }));
