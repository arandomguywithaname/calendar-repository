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
     gift    { id, device, rev, save, to, aura, shiny, count | coins }
                                            send auras (or coins) to player `to`: they go into that player's gift box, and
                                            `save` (the sender's save with them already taken out) is stored
     gifts   { id }                         the gifts waiting in this account's gift box
     openGifts { id, device, rev, save, ids }
                                            store `save` (with those gifts already added), then take the gifts
                                            with these ids out of the gift box
     chat    { since, id?, here? }          global chat messages after number `since` (no player IDs in them,
                                            since an ID is also a login); with `id`, whether that player is muted;
                                            with `here`, that player counts as in the chat for a minute. Replies
                                            with the names of everyone in the chat right now
     chatSend { id, text, aura, shiny }     post a message as that account (108 when an admin muted it)
     leaderboard { id? }                    every account ranked by rarest aura (then coins, rolls); returns the
                                            top 100 plus the viewer's own row. No player IDs are returned
     admin   { key, op, ... }               owner tools, locked by the admin password (see ADMIN_HASH):
               list                             every account with its aura count, coins and luck
               erase    { id, aura }            remove one aura (both forms) or, without `aura`, every aura
                                                (gifts of it waiting in the account's gift box go too)
               coins    { id, amount }          add coins (a negative amount takes them away)
               luck     { id, mult, rolls }     add a luck boost for a number of rolls
               eraseAll { except: [ids] }       remove every aura (and waiting gift) on every account except the ones listed
               detonate { except: [ids] }       reset every account except the ones listed to a brand new save
                                                with an empty gift box (backs each up first)
               banAuras { id }                  delete every aura the one account `id` owns (backs it up first)
               restore                          put back the saves from just before the last Detonate or ban
               resetLuck                        clear every account's active luck boosts
               chatMute   { seq | id, minutes } mute the writer of chat message `seq` (or player `id`); 0 minutes = until unmuted
               chatUnmute { seq | id }          let them chat again
               chatDelete { seq }               remove one chat message
               chatClear                        remove every chat message
               chatMuted                        the players muted right now

   Error codes in replies match the game's: 145 two devices rolling at once, 98 account problem,
   404 server or network problem. */
import { createHash, randomInt, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { getStore } from "../vendor/netlify-blobs.mjs";

const STORE_NAME = "aura-realms";
const LEASE_MS = 20000;   /* a device keeps rolling rights this long after its last roll or renewal */
const CONTEST_MS = 30000; /* how long the rolling device keeps hearing that another device tried */
const MAX_SAVE_CHARS = 1000000;
const MAX_GIFTS = 100;    /* gifts a gift box holds before its owner has to open the game and collect them */
const MAX_GIFT_COUNT = 1000000;
const MAX_GIFT_COINS = 1e15;  /* coins one gift can carry (a quadrillion) */
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
const giftKey = (id) => "gifts/" + id;
const CHAT_KEY = "chat/log";
const CHAT_HERE_KEY = "chat/here";
const LEADERBOARD_KEY = "leaderboard/cache";
const LEADERBOARD_TTL = 60000; /* the ranking is recomputed at most once a minute, so polling it never rescans every account */
const backupKey = (id) => "backup/" + id;      /* the save an account had just before the last destructive admin op */
const LAST_OP_KEY = "admin/last-destroy";       /* which accounts the last Detonate/ban touched, so Restore can undo it */
const HERE_MS = 60000;       /* a player counts as in the chat for a minute after their last check */
const HERE_WRITE_MS = 25000; /* ...and their presence is written at most this often */
const chatUserKey = (id) => "chatuser/" + id;
const CHAT_KEEP = 100;      /* messages the chat keeps */
const CHAT_MAX_CHARS = 200;
const CHAT_GAP_MS = 1500;   /* a player can send one message every 1.5 seconds */
const MUTED_FOREVER = 8.64e15;
/* Kids play this game, so swearing is not allowed in chat. A message with any of these words is blocked and the
   writer's auras are locked (see chatSend). Two tiers: mild swears lock auras for 2 days; the very worst words —
   slurs and "mothertrucker" — lock them for 7 days. */
const BAD_WORDS = ["fuck", "shit", "bitch", "cunt", "asshole", "bastard", "slut", "whore", "pussy", "dick", "cock", "twat", "wank", "piss"];
const WORST_WORDS = ["nigg", "fag", "retard", "motherfuck", "mothertruck", "spic", "chink", "kike", "tranny", "coon", "dyke"];
const ALL_BAD_WORDS = BAD_WORDS.concat(WORST_WORDS);
const BAD_RE = new RegExp("\\b(" + ALL_BAD_WORDS.join("|") + ")[a-z]*", "gi");
const WORST_RE = new RegExp("\\b(" + WORST_WORDS.join("|") + ")[a-z]*", "i");
const ANY_BAD_RE = new RegExp("\\b(" + ALL_BAD_WORDS.join("|") + ")[a-z]*", "i");
const LOCK_BAD_MS = 2 * 24 * 60 * 60 * 1000;   /* mild swear → auras locked 2 days */
const LOCK_WORST_MS = 7 * 24 * 60 * 60 * 1000; /* slur / worst word → auras locked 7 days */

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

/** One public leaderboard row for an account. `_id` is internal (to flag the viewer's own row) and is stripped
    before the response goes out — a player ID is a login secret and must never be returned to anyone. */
function leaderEntry(acct) {
  const s = acct.save || {}, st = s.stats || {};
  const owned = (o) => Object.keys(o || {}).filter((k) => o[k] > 0).length;
  return {
    _id: acct.id,
    name: acct.name,
    best: Number.isInteger(st.best) ? st.best : null,
    bestShiny: !!st.bestShiny,
    bestRarity: Math.max(0, Number(st.bestRarity) || 0),
    coins: Math.floor(Number(s.coins) || 0),
    rolls: Math.max(0, Math.floor(Number(s.rolls) || 0)),
    auras: owned(s.inventory) + owned(s.shinyInventory)
  };
}

/** Apply an admin change to an account's save and store it as a new revision; players' devices then load it.
    `note` travels with the save (for example "reset") so the player's game can say what happened. */
async function adminEdit(store, id, now, change, note) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const cur = await store.getWithMetadata(accountKey(id), { type: "json" });
    if (!cur) return null;
    const acct = cur.data;
    const save = acct.save && typeof acct.save === "object" ? acct.save : { rolls: 0, coins: 0 };
    const result = change(save);
    const next = { ...acct, save, rev: acct.rev + 1, updatedAt: now, device: ADMIN_DEVICE, adminNote: note || null, adminBase: acct.rev };
    const res = await store.setJSON(accountKey(id), next, { onlyIfMatch: cur.etag });
    if (res.modified) return { acct: next, result };
  }
  throw new Error("Account " + id + " kept changing; try again.");
}

/** Like adminEdit, but first snapshots the account's current save under backupKey(id) so a later Restore can
    put it back. Used by the destructive ops (Detonate, ban). */
async function adminEditBackup(store, id, now, change, note) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const cur = await store.getWithMetadata(accountKey(id), { type: "json" });
    if (!cur) return null;
    const acct = cur.data;
    const before = JSON.parse(JSON.stringify(acct.save && typeof acct.save === "object" ? acct.save : {}));
    const save = acct.save && typeof acct.save === "object" ? acct.save : { rolls: 0, coins: 0 };
    const result = change(save);
    const next = { ...acct, save, rev: acct.rev + 1, updatedAt: now, device: ADMIN_DEVICE, adminNote: note || null, adminBase: acct.rev };
    const res = await store.setJSON(accountKey(id), next, { onlyIfMatch: cur.etag });
    if (res.modified) {
      try { await store.setJSON(backupKey(id), { save: before, at: now }); } catch (e) { /* best-effort backup */ }
      return { acct: next, result };
    }
  }
  throw new Error("Account " + id + " kept changing; try again.");
}

