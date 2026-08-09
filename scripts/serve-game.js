#!/usr/bin/env node
/* ------------------------------------------------------------------
   serve-game.js — serves public/ over HTTP and runs the PvP relay on
   the same port. No dependencies: the WebSocket handshake and framing
   are implemented directly on top of node's http/net.

     npm run game            # http://localhost:8080/game/
     PORT=9000 npm run game

   Rooms are keyed by a short code. The first player in a room is the
   host: their browser runs the authoritative match and the server
   relays everyone's state and events.
   ------------------------------------------------------------------ */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const PORT = parseInt(process.env.PORT || '8080', 10);
const ROOT = path.resolve(__dirname, '..', 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

/* ----------------------------- HTTP ----------------------------- */

const server = http.createServer((req, res) => {
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch (e) {
    res.writeHead(400).end('Bad request');
    return;
  }
  if (urlPath === '/') urlPath = '/game/index.html';
  if (urlPath.endsWith('/')) urlPath += 'index.html';

  const filePath = path.join(ROOT, urlPath);
  // Never serve anything outside public/.
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found: ' + urlPath);
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream',
      // Dev server: never cache, so an edit is always one refresh away.
      'Cache-Control': 'no-store, must-revalidate',
    });
    res.end(data);
  });
});

/* -------------------------- WebSocket --------------------------- */

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
let nextClientId = 1;
const rooms = new Map();   // code -> { code, hostId, clients: Map<id, client> }

server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  if (!key) { socket.destroy(); return; }
  const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
  );
  socket.setNoDelay(true);
  handleClient(socket);
});

function handleClient(socket) {
  const client = {
    id: nextClientId++,
    socket,
    room: null,
    name: 'player',
    team: 'T',
    alive: true,
  };
  let buffer = Buffer.alloc(0);

  socket.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    for (;;) {
      const frame = decodeFrame(buffer);
      if (!frame) break;
      buffer = buffer.subarray(frame.size);
      if (frame.opcode === 0x8) { closeClient(client); return; }
      if (frame.opcode === 0x9) { sendRaw(socket, frame.payload, 0xA); continue; }
      if (frame.opcode !== 0x1) continue;
      let msg;
      try { msg = JSON.parse(frame.payload.toString('utf8')); } catch (e) { continue; }
      onMessage(client, msg);
    }
    // Guard against a peer that never sends a complete frame.
    if (buffer.length > 1 << 20) closeClient(client);
  });

  socket.on('error', () => closeClient(client));
  socket.on('close', () => closeClient(client));
}

function onMessage(client, msg) {
  switch (msg.t) {
    case 'join': {
      const code = String(msg.room || 'DUNE1').toUpperCase().slice(0, 8);
      let room = rooms.get(code);
      if (!room) {
        room = { code, hostId: client.id, clients: new Map(), fillBots: msg.fillBots !== false };
        rooms.set(code, room);
      }
      if (room.clients.size >= 10) {
        send(client, { t: 'error', message: 'That room is full.' });
        return;
      }
      client.room = room;
      client.name = String(msg.name || 'player').slice(0, 14);
      client.team = pickTeam(room, msg.team);
      room.clients.set(client.id, client);
      send(client, {
        t: 'joined', id: client.id, room: code,
        host: room.hostId === client.id, players: roster(room),
      });
      broadcast(room, { t: 'roster', host: room.hostId, players: roster(room) }, null);
      log(`${client.name} joined ${code} (${room.clients.size}/10)`);
      break;
    }
    case 'start': {
      const room = client.room;
      if (!room || room.hostId !== client.id) return;
      broadcast(room, {
        t: 'start', teamSize: msg.teamSize || 5, fillBots: room.fillBots,
        players: roster(room),
      }, null);
      log(`room ${room.code}: match started`);
      break;
    }
    case 'ping':
      send(client, { t: 'pong', c: msg.c });
      break;
    default: {
      // Everything else is relayed to the rest of the room, stamped with
      // the sender so clients know who it came from.
      const room = client.room;
      if (!room) return;
      msg.id = client.id;
      broadcast(room, msg, client.id);
      break;
    }
  }
}

