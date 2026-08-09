'use strict';
/* ------------------------------------------------------------------
   hud.js — all DOM/2D-canvas interface: crosshair, radar, kill feed,
   scoreboard, the CS2-style shop (with a rotating 3D weapon preview)
   and the menu/matchmaking screens.
   ------------------------------------------------------------------ */

const DEFAULT_SETTINGS = {
  sens: 2.2, fov: 90, volume: 0.7, renderScale: 1,
  chSize: 6, chGap: 4, chThick: 2, chColor: '#33ff66', chDot: false, chDynamic: true,
  shadows: true, viewmodel: true, invertY: false,
  name: 'player', server: '', room: 'DUNE1',
  skins: {},                       // weapon key -> skin key
  controlMode: 'auto',             // 'auto' | 'desktop' | 'mobile'
};

function loadSettings() {
  let s = Object.assign({}, DEFAULT_SETTINGS);
  // Phones default to a lighter render load; a saved choice still wins.
  if (typeof IS_TOUCH_DEVICE !== 'undefined' && IS_TOUCH_DEVICE) s.renderScale = 0.7;
  try {
    const raw = localStorage.getItem('dune.settings');
    if (raw) s = Object.assign(s, JSON.parse(raw));
  } catch (e) { /* storage may be unavailable; defaults are fine */ }
  return s;
}

function saveSettings(s) {
  try { localStorage.setItem('dune.settings', JSON.stringify(s)); } catch (e) { /* ignore */ }
}

const $ = (id) => document.getElementById(id);

/* ------------------------- 3D weapon preview ------------------------- */

/**
 * Orthographic painter's-algorithm render of a gun's boxes. Gives the shop
 * a real rotating view of the exact model you will hold in game.
 */
function drawWeaponPreview(ctx, kind, w, h, angle, palette) {
  const parts = GUN_PARTS[kind] || GUN_PARTS.pistol;
  ctx.clearRect(0, 0, w, h);

  // Fit the model to the canvas.
  let minZ = 1e9, maxZ = -1e9, minY = 1e9, maxY = -1e9, minX = 1e9, maxX = -1e9;
  for (const p of parts) {
    minX = Math.min(minX, p[0], p[3]); maxX = Math.max(maxX, p[0], p[3]);
    minY = Math.min(minY, p[1], p[4]); maxY = Math.max(maxY, p[1], p[4]);
    minZ = Math.min(minZ, p[2], p[5]); maxZ = Math.max(maxZ, p[2], p[5]);
  }
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, cz = (minZ + maxZ) / 2;
  const span = Math.max(maxZ - minZ, (maxY - minY) * 2.2, 0.2);
  const scale = (Math.min(w, h * 2.6) * 0.82) / span;

  const ca = Math.cos(angle), sa = Math.sin(angle);
  const tilt = 0.28, ct = Math.cos(tilt), st = Math.sin(tilt);
  const project = (x, y, z) => {
    let px = x - cx, py = y - cy, pz = z - cz;
    // yaw
    let rx = px * ca + pz * sa;
    let rz = -px * sa + pz * ca;
    // pitch (tilt down slightly)
    const ry = py * ct - rz * st;
    rz = py * st + rz * ct;
    return [w / 2 - rz * scale, h / 2 - ry * scale, rx];
  };

  const faces = [];
  const FACE_IDX = [
    [[0, 1, 1], [0, 0, 1], [0, 0, 0], [0, 1, 0], [-1, 0, 0]],
    [[1, 1, 0], [1, 0, 0], [1, 0, 1], [1, 1, 1], [1, 0, 0]],
    [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]],
    [[0, 0, 1], [0, 0, 0], [1, 0, 0], [1, 0, 1], [0, -1, 0]],
    [[0, 1, 1], [1, 1, 1], [1, 0, 1], [0, 0, 1], [0, 0, 1]],
    [[1, 1, 0], [0, 1, 0], [0, 0, 0], [1, 0, 0], [0, 0, -1]],
  ];
  for (let pi = 0; pi < parts.length; pi++) {
    const p = parts[pi];
    const bx = [p[0], p[3]], by = [p[1], p[4]], bz = [p[2], p[5]];
    const pal = (palette && palette[pi]) || PREVIEW_COLORS[p[7]] || PREVIEW_COLORS.metal;
    for (const face of FACE_IDX) {
      const pts = [];
      let depth = 0;
      for (let i = 0; i < 4; i++) {
        const [ix, iy, iz] = face[i];
        const pr = project(bx[ix], by[iy], bz[iz]);
        pts.push(pr);
        depth += pr[2];
      }
      const n = face[4];
      // rotate the normal with the model for shading
      const nx = n[0] * ca + n[2] * sa;
      const ny = n[1];
      const nz = -n[0] * sa + n[2] * ca;
      const light = clamp(0.36 + 0.5 * Math.max(0, nx * 0.45 + ny * 0.72 - nz * 0.5) + 0.14 * ny, 0, 1);
      faces.push({ pts, depth: depth / 4, color: shadeColor(pal, light) });
    }
  }
  faces.sort((a, b) => a.depth - b.depth);
  for (const f of faces) {
    ctx.beginPath();
    ctx.moveTo(f.pts[0][0], f.pts[0][1]);
    for (let i = 1; i < 4; i++) ctx.lineTo(f.pts[i][0], f.pts[i][1]);
    ctx.closePath();
    ctx.fillStyle = f.color;
    ctx.fill();
  }
}

