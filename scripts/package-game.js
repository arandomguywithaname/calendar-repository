#!/usr/bin/env node
/* ------------------------------------------------------------------
   package-game.js — builds dist/operation-dune.zip: a self-contained
   folder anyone can publish. The zip is written directly (store
   method, no compression) so this needs no dependencies at all.

     npm run game:zip
   ------------------------------------------------------------------ */

'use strict';

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const OUT_DIR = path.join(REPO, 'dist');
const OUT = path.join(OUT_DIR, 'operation-dune.zip');
const PREFIX = 'operation-dune/';

/* --------------------------- zip writer --------------------------- */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

class ZipWriter {
  constructor() {
    this.chunks = [];
    this.central = [];
    this.offset = 0;
  }

  add(name, data) {
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);            // version needed
    local.writeUInt16LE(0x0800, 6);        // utf-8 names
    local.writeUInt16LE(0, 8);             // method: store
    local.writeUInt16LE(0, 10);            // time
    local.writeUInt16LE(0x5821, 12);       // date (a fixed, valid dos date)
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);

    const headerOffset = this.offset;
    this.chunks.push(local, nameBuf, data);
    this.offset += local.length + nameBuf.length + data.length;

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0x0800, 8);
    cd.writeUInt16LE(0, 10);
    cd.writeUInt16LE(0, 12);
    cd.writeUInt16LE(0x5821, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(data.length, 20);
    cd.writeUInt32LE(data.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt32LE(headerOffset, 42);
    this.central.push(Buffer.concat([cd, nameBuf]));
  }

  finish() {
    const cdStart = this.offset;
    let cdSize = 0;
    for (const c of this.central) { this.chunks.push(c); cdSize += c.length; }
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(this.central.length, 8);
    end.writeUInt16LE(this.central.length, 10);
    end.writeUInt32LE(cdSize, 12);
    end.writeUInt32LE(cdStart, 16);
    this.chunks.push(end);
    return Buffer.concat(this.chunks);
  }
}

/* ---------------------------- contents ---------------------------- */

function walk(dir, base, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, base + entry.name + '/', out);
    else out.push([base + entry.name, full]);
  }
}

const zip = new ZipWriter();

// The game itself.
const files = [];
walk(path.join(REPO, 'public', 'game'), 'public/game/', files);
files.sort((a, b) => a[0].localeCompare(b[0]));
for (const [rel, full] of files) {
  if (rel.endsWith('_test.html')) continue;
  zip.add(PREFIX + rel, fs.readFileSync(full));
}

// Standalone server: same file, with the web root next to it.
const server = fs.readFileSync(path.join(REPO, 'scripts', 'serve-game.js'), 'utf8')
  .replace("path.resolve(__dirname, '..', 'public')", "path.resolve(__dirname, 'public')");
zip.add(PREFIX + 'server.js', Buffer.from(server));

zip.add(PREFIX + 'package.json', Buffer.from(JSON.stringify({
  name: 'operation-dune',
  version: '1.0.0',
  description: 'A tactical 5v5 bomb-defusal shooter for the browser — no dependencies.',
  scripts: { start: 'node server.js' },
  license: 'MIT',
}, null, 2) + '\n'));

zip.add(PREFIX + 'README.md', Buffer.from(`# OPERATION: DUNE

A tactical 5v5 bomb-defusal shooter that runs in the browser.
No dependencies, no build step, no assets — everything is generated at runtime.

## Run

\`\`\`bash
npm start            # or: node server.js
\`\`\`

Open http://localhost:8080/game/ — share your LAN address for PvP
(everyone joins the same room code under "Play with Friends").
Set PORT to change the port.

## Publishing

- **Anywhere Node runs** (a VPS, Render, Railway, Fly.io, Glitch…):
  deploy this folder and run \`node server.js\`. Singleplayer *and* PvP work —
  the PvP relay runs on the same port as the site.
- **Static hosts** (itch.io, GitHub Pages, Netlify…): upload the
  \`public/game/\` folder as-is and serve \`index.html\`. Matchmaking vs bots
  and Practice work fully; "Play with Friends" needs the Node server above,
  but players can point the lobby's Server field at one you host elsewhere.
- HTTPS sites need a \`wss://\` server address in the PvP lobby.

Full docs live in \`public/game/README.md\`.
`));

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT, zip.finish());
const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
console.log(`wrote ${path.relative(REPO, OUT)} (${kb} KB, ${files.length + 3} files)`);