/** What a device needs to know about an admin edit when it gets the save back: who made it, what kind of
    edit it was, and the revision it was made on top of (so a luck reset can be merged instead of replacing). */
function adminInfo(acct) {
  return acct.device === ADMIN_DEVICE ? { by: "admin", note: acct.adminNote || undefined, base: acct.adminBase } : {};
}

/** True when a save has an active luck boost (including magnet and shiny potions). */
function hasLuck(save) {
  const active = (list) => Array.isArray(list) && list.length > 0;
  return !!save && (active(save.luckEffects) || active(save.floorEffects) || active(save.shinyEffects) || Number(save.floorRolls) > 0);
}

/** Store a device's new save for an account. Refused while another device holds the roll lease (145) or
    when another device saved since this one last synced (98, with that newer save). Returns { rev } or
    { refusal } (a reply to send back). */
async function storeSave(store, body, save, now) {
  const lease = await store.get(leaseKey(body.id), { type: "json" });
  if (lease && lease.device !== body.device && lease.until > now) return { refusal: reply(409, { ok: false, code: 145, error: DUAL_MSG, waitMs: lease.until - now }) };
  for (let attempt = 0; attempt < 3; attempt++) {
    const cur = await store.getWithMetadata(accountKey(body.id), { type: "json" });
    if (!cur) return { refusal: reply(404, { ok: false, code: 98, error: "No player with ID " + body.id + "." }) };
    const acct = cur.data;
    /* Someone else saved since this device last synced: send theirs back instead of overwriting it.
       A matching device means our own earlier save landed but its reply was lost, so it is safe. */
    if (acct.rev !== body.rev && acct.device !== body.device) {
      return { refusal: reply(409, { ok: false, code: 98, error: "This account was changed on another device.", rev: acct.rev, save: acct.save, name: acct.name, ...adminInfo(acct) }) };
    }
    const next = { ...acct, save, rev: acct.rev + 1, updatedAt: now, device: body.device };
    const res = await store.setJSON(accountKey(body.id), next, { onlyIfMatch: cur.etag });
    if (res.modified) return { rev: next.rev };
  }
  return { refusal: reply(409, { ok: false, code: 98, error: "The account is busy. Try again." }) };
}