const PREVIEW_COLORS = {
  metal: [118, 124, 133], poly: [58, 60, 66], wood: [124, 86, 48],
  dark: [38, 40, 44], bright: [188, 194, 202],
};

/** Per-part preview colours for a skinned weapon (same maths as the mesh). */
function previewPaletteForSkin(kind, skinKey) {
  if (!skinKey || skinKey === 'stock') return null;
  const skin = SKINS[skinKey];
  if (!skin) return null;
  const parts = GUN_PARTS[kind] || GUN_PARTS.pistol;
  return parts.map((p, i) => {
    const tk = p[7];
    const base = PREVIEW_COLORS[tk] || PREVIEW_COLORS.metal;
    let m = skin.mult[tk];
    if (skin.accent && i % 3 === 2 && tk !== 'bright') m = skin.accent;
    if (!m) m = [1, 1, 1];
    return [
      Math.min(255, base[0] * m[0]),
      Math.min(255, base[1] * m[1]),
      Math.min(255, base[2] * m[2]),
    ];
  });
}

function shadeColor(rgb, light) {
  return `rgb(${Math.round(rgb[0] * light + 12)},${Math.round(rgb[1] * light + 12)},${Math.round(rgb[2] * light + 14)})`;
}

/* ------------------------------- HUD ------------------------------- */

class HUD {
  constructor(game) {
    this.game = game;
    this.settings = loadSettings();
    this.killfeed = [];
    this.damageDirs = [];
    this.shopCategory = 'rifle';
    this.shopSelection = null;
    this.previewAngle = 0.7;
    this.lastMoney = 0;

    this.el = {
      hud: $('hud'), crosshair: $('crosshair'), hitmarker: $('hitmarker'),
      scoreT: $('scoreT'), scoreCT: $('scoreCT'), roundTimer: $('roundTimer'),
      roundLabel: $('roundLabel'), pipsT: $('pipsT'), pipsCT: $('pipsCT'),
      killfeed: $('killfeed'), radar: $('radar'),
      healthVal: $('healthVal'), armorVal: $('armorVal'), healthRow: $('healthRow'),
      moneyVal: $('moneyVal'), moneyDelta: $('moneyDelta'),
      ammoMag: $('ammoMag'), ammoReserve: $('ammoReserve'), ammoRow: $('ammoRow'),
      weaponName: $('weaponName'), inventoryRow: $('inventoryRow'),
      centerMsg: $('centerMsg'), subMsg: $('subMsg'),
      progressWrap: $('progressWrap'), progressLabel: $('progressLabel'),
      progressBar: $('progressBar').firstElementChild,
      bombHud: $('bombHud'), bombTimer: $('bombTimer'),
      spectatorBar: $('spectatorBar'), specName: $('specName'),
      damageDirs: $('damageDirs'), buyHint: $('buyHint'),
      flash: $('flash'), damageFlash: $('damageFlash'), scope: $('scopeOverlay'),
      shop: $('shop'), shopGrid: $('shopGrid'), shopCats: $('shopCats'),
      shopMoney: $('shopMoney'), shopTimer: $('shopTimer'), shopTeamLabel: $('shopTeamLabel'),
      shopLoadout: $('shopLoadout'),
      pvName: $('pvName'), pvPrice: $('pvPrice'), pvDesc: $('pvDesc'),
      pvStats: $('pvStats'), pvBuy: $('pvBuy'), previewCanvas: $('previewCanvas'),
      pvSkinRow: $('pvSkinRow'), pvSkinName: $('pvSkinName'),
      scoreboard: $('scoreboard'), sbBodyT: $('sbBodyT'), sbBodyCT: $('sbBodyCT'),
      sbScoreT: $('sbScoreT'), sbScoreCT: $('sbScoreCT'),
    };

    this.chCtx = this.el.crosshair.getContext('2d');
    this.radarCtx = this.el.radar.getContext('2d');
    this.pvCtx = this.el.previewCanvas.getContext('2d');

    this._bindSettings();
    this._buildShopCategories();
    this.el.pvBuy.addEventListener('click', () => {
      if (this.shopSelection) this.game.buyItem(this.shopSelection);
    });
    $('pvSkinPrev').addEventListener('click', () => this.cycleSkin(-1));
    $('pvSkinNext').addEventListener('click', () => this.cycleSkin(1));
  }

