'use strict';
/* ------------------------------------------------------------------
   net.js — player-vs-player networking.

   Topology: a tiny relay server owns rooms and rosters; the first player
   in a room becomes the host and runs the authoritative match (rounds,
   economy, bots, bomb). Everyone simulates their own movement locally
   and ships state at 20 Hz; remote players are interpolated 100 ms in
   the past so they move smoothly.
   ------------------------------------------------------------------ */

const NET_TICK = 1 / 20;
const INTERP_DELAY = 0.1;

class NetClient {
  constructor() {
    this.ws = null;
    this.connected = false;
    this.id = null;
    this.host = false;
    this.room = null;
    this.players = new Map();      // id -> { id, name, team, bot, entity }
    this.handlers = {};
    this.sendTimer = 0;
    this.latency = 0;
    this.lastPingAt = 0;
    this.status = 'idle';
  }

  on(type, fn) { this.handlers[type] = fn; }
  _emit(type, msg) { if (this.handlers[type]) this.handlers[type](msg); }

  get active() { return this.connected && !!this.room; }

  /** Default to the page's own host so "just open the link" works. */
  static defaultUrl() {
    if (location.protocol === 'file:') return 'ws://localhost:8080';
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${location.host}`;
  }

  connect(url, name, room, team, fillBots) {
    return new Promise((resolve, reject) => {
      let ws;
      try {
        ws = new WebSocket(url);
      } catch (err) {
        reject(new Error('Bad server address: ' + err.message));
        return;
      }
      this.ws = ws;
      this.status = 'connecting';
      const timeout = setTimeout(() => {
        if (!this.connected) { try { ws.close(); } catch (e) {} reject(new Error('Connection timed out.')); }
      }, 8000);

      ws.onopen = () => {
        clearTimeout(timeout);
        this.connected = true;
        this.status = 'connected';
        this.send({ t: 'join', room, name, team, fillBots });
      };
      ws.onerror = () => {
        clearTimeout(timeout);
        if (!this.connected) reject(new Error('Could not reach the server. Is it running?'));
      };
      ws.onclose = () => {
        this.connected = false;
        this.status = 'closed';
        this._emit('close', {});
      };
      ws.onmessage = (ev) => {
        let msg;
        try { msg = JSON.parse(ev.data); } catch (e) { return; }
        this._handle(msg, resolve);
      };
    });
  }

  disconnect() {
    if (this.ws) { try { this.ws.close(); } catch (e) { /* already gone */ } }
    this.ws = null;
    this.connected = false;
    this.room = null;
    this.players.clear();
  }

  send(msg) {
    if (!this.ws || this.ws.readyState !== 1) return;
    this.ws.send(JSON.stringify(msg));
  }

  _handle(msg, resolveJoin) {
    switch (msg.t) {
      case 'joined':
        this.id = msg.id;
        this.room = msg.room;
        this.host = msg.host;
        this.status = 'in-room';
        this._syncRoster(msg.players);
        if (resolveJoin) resolveJoin(msg);
        this._emit('roster', msg);
        break;
      case 'roster':
        this.host = msg.host === this.id;
        this._syncRoster(msg.players);
        this._emit('roster', msg);
        break;
      case 'pong':
        this.latency = (performance.now() - msg.c) / 2;
        break;
      default:
        this._emit(msg.t, msg);
    }
  }

  _syncRoster(list) {
    const seen = new Set();
    for (const p of list) {
      seen.add(p.id);
      const existing = this.players.get(p.id);
      if (existing) Object.assign(existing, p);
      else this.players.set(p.id, Object.assign({ buffer: [] }, p));
    }
    for (const id of [...this.players.keys()]) {
      if (!seen.has(id)) this.players.delete(id);
    }
  }

  /** Called every frame by the game with the local player's state. */
  tick(dt, local) {
    if (!this.active) return;
    this.sendTimer -= dt;
    if (this.sendTimer > 0) return;
    this.sendTimer = NET_TICK;
    this.send({
      t: 's',
      p: [round2(local.pos[0]), round2(local.pos[1]), round2(local.pos[2])],
      v: [round2(local.vel[0]), round2(local.vel[1]), round2(local.vel[2])],
      y: round3(local.yaw), q: round3(local.pitch),
      d: local.ducking ? 1 : 0,
      w: local.weaponKey || '',
      sl: local.slot,
      h: Math.max(0, Math.round(local.health)),
      a: local.alive ? 1 : 0,
    });
    if (performance.now() - this.lastPingAt > 2000) {
      this.lastPingAt = performance.now();
      this.send({ t: 'ping', c: performance.now() });
    }
  }

  /** Push a remote state snapshot into that player's interpolation buffer. */
  pushSnapshot(id, msg, now) {
    const p = this.players.get(id);
    if (!p) return;
    p.buffer.push({ t: now, p: msg.p, v: msg.v, y: msg.y, q: msg.q, d: msg.d, w: msg.w, sl: msg.sl, h: msg.h, a: msg.a });
    while (p.buffer.length > 24) p.buffer.shift();
  }

  /** Apply buffered state to the entity, interpolating INTERP_DELAY behind. */
  applyInterpolation(now) {
    for (const p of this.players.values()) {
      const e = p.entity;
      if (!e || !p.buffer.length) continue;
      const target = now - INTERP_DELAY;
      let a = null, b = null;
      for (let i = p.buffer.length - 1; i >= 0; i--) {
        if (p.buffer[i].t <= target) { a = p.buffer[i]; b = p.buffer[i + 1] || null; break; }
      }
      if (!a) a = p.buffer[0];
      const s = b ? clamp((target - a.t) / Math.max(0.0001, b.t - a.t), 0, 1) : 1;
      const pos = b ? [
        lerp(a.p[0], b.p[0], s), lerp(a.p[1], b.p[1], s), lerp(a.p[2], b.p[2], s),
      ] : a.p.slice();
      // Extrapolate a touch when the buffer runs dry, so movement stays smooth.
      if (!b && a.v) {
        const ahead = clamp(target - a.t, 0, 0.12);
        pos[0] += a.v[0] * ahead; pos[1] += a.v[1] * ahead; pos[2] += a.v[2] * ahead;
      }
      e.pos[0] = pos[0]; e.pos[1] = pos[1]; e.pos[2] = pos[2];
      e.vel[0] = a.v ? a.v[0] : 0; e.vel[1] = a.v ? a.v[1] : 0; e.vel[2] = a.v ? a.v[2] : 0;
      e.yaw = b ? a.y + angleDiff(a.y, b.y) * s : a.y;
      e.pitch = b ? lerp(a.q, b.q, s) : a.q;
      e.duckAmount = approach(e.duckAmount, a.d ? 1 : 0, 0.12);
      e.ducking = a.d === 1;
      e.animTime += 0.016;
      if (a.sl) e.slot = a.sl;
      if (a.w && WEAPONS[a.w]) {
        if (a.sl === 'primary') e.inventory.primary = a.w;
        else if (a.sl === 'secondary') e.inventory.secondary = a.w;
      }
      if (!this.host) {
        e.health = a.h;
        e.alive = a.a === 1;
      }
    }
  }
}

function round2(v) { return Math.round(v * 100) / 100; }
function round3(v) { return Math.round(v * 1000) / 1000; }