/** Change an account's gift box: `change` gets the list of gifts and returns the new list, or null to leave
    it as it is. Retried when someone else changed the box at the same moment. Returns the new list or null. */
async function editGifts(store, id, change) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const cur = await store.getWithMetadata(giftKey(id), { type: "json" });
    const list = cur && Array.isArray(cur.data.gifts) ? cur.data.gifts : [];
    const next = change(list.slice());
    if (!next) return null;
    const res = cur ? await store.setJSON(giftKey(id), { gifts: next }, { onlyIfMatch: cur.etag }) : await store.setJSON(giftKey(id), { gifts: next }, { onlyIfNew: true });
    if (res.modified) return next;
  }
  throw new Error("Gift box " + id + " kept changing.");
}

/** Take gifts out of an account's gift box: the ones whose aura is `auraId`, or all of them when it is null. */
async function dropGifts(store, id, auraId) {
  const cur = await store.get(giftKey(id), { type: "json" });
  if (!cur || !Array.isArray(cur.gifts) || !cur.gifts.length) return;
  await editGifts(store, id, (list) => list.filter((g) => auraId !== null && g.aura !== auraId));
}

/** A chat message cleaned up: no control characters, single spaces, at most CHAT_MAX_CHARS, bad words starred. */
function cleanChat(raw) {
  const text = String(raw == null ? "" : raw).replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2028-\u202e]/g, " ").replace(/\s+/g, " ").trim().slice(0, CHAT_MAX_CHARS);
  return text.replace(BAD_RE, (w) => "*".repeat(w.length));
}

/** A chat message as players see it. The writer's ID stays on the server: an ID also logs into the account. */
function publicMsg(m, viewer) {
  return { seq: m.seq, at: m.at, name: m.name, text: m.text, aura: m.aura, shiny: m.shiny, mine: !!viewer && m.from === viewer };
}