  /** Step the selected weapon's skin. Skins are free and purely cosmetic. */
  cycleSkin(dir) {
    const item = this.shopSelection;
    if (!item || item.kind !== 'weapon') return;
    const cur = this.settings.skins[item.key] || 'stock';
    const i = SKIN_KEYS.indexOf(cur);
    const next = SKIN_KEYS[(i + dir + SKIN_KEYS.length) % SKIN_KEYS.length];
    this.settings.skins[item.key] = next;
    saveSettings(this.settings);
    this.el.pvSkinName.textContent = SKINS[next].name;
    delete this.game.viewmodelCache[item.key + ':' + cur];  // rebuilt on demand
    this.game.sound.play('switch');
  }

  /* ---------------------------- settings ---------------------------- */

  _bindSettings() {
    const s = this.settings;
    const bind = (id, key, out, fmt, isCheck) => {
      const el = $(id);
      if (!el) return;
      if (isCheck) el.checked = s[key];
      else el.value = s[key];
      const apply = () => {
        s[key] = isCheck ? el.checked
          : (el.tagName === 'SELECT' || el.type === 'color' ? el.value : parseFloat(el.value));
        if (out && fmt) $(out).textContent = fmt(s[key]);
        saveSettings(s);
        this.game.applySettings();
      };
      el.addEventListener('input', apply);
      if (out && fmt) $(out).textContent = fmt(s[key]);
    };
    bind('setControls', 'controlMode');
    bind('setSens', 'sens', 'outSens', v => v.toFixed(2));
    bind('setFov', 'fov', 'outFov', v => String(v));
    bind('setVol', 'volume', 'outVol', v => Math.round(v * 100) + '%');
    bind('setScale', 'renderScale', 'outScale', v => Math.round(v * 100) + '%');
    bind('setChSize', 'chSize', 'outChSize', v => String(v));
    bind('setChGap', 'chGap', 'outChGap', v => String(v));
    bind('setChThick', 'chThick', 'outChThick', v => String(v));
    bind('setChColor', 'chColor');
    bind('setChDot', 'chDot', null, null, true);
    bind('setChDynamic', 'chDynamic', null, null, true);
    bind('setShadows', 'shadows', null, null, true);
    bind('setViewmodel', 'viewmodel', null, null, true);
    bind('setInvertY', 'invertY', null, null, true);
  }

  /* ---------------------------- crosshair ---------------------------- */

  drawCrosshair(spreadPx, hidden) {
    const ctx = this.chCtx;
    const s = this.settings;
    ctx.clearRect(0, 0, 200, 200);
    if (hidden) return;
    const cx = 100, cy = 100;
    const gap = s.chGap + (s.chDynamic ? spreadPx : 0);
    const len = s.chSize;
    const th = s.chThick;
    ctx.fillStyle = s.chColor;
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur = 2;
    if (len > 0) {
      ctx.fillRect(cx - gap - len, cy - th / 2, len, th);
      ctx.fillRect(cx + gap, cy - th / 2, len, th);
      ctx.fillRect(cx - th / 2, cy - gap - len, th, len);
      ctx.fillRect(cx - th / 2, cy + gap, th, len);
    }
    if (s.chDot) ctx.fillRect(cx - th / 2, cy - th / 2, th, th);
    ctx.shadowBlur = 0;
  }

  /* ------------------------------ radar ------------------------------ */