function pickTeam(room, requested) {
  if (requested === 'T' || requested === 'CT') return requested;
  let t = 0, ct = 0;
  for (const c of room.clients.values()) (c.team === 'T' ? t++ : ct++);
  return t <= ct ? 'T' : 'CT';
}

function roster(room) {
  return [...room.clients.values()].map(c => ({ id: c.id, name: c.name, team: c.team, bot: false }));
}

function closeClient(client) {
  if (client.closed) return;
  client.closed = true;
  try { client.socket.destroy(); } catch (e) { /* already gone */ }
  const room = client.room;
  if (!room) return;
  room.clients.delete(client.id);
  if (room.clients.size === 0) {
    rooms.delete(room.code);
    log(`room ${room.code} closed`);
    return;
  }
  if (room.hostId === client.id) {
    // Promote the next player so the match keeps running.
    room.hostId = room.clients.keys().next().value;
    log(`room ${room.code}: host migrated to ${room.hostId}`);
  }
  broadcast(room, { t: 'left', id: client.id }, null);
  broadcast(room, { t: 'roster', host: room.hostId, players: roster(room) }, null);
}

function broadcast(room, msg, exceptId) {
  const data = JSON.stringify(msg);
  for (const c of room.clients.values()) {
    if (c.id === exceptId) continue;
    sendText(c.socket, data);
  }
}

function send(client, msg) { sendText(client.socket, JSON.stringify(msg)); }

function sendText(socket, str) {
  sendRaw(socket, Buffer.from(str, 'utf8'), 0x1);
}

function sendRaw(socket, payload, opcode) {
  if (socket.destroyed) return;
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  header[0] = 0x80 | opcode;
  try { socket.write(Buffer.concat([header, payload])); } catch (e) { /* peer gone */ }
}

/** Parse one frame; returns null when more bytes are needed. */
function decodeFrame(buf) {
  if (buf.length < 2) return null;
  const opcode = buf[0] & 0x0f;
  const masked = (buf[1] & 0x80) !== 0;
  let len = buf[1] & 0x7f;
  let offset = 2;
  if (len === 126) {
    if (buf.length < 4) return null;
    len = buf.readUInt16BE(2);
    offset = 4;
  } else if (len === 127) {
    if (buf.length < 10) return null;
    const big = buf.readBigUInt64BE(2);
    if (big > 1n << 24n) return { size: buf.length, opcode: 0x8, payload: Buffer.alloc(0) };
    len = Number(big);
    offset = 10;
  }
  let mask = null;
  if (masked) {
    if (buf.length < offset + 4) return null;
    mask = buf.subarray(offset, offset + 4);
    offset += 4;
  }
  if (buf.length < offset + len) return null;
  const payload = Buffer.from(buf.subarray(offset, offset + len));
  if (mask) for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
  return { opcode, payload, size: offset + len };
}

function log(msg) {
  const t = new Date().toISOString().slice(11, 19);
  console.log(`[${t}] ${msg}`);
}

/* ----------------------------- start ----------------------------- */

server.listen(PORT, () => {
  const addrs = ['localhost'];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const net of list || []) {
      if (net.family === 'IPv4' && !net.internal) addrs.push(net.address);
    }
  }
  console.log('');
  console.log('  OPERATION: DUNE — game server');
  console.log('  ' + '-'.repeat(46));
  for (const a of addrs) console.log(`  play:  http://${a}:${PORT}/game/`);
  console.log(`  pvp :  ws://${addrs[addrs.length - 1]}:${PORT}  (paste into the PvP lobby)`);
  console.log('');
  console.log('  Share the play URL on your network, everyone opens');
  console.log('  "PLAY WITH FRIENDS", enters the same room code, and the');
  console.log('  host presses START MATCH.');
  console.log('');
});