/** Change the chat log: `change` gets { seq, messages, removed, cleared } and edits it, returning false to leave it. */
async function editChat(store, change) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const cur = await store.getWithMetadata(CHAT_KEY, { type: "json" });
    const log = cur ? cur.data : { seq: 0, messages: [], removed: [], cleared: 0 };
    const result = change(log);
    if (result === false) return null;
    const res = cur ? await store.setJSON(CHAT_KEY, log, { onlyIfMatch: cur.etag }) : await store.setJSON(CHAT_KEY, log, { onlyIfNew: true });
    if (res.modified) return { log, result };
  }
  throw new Error("The chat kept changing.");
}

/** Note that a player is in the chat (at most every HERE_WRITE_MS) and return who is in it: { id: { at, name } }.
    Best effort: if the presence list is busy, it is simply not updated this time. */
async function chatHere(store, viewer, now) {
  const cur = await store.getWithMetadata(CHAT_HERE_KEY, { type: "json" });
  const here = cur && cur.data && typeof cur.data === "object" ? cur.data : {};
  if (!viewer || (here[viewer] && now - here[viewer].at < HERE_WRITE_MS)) return here;
  const acct = await store.get(accountKey(viewer), { type: "json" });
  if (!acct) return here;
  const next = {};
  for (const [id, h] of Object.entries(here)) if (h && now - h.at < HERE_MS * 2) next[id] = h;
  next[viewer] = { at: now, name: acct.name };
  const res = cur ? await store.setJSON(CHAT_HERE_KEY, next, { onlyIfMatch: cur.etag }) : await store.setJSON(CHAT_HERE_KEY, next, { onlyIfNew: true });
  return res.modified ? next : here;
}

/** When a player's chat mute ends (0 when they aren't muted). */
async function mutedUntil(store, id, now) {
  const u = await store.get(chatUserKey(id), { type: "json" });
  return u && u.mutedUntil > now ? u.mutedUntil : 0;
}

/** When a player's swearing aura-lock ends (0 when their auras aren't locked). */
async function aurasLockedUntil(store, id, now) {
  const u = await store.get(chatUserKey(id), { type: "json" });
  return u && u.aurasUntil > now ? u.aurasUntil : 0;
}