  /** Pre-render the level top-down once; the live radar just transforms it. */
  buildRadarMap(map) {
    const size = 512;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    const b = map.bounds;
    const span = Math.max(b.x1 - b.x0, b.z1 - b.z0);
    const sc = size / span;
    const tx = (x) => (x - b.x0) * sc;
    const tz = (z) => (z - b.z0) * sc;

    ctx.fillStyle = 'rgba(30,34,40,0.85)';
    ctx.fillRect(0, 0, size, size);

    // walkable floor: everything not covered by a tall solid
    ctx.fillStyle = 'rgba(96,104,116,0.55)';
    ctx.fillRect(tx(b.x0), tz(b.z0), (b.x1 - b.x0) * sc, (b.z1 - b.z0) * sc);

    for (const s of map.solids) {
      if (s.noClip) continue;
      const h = s.max[1] - Math.max(0, s.min[1]);
      if (s.max[1] <= 0.05) continue;
      const tall = s.max[1] > 2.2;
      ctx.fillStyle = tall ? 'rgba(20,23,28,0.96)' : 'rgba(60,66,76,0.9)';
      ctx.fillRect(tx(s.min[0]), tz(s.min[2]), (s.max[0] - s.min[0]) * sc, (s.max[2] - s.min[2]) * sc);
      void h;
    }
    // bombsites
    for (const [name, site] of Object.entries(map.sites)) {
      ctx.fillStyle = 'rgba(224,90,60,0.20)';
      ctx.strokeStyle = 'rgba(224,90,60,0.7)';
      ctx.lineWidth = 2;
      const x = tx(site.min[0]), z = tz(site.min[1]);
      const w = (site.max[0] - site.min[0]) * sc, hh = (site.max[1] - site.min[1]) * sc;
      ctx.fillRect(x, z, w, hh);
      ctx.strokeRect(x, z, w, hh);
      ctx.fillStyle = 'rgba(255,150,120,0.85)';
      ctx.font = 'bold 34px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(name, x + w / 2, z + hh / 2);
    }
    this.radarMap = { canvas: c, size, sc, x0: b.x0, z0: b.z0 };
  }

  drawRadar(game) {
    const ctx = this.radarCtx;
    const R = this.el.radar.width;
    const me = game.viewTarget();
    ctx.clearRect(0, 0, R, R);
    if (!this.radarMap || !me) return;
    const zoom = 3.1;
    const rm = this.radarMap;

    ctx.save();
    ctx.beginPath();
    ctx.arc(R / 2, R / 2, R / 2 - 2, 0, TAU);
    ctx.clip();
    ctx.translate(R / 2, R / 2);
    ctx.rotate(-me.yaw + Math.PI);   // north = where the player faces
    ctx.scale(zoom, zoom);
    ctx.translate(-(me.pos[0] - rm.x0) * rm.sc, -(me.pos[2] - rm.z0) * rm.sc);
    ctx.drawImage(rm.canvas, 0, 0);

    const dot = (x, z, color, size, ring) => {
      ctx.beginPath();
      ctx.arc((x - rm.x0) * rm.sc, (z - rm.z0) * rm.sc, size, 0, TAU);
      ctx.fillStyle = color;
      ctx.fill();
      if (ring) {
        ctx.lineWidth = 1.2 / zoom * 2;
        ctx.strokeStyle = ring;
        ctx.stroke();
      }
    };

    for (const e of game.entities) {
      if (!e.alive) continue;
      const mine = e.team === me.team;
      if (!mine && !game.isSpotted(e)) continue;
      const color = mine ? (e === me ? '#ffffff' : '#4ad07a') : '#e0503c';
      dot(e.pos[0], e.pos[2], color, e === me ? 4.5 : 4, 'rgba(0,0,0,0.7)');
      // facing wedge
      ctx.save();
      ctx.translate((e.pos[0] - rm.x0) * rm.sc, (e.pos[2] - rm.z0) * rm.sc);
      ctx.rotate(-e.yaw);
      ctx.beginPath();
      ctx.moveTo(0, -4); ctx.lineTo(-3.4, -9.5); ctx.lineTo(3.4, -9.5);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.75;
      ctx.fill();
      ctx.restore();
    }

    const bomb = game.bomb;
    if (bomb.planted || bomb.dropped) {
      const p = bomb.pos;
      const blink = bomb.planted ? (Math.sin(game.time * 8) * 0.5 + 0.5) : 1;
      ctx.globalAlpha = 0.5 + blink * 0.5;
      dot(p[0], p[2], '#ffcc33', 5, '#000');
      ctx.globalAlpha = 1;
    } else if (bomb.carrier && bomb.carrier.team === me.team) {
      dot(bomb.carrier.pos[0], bomb.carrier.pos[2], '#ffcc33', 2.5);
    }

    for (const s of game.smokes) {
      ctx.beginPath();
      ctx.arc((s.pos[0] - rm.x0) * rm.sc, (s.pos[2] - rm.z0) * rm.sc, s.radius * rm.sc, 0, TAU);
      ctx.fillStyle = 'rgba(220,220,220,0.35)';
      ctx.fill();
    }
    ctx.restore();

    // static frame + cardinal tick
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(R / 2, R / 2, R / 2 - 2, 0, TAU);
    ctx.stroke();
  }

  /* ---------------------------- kill feed ---------------------------- */

  addKill(attacker, victim, weaponKey, headshot, penetrated, isMe) {
    const div = document.createElement('div');
    div.className = 'kf';
    const aTeam = attacker ? attacker.team.toLowerCase() : '';
    const icon = document.createElement('canvas');
    icon.width = 74; icon.height = 20;
    const ictx = icon.getContext('2d');
    const kind = weaponKey === 'grenade' ? 'grenade'
      : (WEAPONS[weaponKey] ? WEAPONS[weaponKey].model : 'grenade');
    drawWeaponIcon(ictx, kind, 74, 20, '#dfe3e9');

    const aName = attacker
      ? `<span class="${aTeam} ${attacker === isMe ? 'me' : ''}">${escapeHtml(attacker.name)}</span>`
      : '<span class="dim">world</span>';
    const vName = `<span class="${victim.team.toLowerCase()} ${victim === isMe ? 'me' : ''}">${escapeHtml(victim.name)}</span>`;
    div.innerHTML = aName;
    div.appendChild(icon);
    const tail = document.createElement('span');
    tail.innerHTML = `${penetrated ? '<span class="wall">wall</span> ' : ''}${headshot ? '<span class="hs">HS</span> ' : ''}${vName}`;
    div.appendChild(tail);
    this.el.killfeed.appendChild(div);
    this.killfeed.push({ el: div, until: performance.now() + 7000 });
    while (this.killfeed.length > 6) {
      const old = this.killfeed.shift();
      old.el.remove();
    }
  }

  tickKillfeed(now) {
    for (let i = this.killfeed.length - 1; i >= 0; i--) {
      if (now > this.killfeed[i].until) {
        this.killfeed[i].el.remove();
        this.killfeed.splice(i, 1);
      }
    }
  }

  /* -------------------------- feedback bits -------------------------- */

  hitmarker(kill) {
    const el = this.el.hitmarker;
    el.classList.remove('show', 'kill');
    void el.offsetWidth;   // restart the animation
    el.classList.add('show');
    if (kill) el.classList.add('kill');
  }

  damageDirection(angle) {
    const el = document.createElement('div');
    el.className = 'dmg-dir';
    el.style.transform = `rotate(${angle}rad)`;
    this.el.damageDirs.appendChild(el);
    requestAnimationFrame(() => { el.style.opacity = '0'; });
    setTimeout(() => el.remove(), 700);
  }

  damageFlash(amount) {
    const el = this.el.damageFlash;
    el.style.transition = 'none';
    el.style.opacity = String(Math.min(0.85, amount / 60));
    requestAnimationFrame(() => {
      el.style.transition = 'opacity 0.4s ease-out';
      el.style.opacity = '0';
    });
  }

  setFlash(v) { this.el.flash.style.opacity = String(clamp(v, 0, 1)); }

  centerMessage(text, sub) {
    this.el.centerMsg.textContent = text || '';
    this.el.centerMsg.classList.toggle('show', !!text);
    this.el.subMsg.textContent = sub || '';
    this.el.subMsg.classList.toggle('show', !!sub);
  }

  progress(label, frac) {
    if (frac === null || frac === undefined) {
      this.el.progressWrap.classList.remove('on');
      return;
    }
    this.el.progressWrap.classList.add('on');
    this.el.progressLabel.textContent = label;
    this.el.progressBar.style.width = (frac * 100).toFixed(1) + '%';
  }

  /* ------------------------------ update ------------------------------ */