/** "for 9 more minutes" or "until an admin unmutes you". */
function muteText(until, now) {
  return until >= MUTED_FOREVER ? "until an admin unmutes you" : "for " + Math.max(1, Math.ceil((until - now) / 60000)) + " more minute" + (until - now > 60000 ? "s" : "");
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
    return reply(200, { ok: true, id: acct.id, name: acct.name, rev: acct.rev, save: acct.save, updatedAt: acct.updatedAt, ...adminInfo(acct) });
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
        if (acct.rev !== body.rev && acct.device !== body.device) { out.save = acct.save; out.name = acct.name; Object.assign(out, adminInfo(acct)); }
        return reply(200, out);
      }
    }
    return reply(409, { ok: false, code: 145, error: DUAL_MSG, waitMs: LEASE_MS });
  },

  async save(body, store, now) {
    const save = checkSave(body.save);
    if (!save) return reply(400, { ok: false, code: 98, error: "That save is not valid." });
    const stored = await storeSave(store, body, save, now);
    return stored.refusal || reply(200, { ok: true, rev: stored.rev });
  },

  async gift(body, store, now) {
    const to = String(body.to);
    const isCoins = body.coins != null;
    if (!ID_RE.test(to)) return reply(400, { ok: false, code: 98, error: "A player ID is 7 digits." });
    if (to === String(body.id)) return reply(400, { ok: false, code: 98, error: "You can't send a gift to yourself." });
    let gift;
    if (isCoins) {
      const coins = Number(body.coins);
      if (!Number.isInteger(coins) || coins < 1 || coins > MAX_GIFT_COINS) return reply(400, { ok: false, code: 98, error: "You can send 1 to 1,000,000,000,000,000 coins at a time." });
      gift = { id: randomUUID(), from: String(body.id), fromName: null, coins, at: now };
    } else {
      const aura = Number(body.aura), count = Number(body.count == null ? 1 : body.count);
      if (!Number.isInteger(aura) || aura < 0 || aura > 1e6) return reply(400, { ok: false, code: 98, error: "That aura doesn't exist." });
      if (!Number.isInteger(count) || count < 1 || count > MAX_GIFT_COUNT) return reply(400, { ok: false, code: 98, error: "You can send 1 to 1,000,000 at a time." });
      gift = { id: randomUUID(), from: String(body.id), fromName: null, aura, shiny: !!body.shiny, count, at: now };
    }
    const save = checkSave(body.save);
    if (!save) return reply(400, { ok: false, code: 98, error: "That save is not valid." });
    const [sender, target] = await Promise.all([store.get(accountKey(body.id), { type: "json" }), store.get(accountKey(to), { type: "json" })]);
    if (!sender) return reply(404, { ok: false, code: 98, error: "No player with ID " + body.id + "." });
    if (!target) return reply(404, { ok: false, code: 98, missing: "to", error: "No player with ID " + to + "." });
    gift.fromName = sender.name;
    /* The gift goes into the box first and the sender's save second, and the gift is taken back out if the
       save is refused. If something fails in between, the friend gets the gift and the sender keeps it too,
       which is better than it vanishing. */
    const box = await editGifts(store, to, (list) => (list.length >= MAX_GIFTS ? null : list.concat([gift])));
    if (!box) return reply(409, { ok: false, code: 98, error: target.name + "'s gift box is full. They need to open the game to collect their gifts first." });
    const stored = await storeSave(store, body, save, now);
    if (stored.refusal) {
      await editGifts(store, to, (list) => list.filter((g) => g.id !== gift.id));
      return stored.refusal;
    }
    return reply(200, { ok: true, rev: stored.rev, toName: target.name, gift: gift.id });
  },

  async chat(body, store, now) {
    const since = Math.max(0, Math.floor(Number(body.since) || 0));
    const viewer = ID_RE.test(String(body.id)) ? String(body.id) : null;
    const [log, muted, aurasUntil, here] = await Promise.all([store.get(CHAT_KEY, { type: "json" }), viewer ? mutedUntil(store, viewer, now) : 0, viewer ? aurasLockedUntil(store, viewer, now) : 0, chatHere(store, body.here ? viewer : null, now)]);
    const l = log || { seq: 0, messages: [], removed: [], cleared: 0 };
    const names = [...new Set(Object.values(here).filter((h) => h && now - h.at < HERE_MS).map((h) => h.name))].slice(0, 30);
    return reply(200, {
      ok: true, seq: l.seq, cleared: l.cleared || 0, removed: l.removed || [], here: names,
      messages: l.messages.filter((m) => m.seq > since).map((m) => publicMsg(m, viewer)),
      muted: muted ? { until: muted >= MUTED_FOREVER ? 0 : muted, text: muteText(muted, now) } : null,
      aurasUntil: aurasUntil || 0
    });
  },

  async chatSend(body, store, now) {
    const text = cleanChat(body.text);
    if (!text) return reply(400, { ok: false, code: 98, error: "Type a message first." });
    const acct = await store.get(accountKey(body.id), { type: "json" });
    if (!acct) return reply(404, { ok: false, code: 98, error: "No player with ID " + body.id + ". Log in again to chat." });
    const u = (await store.get(chatUserKey(body.id), { type: "json" })) || {};
    if (u.mutedUntil > now) return reply(403, { ok: false, code: 108, error: "An admin muted you, so you can't chat " + muteText(u.mutedUntil, now) + ".", until: u.mutedUntil >= MUTED_FOREVER ? 0 : u.mutedUntil });
    if (u.lastAt && now - u.lastAt < CHAT_GAP_MS) return reply(429, { ok: false, code: 98, slow: true, error: "Slow down! Wait a second before sending another message." });
    /* Swearing is not allowed: block the message and lock the writer's auras (longer for the worst words). */
    const worst = WORST_RE.test(body.text), swore = worst || ANY_BAD_RE.test(body.text);
    if (swore) {
      const until = Math.max(u.aurasUntil || 0, now + (worst ? LOCK_WORST_MS : LOCK_BAD_MS)), days = worst ? 7 : 2;
      await store.setJSON(chatUserKey(body.id), { ...u, lastAt: now, aurasUntil: until });
      return reply(403, { ok: false, code: 451, aurasUntil: until,
        error: "🚫 No swearing in chat! Your message was blocked and your auras are locked for " + days + " days." + (worst ? " That word is one of the worst — that's why it's 7 days." : "") });
    }
    await store.setJSON(chatUserKey(body.id), { ...u, lastAt: now });
    const aura = Number.isInteger(body.aura) && body.aura >= 0 && body.aura <= 1e6 ? body.aura : null;
    const done = await editChat(store, (log) => {
      log.seq += 1;
      const msg = { seq: log.seq, at: now, from: String(body.id), name: acct.name, text, aura, shiny: aura !== null && !!body.shiny };
      log.messages = log.messages.concat([msg]).slice(-CHAT_KEEP);
      return msg;
    });
    return reply(200, { ok: true, message: publicMsg(done.result, String(body.id)) });
  },

  async gifts(body, store) {
    const box = await store.get(giftKey(body.id), { type: "json" });
    return reply(200, { ok: true, gifts: box && Array.isArray(box.gifts) ? box.gifts : [] });
  },

  async openGifts(body, store, now) {
    const ids = Array.isArray(body.ids) ? body.ids.map(String).slice(0, MAX_GIFTS) : [];
    const save = checkSave(body.save);
    if (!save) return reply(400, { ok: false, code: 98, error: "That save is not valid." });
    /* Only once the save holding the gifts is stored do they leave the box, so a refused save loses nothing. */
    const stored = await storeSave(store, body, save, now);
    if (stored.refusal) return stored.refusal;
    if (ids.length) await editGifts(store, body.id, (list) => list.filter((g) => ids.indexOf(g.id) < 0));
    return reply(200, { ok: true, rev: stored.rev });
  },

  /* The all-stars leaderboard: every account, ranked by rarest aura found (then coins, then rolls). Returns the
     top 100 plus the viewer's own row (so you always see yourself, even outside the top 100). No player IDs leave
     the server; the viewer's own row is flagged with `mine`. */
  async leaderboard(body, store, now) {
    const viewer = ID_RE.test(String(body.id)) ? String(body.id) : null;
    /* Serve a cached ranking (ids kept server-side only) so polling never rescans every account; refresh it at
       most once a minute. On a store with many accounts this is what keeps the request from timing out. */
    let cache = null;
    try { cache = await store.get(LEADERBOARD_KEY, { type: "json" }); } catch (e) { cache = null; }
    if (!cache || !Array.isArray(cache.list) || now - (cache.at || 0) > LEADERBOARD_TTL) {
      const ids = await allIds(store);
      const accts = await mapLimit(ids, 10, (id) => store.get(accountKey(id), { type: "json" }));
      const list = accts.filter(Boolean).map(leaderEntry)
        .sort((a, b) => (b.bestRarity - a.bestRarity) || (b.coins - a.coins) || (b.rolls - a.rolls))
        .map((e) => ({ id: e._id, name: e.name, best: e.best, bestShiny: e.bestShiny, bestRarity: e.bestRarity, coins: e.coins, rolls: e.rolls, auras: e.auras }));
      cache = { at: now, list };
      try { await store.setJSON(LEADERBOARD_KEY, cache); } catch (e) { /* best-effort cache */ }
    }
    const list = cache.list;
    const rowOf = (e, i) => ({ rank: i + 1, name: e.name, best: e.best, bestShiny: e.bestShiny, bestRarity: e.bestRarity, coins: e.coins, rolls: e.rolls, auras: e.auras, mine: !!viewer && e.id === viewer });
    const top = list.slice(0, 100).map(rowOf);
    let me = null;
    if (viewer) { const i = list.findIndex((e) => e.id === viewer); if (i >= 0) me = rowOf(list[i], i); }
    return reply(200, { ok: true, count: list.length, top, me });
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
    if (body.op === "detonate") {
      const keep = new Set((Array.isArray(body.except) ? body.except : []).map(String).filter((id) => ID_RE.test(id)));
      if (!keep.size) return reply(400, { ok: false, code: 98, error: "Log in to your own account first, so Detonate knows which account to keep." });
      const ids = (await allIds(store)).filter((id) => !keep.has(id));
      /* A fresh save rather than deleting the account: a deleted account would just be uploaded again
         from the player's device, while a reset save replaces the progress on every device. Each account's
         save is backed up first, so Restore can undo an accidental Detonate. */
      const reset = (save) => { for (const k of Object.keys(save)) delete save[k]; Object.assign(save, { rolls: 0, coins: 100 }); return 1; };
      const done = await mapLimit(ids, 10, (id) => adminEditBackup(store, id, now, reset, "reset"));
      await mapLimit(ids, 10, (id) => dropGifts(store, id, null));
      const hit = ids.filter((id, i) => done[i]);
      try { await store.setJSON(LAST_OP_KEY, { at: now, op: "detonate", ids: hit }); } catch (e) { /* best-effort */ }
      return reply(200, { ok: true, accounts: hit.length, kept: [...keep] });
    }
    if (body.op === "banAuras") {
      const target = String(body.id);
      if (!ID_RE.test(target)) return reply(400, { ok: false, code: 98, error: "Enter the player's 7-digit ID." });
      const acct = await store.get(accountKey(target), { type: "json" });
      if (!acct) return reply(404, { ok: false, code: 98, error: "No player with ID " + target + "." });
      const done = await adminEditBackup(store, target, now, (save) => eraseAuras(save, null), "ban");
      if (!done) return reply(404, { ok: false, code: 98, error: "No player with ID " + target + "." });
      await dropGifts(store, target, null);
      try { await store.setJSON(LAST_OP_KEY, { at: now, op: "ban", ids: [target] }); } catch (e) { /* best-effort */ }
      return reply(200, { ok: true, id: target, name: acct.name, removed: done.result });
    }
    if (body.op === "restore") {
      const last = await store.get(LAST_OP_KEY, { type: "json" });
      if (!last || !Array.isArray(last.ids) || !last.ids.length) return reply(400, { ok: false, code: 98, error: "Nothing to restore — no recent Detonate or ban to undo." });
      const ids = last.ids.filter((id) => ID_RE.test(String(id)));
      const done = await mapLimit(ids, 10, async (id) => {
        const bk = await store.get(backupKey(id), { type: "json" });
        if (!bk || !bk.save) return null;
        /* Replace the whole save with the backed-up one. Not backed up again, so Restore can be re-run. */
        return adminEdit(store, id, now, (save) => { for (const k of Object.keys(save)) delete save[k]; Object.assign(save, bk.save); return 1; }, "restore");
      });
      return reply(200, { ok: true, accounts: done.filter(Boolean).length, op: last.op || "detonate", at: last.at || 0 });
    }
    if (body.op === "resetLuck") {
      const ids = await allIds(store);
      const clear = (save) => { save.luckEffects = []; save.floorEffects = []; save.shinyEffects = []; delete save.floorRolls; return 1; };
      /* Only accounts that have luck are touched, so nobody else's game reloads for nothing. */
      const done = await mapLimit(ids, 10, async (id) => (hasLuck((await store.get(accountKey(id), { type: "json" }) || {}).save) ? adminEdit(store, id, now, clear, "luck") : null));
      const leases = await mapLimit(ids, 10, (id) => store.get(leaseKey(id), { type: "json" }));
      return reply(200, { ok: true, accounts: ids.length, cleared: done.filter(Boolean).length, playing: leases.filter((l) => l && l.until > now).length });
    }
    if (body.op === "eraseAll") {
      const keep = new Set((Array.isArray(body.except) ? body.except : []).map(String).filter((id) => ID_RE.test(id)));
      if (!keep.size) return reply(400, { ok: false, code: 98, error: "Give at least one account ID to keep." });
      const ids = (await allIds(store)).filter((id) => !keep.has(id));
      const done = await mapLimit(ids, 10, (id) => adminEdit(store, id, now, (save) => eraseAuras(save, null)));
      await mapLimit(ids, 10, (id) => dropGifts(store, id, null));
      const hit = done.filter(Boolean);
      return reply(200, { ok: true, accounts: hit.length, removed: hit.reduce((n, d) => n + d.result, 0), kept: [...keep] });
    }
    if (body.op === "chatClear") {
      await editChat(store, (log) => { log.cleared = log.seq; log.messages = []; log.removed = []; });
      return reply(200, { ok: true });
    }
    if (body.op === "chatDelete") {
      const seq = Number(body.seq);
      const done = await editChat(store, (log) => {
        const m = log.messages.find((x) => x.seq === seq);
        if (!m) return false;
        log.messages = log.messages.filter((x) => x.seq !== seq);
        log.removed = (log.removed || []).concat([seq]).slice(-CHAT_KEEP);
        return m;
      });
      if (!done) return reply(404, { ok: false, code: 98, error: "That message is already gone." });
      return reply(200, { ok: true, name: done.result.name, id: done.result.from });
    }
    if (body.op === "chatMuted") {
      const { blobs } = await store.list({ prefix: "chatuser/" });
      const ids = blobs.map((b) => b.key.slice("chatuser/".length)).filter((id) => ID_RE.test(id));
      const rows = await mapLimit(ids, 10, async (id) => {
        const until = await mutedUntil(store, id, now);
        if (!until) return null;
        const acct = await store.get(accountKey(id), { type: "json" });
        return { id, name: acct ? acct.name : "?", until: until >= MUTED_FOREVER ? 0 : until, text: muteText(until, now) };
      });
      return reply(200, { ok: true, muted: rows.filter(Boolean) });
    }
    if (body.op === "chatMute" || body.op === "chatUnmute") {
      let target = ID_RE.test(String(body.id)) ? String(body.id) : null;
      if (!target && body.seq != null) {
        const log = await store.get(CHAT_KEY, { type: "json" });
        const m = log && log.messages.find((x) => x.seq === Number(body.seq));
        if (m) target = m.from;
      }
      if (!target) return reply(404, { ok: false, code: 98, error: "Pick a chat message or type a player ID." });
      const acct = await store.get(accountKey(target), { type: "json" });
      if (!acct) return reply(404, { ok: false, code: 98, error: "No player with ID " + target + "." });
      const minutes = Number(body.minutes) || 0;
      if (body.op === "chatMute" && !(minutes >= 0 && minutes <= 525600)) return reply(400, { ok: false, code: 98, error: "Mute for 0 (until unmuted) to 525,600 minutes." });
      const until = body.op === "chatUnmute" ? 0 : minutes ? now + minutes * 60000 : MUTED_FOREVER;
      const u = (await store.get(chatUserKey(target), { type: "json" })) || {};
      await store.setJSON(chatUserKey(target), { ...u, mutedUntil: until });
      return reply(200, { ok: true, id: target, name: acct.name, until: until >= MUTED_FOREVER ? 0 : until, text: until ? muteText(until, now) : "" });
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
    if (body.op === "erase") await dropGifts(store, String(body.id), body.aura == null ? null : Number(body.aura));
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
  if (!["ping", "create", "admin", "chat", "leaderboard"].includes(body.action) && !ID_RE.test(String(body.id))) return reply(400, { ok: false, code: 98, error: "An ID is 7 digits." });
  if (["create", "claim", "save", "release", "gift", "openGifts"].includes(body.action) && !DEVICE_RE.test(String(body.device))) return reply(400, { ok: false, code: 98, error: "Missing device." });
  try {
    return await action(body, store, now, env);
  } catch (e) {
    console.error(e);
    return reply(500, { ok: false, code: 404, error: "The account server had a problem. Try again." });
  }
}

export default async (req) => handle(req, getStore({ name: STORE_NAME, consistency: "strong" }));