  update(game, dt) {
    const me = game.viewTarget();
    const local = game.localPlayer;
    if (!me) return;

    this.el.scoreT.textContent = game.score.T;
    this.el.scoreCT.textContent = game.score.CT;
    this.el.sbScoreT.textContent = game.score.T;
    this.el.sbScoreCT.textContent = game.score.CT;
    this.el.roundLabel.textContent =
      `Round ${game.roundNumber}${game.mode === 'practice' ? ' · Practice' : ''}`;

    const t = Math.max(0, game.phaseTime);
    const mm = Math.floor(t / 60), ss = Math.floor(t % 60);
    this.el.roundTimer.textContent = `${mm}:${ss < 10 ? '0' : ''}${ss}`;
    this.el.roundTimer.classList.toggle('urgent', game.phase === 'live' && t < 20 && !game.bomb.planted);

    // alive pips
    for (const [team, el] of [['T', this.el.pipsT], ['CT', this.el.pipsCT]]) {
      const members = game.entities.filter(e => e.team === team);
      if (el.childElementCount !== members.length) {
        el.innerHTML = members.map(() => '<i></i>').join('');
      }
      members.forEach((m, i) => {
        el.children[i].classList.toggle('dead', !m.alive);
      });
    }

    this.el.healthVal.textContent = Math.max(0, Math.ceil(me.health));
    this.el.armorVal.textContent = Math.max(0, Math.ceil(me.armor));
    this.el.healthRow.classList.toggle('low', me.health <= 35);

    if (local.money !== this.lastMoney) {
      const delta = local.money - this.lastMoney;
      this.lastMoney = local.money;
      if (Math.abs(delta) > 0 && game.roundNumber > 0) {
        this.el.moneyDelta.textContent = (delta > 0 ? '+$' : '-$') + Math.abs(delta);
        this.el.moneyDelta.className = 'show ' + (delta > 0 ? 'plus' : 'minus');
        clearTimeout(this._moneyTimer);
        this._moneyTimer = setTimeout(() => { this.el.moneyDelta.className = ''; }, 1400);
      }
    }
    this.el.moneyVal.textContent = '$' + local.money;

    const w = me.weapon;
    const key = me.weaponKey;
    if (me.slot === 'grenade') {
      const g = GRENADES[me.grenades[me.grenadeIndex || 0]];
      this.el.ammoMag.textContent = String(me.grenades.filter(x => x === (g && g.key)).length);
      this.el.ammoReserve.textContent = '';
      this.el.weaponName.textContent = g ? g.name.toUpperCase() : '';
    } else if (me.slot === 'bomb') {
      this.el.ammoMag.textContent = '';
      this.el.ammoReserve.textContent = '';
      this.el.weaponName.textContent = 'C4 EXPLOSIVE';
    } else if (w && !w.melee) {
      const ammo = me.ammoFor(key);
      this.el.ammoMag.textContent = ammo.mag;
      this.el.ammoReserve.textContent = '/ ' + ammo.reserve;
      this.el.weaponName.textContent = w.name.toUpperCase();
      this.el.ammoRow.classList.toggle('empty', ammo.mag === 0);
    } else {
      this.el.ammoMag.textContent = '';
      this.el.ammoReserve.textContent = '';
      this.el.weaponName.textContent = w ? w.name.toUpperCase() : '';
    }

    this._updateInventory(me);

    // bomb timer
    const bomb = game.bomb;
    this.el.bombHud.classList.toggle('hidden', !bomb.planted);
    if (bomb.planted) this.el.bombTimer.textContent = bomb.timer.toFixed(1);

    // spectator
    const spectating = !local.alive && game.phase !== 'warmup' && game.mode !== 'practice';
    this.el.spectatorBar.classList.toggle('hidden', !spectating);
    if (spectating) {
      this.el.specName.textContent = me === local
        ? (game.time < (game.deathCamUntil || 0) ? 'death cam' : 'no teammates left')
        : me.name;
    }

    this.el.buyHint.classList.toggle('hidden', !(game.canBuy(local) && !game.shopOpen));

    this.drawRadar(game);
    this.tickKillfeed(performance.now());

    // crosshair spread reflects real inaccuracy
    let spread = 0;
    if (w && !w.melee) {
      const inacc = weaponInaccuracy(w, {
        speed: Math.hypot(me.vel[0], me.vel[2]), onGround: me.onGround,
        crouching: me.ducking, zoomed: me.zoomLevel > 0, shotSpread: me.shotSpread,
      });
      spread = clamp(inacc / DEG * 5.2, 0, 60);
    }
    this.drawCrosshair(spread, me.zoomLevel > 0 || game.shopOpen || !local.alive);
    this.el.scope.classList.toggle('on', me.zoomLevel > 0 && !!w && !w.scopedAccuracy);
  }

  _updateInventory(me) {
    const slots = [];
    if (me.inventory.primary) slots.push(['1', WEAPONS[me.inventory.primary].name, 'primary']);
    if (me.inventory.secondary) slots.push(['2', WEAPONS[me.inventory.secondary].name, 'secondary']);
    slots.push(['3', 'Knife', 'knife']);
    if (me.grenades.length) slots.push(['4', `Nades ×${me.grenades.length}`, 'grenade']);
    if (me.hasBomb) slots.push(['5', 'C4', 'bomb']);
    const sig = slots.map(s => s[1]).join('|') + '#' + me.slot;
    if (this._invSig === sig) return;
    this._invSig = sig;
    this.el.inventoryRow.innerHTML = slots.map(([k, name, slot]) =>
      `<div class="slot ${slot === me.slot ? 'active' : ''}"><span class="k">${k}</span>${escapeHtml(name)}</div>`
    ).join('');
  }

  /* ---------------------------- scoreboard ---------------------------- */

  updateScoreboard(game) {
    for (const [team, body] of [['T', this.el.sbBodyT], ['CT', this.el.sbBodyCT]]) {
      const rows = game.entities
        .filter(e => e.team === team)
        .sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
      body.innerHTML = rows.map(e => {
        const adr = game.roundNumber > 1 ? Math.round(e.damageDealt / (game.roundNumber - 1)) : 0;
        const tags = (e === game.localPlayer ? '<span class="you">YOU</span>' : '') +
          (e.isBot ? '<span class="bot">BOT</span>' : '');
        return `<tr class="${e === game.localPlayer ? 'me' : ''} ${e.alive ? '' : 'dead'}">
          <td>${escapeHtml(e.name)}${tags}</td>
          <td>${e.kills}</td><td>${e.deaths}</td><td>${e.assists}</td>
          <td>${adr}</td><td>$${e.money}</td></tr>`;
      }).join('');
    }
  }

  showScoreboard(show) {
    this.el.scoreboard.classList.toggle('hidden', !show);
    if (show) this.updateScoreboard(this.game);
  }

  /* ------------------------------- shop ------------------------------- */

  _buildShopCategories() {
    this.el.shopCats.innerHTML = SHOP_CATEGORIES.map((c, i) =>
      `<button data-cat="${c.key}"><span class="num">${i + 1}</span>${c.name}</button>`
    ).join('');
    this.el.shopCats.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => this.setShopCategory(btn.dataset.cat));
    });
  }

  setShopCategory(cat) {
    this.shopCategory = cat;
    this.el.shopCats.querySelectorAll('button').forEach(b =>
      b.classList.toggle('active', b.dataset.cat === cat));
    this.renderShop();
  }

  openShop(open) {
    this.el.shop.classList.toggle('hidden', !open);
    if (open) {
      this.setShopCategory(this.shopCategory);
      this.el.shopTeamLabel.textContent =
        ' — ' + (this.game.localPlayer.team === 'T' ? 'TERRORISTS' : 'COUNTER-TERRORISTS');
    }
  }

  renderShop() {
    const game = this.game;
    const p = game.localPlayer;
    const items = shopItemsFor(p.team, this.shopCategory);
    this.currentShopItems = items;
    this.el.shopMoney.textContent = p.money;
    this.el.shopGrid.innerHTML = '';
    items.forEach((item, i) => {
      const owned = game.ownsItem(p, item);
      const afford = p.money >= item.price;
      const div = document.createElement('div');
      div.className = 'item' + (owned ? ' owned' : '') + (afford ? '' : ' cant') +
        (this.shopSelection && this.shopSelection.key === item.key ? ' sel' : '');
      div.innerHTML = `<span class="num">${i + 1}</span><div class="nm">${escapeHtml(item.name)}</div>`;
      const cv = document.createElement('canvas');
      cv.width = 320; cv.height = 96;
      drawWeaponIcon(cv.getContext('2d'), item.model, 320, 96, owned ? '#8de8ab' : '#e8eaee');
      div.appendChild(cv);
      const pr = document.createElement('div');
      pr.className = 'pr';
      pr.textContent = '$' + item.price;
      div.appendChild(pr);
      if (owned) {
        const tag = document.createElement('span');
        tag.className = 'tag-owned';
        tag.textContent = 'OWNED';
        div.appendChild(tag);
      }
      div.addEventListener('click', () => {
        this.selectShopItem(item);
        game.buyItem(item);
      });
      div.addEventListener('mouseenter', () => this.selectShopItem(item));
      this.el.shopGrid.appendChild(div);
    });
    if (!this.shopSelection || !items.find(i => i.key === this.shopSelection.key)) {
      this.selectShopItem(items[0]);
    } else {
      this.updatePreviewInfo();
    }
    const loadout = [];
    if (p.inventory.primary) loadout.push(WEAPONS[p.inventory.primary].name);
    if (p.inventory.secondary) loadout.push(WEAPONS[p.inventory.secondary].name);
    if (p.armor > 0) loadout.push(p.helmet ? 'Kevlar+Helmet' : 'Kevlar');
    if (p.defuser) loadout.push('Defuse Kit');
    for (const g of p.grenades) loadout.push(GRENADES[g].name);
    this.el.shopLoadout.textContent = loadout.join(' · ') || 'No equipment';
  }

  selectShopItem(item) {
    if (!item) return;
    this.shopSelection = item;
    this.previewAngle = 0.7;
    this.el.shopGrid.querySelectorAll('.item').forEach((el, i) => {
      el.classList.toggle('sel', this.currentShopItems[i] === item);
    });
    this.updatePreviewInfo();
  }

  updatePreviewInfo() {
    const item = this.shopSelection;
    if (!item) return;
    const p = this.game.localPlayer;
    const owned = this.game.ownsItem(p, item);
    this.el.pvName.textContent = item.name;
    this.el.pvPrice.textContent = '$' + item.price;
    this.el.pvDesc.textContent = item.desc || '';
    this.el.pvBuy.disabled = owned || p.money < item.price || !this.game.canBuy(p);
    this.el.pvBuy.textContent = owned ? 'ALREADY OWNED'
      : (p.money < item.price ? 'NOT ENOUGH MONEY' : 'BUY  $' + item.price);

    const isWeapon = item.kind === 'weapon';
    this.el.pvSkinRow.style.display = isWeapon ? '' : 'none';
    if (isWeapon) {
      const skin = this.settings.skins[item.key] || 'stock';
      this.el.pvSkinName.textContent = (SKINS[skin] || SKINS.stock).name;
    }

    const w = item.weapon;
    if (!w) { this.el.pvStats.innerHTML = ''; return; }
    const stat = (label, frac, text) => `<div class="stat"><span>${label}</span>
      <span class="bar"><i style="width:${clamp(frac, 0, 1) * 100}%"></i></span>
      <span class="val">${text}</span></div>`;
    const dps = w.pellets
      ? w.damage * w.pellets * w.fireRate
      : w.damage * w.fireRate;
    this.el.pvStats.innerHTML =
      stat('Damage', w.damage / 120, w.pellets ? `${w.damage}×${w.pellets}` : w.damage) +
      stat('Fire rate', Math.min(1, w.fireRate / 15), Math.round(w.fireRate * 60) + ' rpm') +
      stat('Armour pen.', w.armorPen, Math.round(w.armorPen * 100) + '%') +
      stat('Accuracy', 1 - clamp(w.inaccuracy[0] / 5, 0, 1), w.inaccuracy[0].toFixed(2) + '°') +
      stat('Mobility', (w.speed - 0.8) / 0.22, Math.round(w.speed * 100) + '%') +
      stat('Magazine', Math.min(1, w.mag / 60), String(w.mag)) +
      stat('DPS', Math.min(1, dps / 400), Math.round(dps));
  }

  tickPreview(dt) {
    if (this.el.shop.classList.contains('hidden') || !this.shopSelection) return;
    this.previewAngle += dt * 0.55;
    const cv = this.el.previewCanvas;
    const skin = this.shopSelection.kind === 'weapon'
      ? (this.settings.skins[this.shopSelection.key] || 'stock') : 'stock';
    drawWeaponPreview(this.pvCtx, this.shopSelection.model, cv.width, cv.height,
      this.previewAngle, previewPaletteForSkin(this.shopSelection.model, skin));
  }

  setShopTimer(text) { this.el.shopTimer.textContent = text; }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
