'use strict';
/* ------------------------------------------------------------------
   textures.js — everything is painted at runtime on a 2D canvas, so the
   game ships with zero binary assets. Materials go into one
   TEXTURE_2D_ARRAY, sprites into another.
   ------------------------------------------------------------------ */

const TEX_SIZE = 128;
const SPRITE_SIZE = 64;

/** Material layer indices used by the map and models. */
const MAT = {
  GROUND: 0,
  SANDSTONE: 1,
  CONCRETE: 2,
  CRATE: 3,
  METAL: 4,
  BRICK: 5,
  TILE: 6,
  PLASTER: 7,
  WOOD: 8,
  SITE_A: 9,
  SITE_B: 10,
  ASPHALT: 11,
  CLOTH_T: 12,
  CLOTH_CT: 13,
  SKIN: 14,
  GUNMETAL: 15,
  GUNPOLY: 16,
  BOMB: 17,
  DOOR: 18,
  CARPET: 19,
};
const MAT_COUNT = 20;

const SPR = { SMOKE: 0, SPARK: 1, BLOOD: 2, HOLE: 3, FLASH: 4, DUST: 5, GLOW: 6, RING: 7 };
const SPR_COUNT = 8;

/* --------------------------- paint utils --------------------------- */

function newCanvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

function fillRect(ctx, color, x, y, w, h) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

/** Per-pixel value noise blended over whatever is already drawn. */
function grain(ctx, size, amount) {
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * amount;
    d[i] = clamp(d[i] + n, 0, 255);
    d[i + 1] = clamp(d[i + 1] + n, 0, 255);
    d[i + 2] = clamp(d[i + 2] + n, 0, 255);
  }
  ctx.putImageData(img, 0, 0);
}

/** Soft blotches — breaks up flat surfaces so walls do not look like plastic. */
function blotches(ctx, size, count, colors, minR, maxR, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  for (let i = 0; i < count; i++) {
    const x = Math.random() * size, y = Math.random() * size;
    const r = rand(minR, maxR);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const col = pick(colors);
    g.addColorStop(0, col);
    g.addColorStop(1, col.replace('rgb(', 'rgba(').replace(')', ',0)'));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

/** Thin scratches / cracks. */
function scratches(ctx, size, count, color, alpha, len) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  for (let i = 0; i < count; i++) {
    let x = Math.random() * size, y = Math.random() * size;
    ctx.beginPath();
    ctx.moveTo(x, y);
    let a = Math.random() * TAU;
    for (let s = 0; s < 4; s++) {
      a += rand(-0.6, 0.6);
      x += Math.cos(a) * len; y += Math.sin(a) * len;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

/** Offset brick / block courses with mortar gaps. */
function bricks(ctx, size, rows, cols, base, variants, mortar, gap) {
  fillRect(ctx, mortar, 0, 0, size, size);
  const bh = size / rows, bw = size / cols;
  for (let r = 0; r < rows; r++) {
    const off = (r % 2) * bw * 0.5;
    for (let c = -1; c <= cols; c++) {
      const x = c * bw + off, y = r * bh;
      ctx.fillStyle = variants.length ? pick(variants) : base;
      ctx.fillRect(x + gap, y + gap, bw - gap * 2, bh - gap * 2);
      // top highlight + bottom shade give the courses some relief
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.fillRect(x + gap, y + gap, bw - gap * 2, 1);
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(x + gap, y + bh - gap - 1, bw - gap * 2, 1);
    }
  }
}

/* --------------------------- materials --------------------------- */

const MATERIAL_PAINTERS = {
  [MAT.GROUND](ctx, s) {
    fillRect(ctx, '#b5a077', 0, 0, s, s);
    blotches(ctx, s, 40, ['rgb(198,180,138)', 'rgb(160,140,100)', 'rgb(180,163,120)'], 6, 30, 0.5);
    grain(ctx, s, 26);
    // scattered pebbles
    for (let i = 0; i < 120; i++) {
      ctx.fillStyle = `rgba(${randi(90, 150)},${randi(80, 130)},${randi(60, 100)},0.5)`;
      ctx.fillRect(Math.random() * s, Math.random() * s, rand(1, 2.4), rand(1, 2.4));
    }
  },
  [MAT.SANDSTONE](ctx, s) {
    bricks(ctx, s, 4, 2, '#c9b285', ['#c9b285', '#c2a97c', '#d2bd92', '#bda775'], '#8d7a55', 2);
    blotches(ctx, s, 18, ['rgb(150,133,99)', 'rgb(214,199,163)'], 8, 26, 0.35);
    scratches(ctx, s, 14, '#8a7952', 0.35, 7);
    grain(ctx, s, 16);
  },
  [MAT.CONCRETE](ctx, s) {
    fillRect(ctx, '#9c9a93', 0, 0, s, s);
    blotches(ctx, s, 26, ['rgb(130,129,124)', 'rgb(176,175,168)'], 10, 40, 0.4);
    scratches(ctx, s, 10, '#6d6c67', 0.4, 9);
    // form-work seams
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    ctx.fillRect(0, s / 2 - 1, s, 2);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(0, s / 2 + 1, s, 1);
    grain(ctx, s, 20);
  },
  [MAT.CRATE](ctx, s) {
    fillRect(ctx, '#9a6f3c', 0, 0, s, s);
    // planks
    for (let i = 0; i < 4; i++) {
      const y = i * s / 4;
      ctx.fillStyle = pick(['#a4763f', '#8f6636', '#ab7f48', '#96702f']);
      ctx.fillRect(0, y + 1, s, s / 4 - 2);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(0, y + s / 4 - 2, s, 2);
      // grain lines
      ctx.strokeStyle = 'rgba(80,50,20,0.25)';
      for (let g = 0; g < 5; g++) {
        ctx.beginPath();
        const yy = y + rand(2, s / 4 - 3);
        ctx.moveTo(0, yy);
        ctx.bezierCurveTo(s * 0.3, yy + rand(-2, 2), s * 0.6, yy + rand(-2, 2), s, yy + rand(-2, 2));
        ctx.stroke();
      }
    }
    // corner banding + bolts
    fillRect(ctx, '#5d5b56', 0, 0, s, 6);
    fillRect(ctx, '#5d5b56', 0, s - 6, s, 6);
    fillRect(ctx, '#5d5b56', 0, 0, 6, s);
    fillRect(ctx, '#5d5b56', s - 6, 0, 6, s);
    ctx.fillStyle = '#3f3e3a';
    for (let i = 0; i < 4; i++) {
      const p = 3 + i * (s - 6) / 3;
      ctx.beginPath(); ctx.arc(p, 3, 1.6, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(p, s - 3, 1.6, 0, TAU); ctx.fill();
    }
    grain(ctx, s, 14);
  },
  [MAT.METAL](ctx, s) {
    fillRect(ctx, '#7f858c', 0, 0, s, s);
    // corrugation
    for (let x = 0; x < s; x += 8) {
      const g = ctx.createLinearGradient(x, 0, x + 8, 0);
      g.addColorStop(0, 'rgba(0,0,0,0.22)');
      g.addColorStop(0.5, 'rgba(255,255,255,0.16)');
      g.addColorStop(1, 'rgba(0,0,0,0.22)');
      ctx.fillStyle = g;
      ctx.fillRect(x, 0, 8, s);
    }
    blotches(ctx, s, 12, ['rgb(120,80,50)', 'rgb(90,70,60)'], 4, 16, 0.35); // rust
    scratches(ctx, s, 18, '#4b4f54', 0.3, 8);
    grain(ctx, s, 12);
  },
  [MAT.BRICK](ctx, s) {
    bricks(ctx, s, 8, 4, '#8f4a3a', ['#8f4a3a', '#9c5442', '#7e4132', '#a45c46'], '#6d6459', 1.5);
    blotches(ctx, s, 14, ['rgb(60,45,40)', 'rgb(170,120,100)'], 6, 20, 0.28);
    grain(ctx, s, 16);
  },
  [MAT.TILE](ctx, s) {
    bricks(ctx, s, 4, 4, '#b3ada0', ['#b3ada0', '#a9a396', '#bdb7aa'], '#7d786e', 1.5);
    scratches(ctx, s, 12, '#8b867c', 0.3, 8);
    grain(ctx, s, 12);
  },
  [MAT.PLASTER](ctx, s) {
    fillRect(ctx, '#d8cdb4', 0, 0, s, s);
    blotches(ctx, s, 30, ['rgb(196,184,158)', 'rgb(226,217,196)'], 8, 34, 0.4);
    scratches(ctx, s, 8, '#a89a7c', 0.3, 10);
    // chipped patch showing brick underneath
    ctx.fillStyle = 'rgba(140,88,70,0.55)';
    ctx.beginPath();
    ctx.ellipse(rand(20, 108), rand(20, 108), rand(6, 14), rand(5, 11), rand(0, TAU), 0, TAU);
    ctx.fill();
    grain(ctx, s, 14);
  },
  [MAT.WOOD](ctx, s) {
    fillRect(ctx, '#6b4a2c', 0, 0, s, s);
    for (let i = 0; i < 6; i++) {
      const x = i * s / 6;
      ctx.fillStyle = pick(['#71512f', '#5f4226', '#7b5936', '#664927']);
      ctx.fillRect(x + 1, 0, s / 6 - 2, s);
      ctx.strokeStyle = 'rgba(40,25,12,0.35)';
      for (let g = 0; g < 6; g++) {
        ctx.beginPath();
        const xx = x + rand(1, s / 6 - 2);
        ctx.moveTo(xx, 0); ctx.lineTo(xx + rand(-1.5, 1.5), s);
        ctx.stroke();
      }
    }
    grain(ctx, s, 14);
  },
  [MAT.SITE_A](ctx, s) { paintSite(ctx, s, 'A', '#c9503c'); },
  [MAT.SITE_B](ctx, s) { paintSite(ctx, s, 'B', '#c9503c'); },
  [MAT.ASPHALT](ctx, s) {
    fillRect(ctx, '#4c4c4e', 0, 0, s, s);
    blotches(ctx, s, 30, ['rgb(64,64,66)', 'rgb(40,40,42)'], 6, 24, 0.5);
    for (let i = 0; i < 500; i++) {
      ctx.fillStyle = `rgba(${randi(70, 120)},${randi(70, 120)},${randi(70, 120)},0.35)`;
      ctx.fillRect(Math.random() * s, Math.random() * s, 1.2, 1.2);
    }
    grain(ctx, s, 18);
  },
  [MAT.CLOTH_T](ctx, s) {
    fillRect(ctx, '#8d7b52', 0, 0, s, s);
    // desert camo dabs
    for (const col of ['#6f6039', '#a5946a', '#5b5330']) {
      ctx.fillStyle = col;
      for (let i = 0; i < 26; i++) {
        ctx.beginPath();
        ctx.ellipse(Math.random() * s, Math.random() * s, rand(4, 12), rand(3, 9), rand(0, TAU), 0, TAU);
        ctx.fill();
      }
    }
    grain(ctx, s, 14);
  },
  [MAT.CLOTH_CT](ctx, s) {
    fillRect(ctx, '#3d4a60', 0, 0, s, s);
    for (const col of ['#2c3648', '#4d5c74', '#232b3a']) {
      ctx.fillStyle = col;
      for (let i = 0; i < 26; i++) {
        ctx.beginPath();
        ctx.ellipse(Math.random() * s, Math.random() * s, rand(4, 12), rand(3, 9), rand(0, TAU), 0, TAU);
        ctx.fill();
      }
    }
    grain(ctx, s, 14);
  },
  [MAT.SKIN](ctx, s) {
    fillRect(ctx, '#a9805c', 0, 0, s, s);
    blotches(ctx, s, 16, ['rgb(150,110,78)', 'rgb(196,155,120)'], 8, 26, 0.35);
    grain(ctx, s, 10);
  },
  [MAT.GUNMETAL](ctx, s) {
    fillRect(ctx, '#3a3d42', 0, 0, s, s);
    blotches(ctx, s, 16, ['rgb(28,30,33)', 'rgb(74,78,84)'], 6, 26, 0.5);
    scratches(ctx, s, 26, '#8a8f96', 0.25, 8);
    grain(ctx, s, 10);
  },
  [MAT.GUNPOLY](ctx, s) {
    fillRect(ctx, '#2b2b2e', 0, 0, s, s);
    // stippled polymer grip
    for (let y = 0; y < s; y += 4) {
      for (let x = 0; x < s; x += 4) {
        ctx.fillStyle = `rgba(255,255,255,${rand(0.02, 0.08)})`;
        ctx.fillRect(x, y, 2, 2);
      }
    }
    grain(ctx, s, 8);
  },
  [MAT.BOMB](ctx, s) {
    fillRect(ctx, '#2e2f31', 0, 0, s, s);
    fillRect(ctx, '#c0392b', 0, s * 0.35, s, s * 0.12);
    fillRect(ctx, '#e0b040', 0, s * 0.62, s, 4);
    ctx.fillStyle = '#111';
    ctx.fillRect(s * 0.2, s * 0.08, s * 0.6, s * 0.2);
    ctx.fillStyle = '#54ff54';
    ctx.font = 'bold 14px monospace';
    ctx.fillText('C4', s * 0.36, s * 0.23);
    grain(ctx, s, 10);
  },
  [MAT.DOOR](ctx, s) {
    fillRect(ctx, '#6a6f74', 0, 0, s, s);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 3;
    ctx.strokeRect(8, 8, s - 16, s - 16);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    ctx.strokeRect(10, 10, s - 20, s - 20);
    blotches(ctx, s, 10, ['rgb(120,80,50)'], 4, 12, 0.3);
    grain(ctx, s, 12);
  },
  [MAT.CARPET](ctx, s) {
    fillRect(ctx, '#5c4a3f', 0, 0, s, s);
    for (let i = 0; i < 2500; i++) {
      ctx.fillStyle = `rgba(${randi(70, 110)},${randi(55, 85)},${randi(45, 70)},0.6)`;
      ctx.fillRect(Math.random() * s, Math.random() * s, 1.5, 1.5);
    }
  },
};

function paintSite(ctx, s, letter, color) {
  // Painted straight onto the ground material so the marker blends into the
  // dirt instead of reading as a bright rectangle dropped on the site.
  MATERIAL_PAINTERS[MAT.GROUND](ctx, s);
  ctx.save();
  ctx.globalAlpha = 0.75;
  ctx.strokeStyle = color;
  ctx.lineWidth = 5;
  ctx.strokeRect(9, 9, s - 18, s - 18);
  ctx.fillStyle = color;
  ctx.font = 'bold 74px Impact, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letter, s / 2, s / 2 + 4);
  ctx.restore();
  // scuff the paint so it reads as worn
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = `rgba(0,0,0,${rand(0.15, 0.5)})`;
    ctx.beginPath();
    ctx.arc(Math.random() * s, Math.random() * s, rand(2, 7), 0, TAU);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
}

/* ---------------------------- sprites ---------------------------- */

const SPRITE_PAINTERS = {
  [SPR.SMOKE](ctx, s) {
    const c = s / 2;
    for (let i = 0; i < 26; i++) {
      const x = c + rand(-s * 0.2, s * 0.2), y = c + rand(-s * 0.2, s * 0.2);
      const r = rand(s * 0.12, s * 0.3);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,0.16)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    }
    // fade the rim so the quad edge never shows
    const g2 = ctx.createRadialGradient(c, c, s * 0.2, c, c, c);
    g2.addColorStop(0, 'rgba(0,0,0,0)');
    g2.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, s, s);
    ctx.globalCompositeOperation = 'source-over';
  },
  [SPR.SPARK](ctx, s) {
    const c = s / 2;
    const g = ctx.createRadialGradient(c, c, 0, c, c, c);
    g.addColorStop(0, 'rgba(255,246,214,1)');
    g.addColorStop(0.25, 'rgba(255,190,80,0.85)');
    g.addColorStop(1, 'rgba(255,120,20,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  },
  [SPR.BLOOD](ctx, s) {
    const c = s / 2;
    for (let i = 0; i < 14; i++) {
      ctx.fillStyle = `rgba(${randi(120, 190)},${randi(6, 24)},${randi(6, 22)},${rand(0.5, 0.95)})`;
      ctx.beginPath();
      ctx.ellipse(c + rand(-14, 14), c + rand(-14, 14), rand(3, 11), rand(3, 11), rand(0, TAU), 0, TAU);
      ctx.fill();
    }
  },
  [SPR.HOLE](ctx, s) {
    const c = s / 2;
    const g = ctx.createRadialGradient(c, c, 1, c, c, c * 0.55);
    g.addColorStop(0, 'rgba(10,8,6,0.95)');
    g.addColorStop(0.55, 'rgba(40,34,28,0.7)');
    g.addColorStop(1, 'rgba(90,80,70,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(c, c, c * 0.55, 0, TAU); ctx.fill();
    // radial cracks
    ctx.strokeStyle = 'rgba(30,26,22,0.5)';
    for (let i = 0; i < 7; i++) {
      const a = Math.random() * TAU, len = rand(c * 0.3, c * 0.85);
      ctx.beginPath();
      ctx.moveTo(c + Math.cos(a) * 3, c + Math.sin(a) * 3);
      ctx.lineTo(c + Math.cos(a) * len, c + Math.sin(a) * len);
      ctx.stroke();
    }
  },
  [SPR.FLASH](ctx, s) {
    const c = s / 2;
    const g = ctx.createRadialGradient(c, c, 0, c, c, c);
    g.addColorStop(0, 'rgba(255,255,235,1)');
    g.addColorStop(0.3, 'rgba(255,214,120,0.8)');
    g.addColorStop(1, 'rgba(255,150,30,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(c, c, c, 0, TAU); ctx.fill();
    // star spikes
    ctx.save();
    ctx.translate(c, c);
    ctx.fillStyle = 'rgba(255,240,200,0.75)';
    for (let i = 0; i < 5; i++) {
      ctx.rotate(TAU / 5);
      ctx.beginPath();
      ctx.moveTo(0, 0); ctx.lineTo(c * 0.9, -3); ctx.lineTo(c * 0.9, 3);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  },
  [SPR.DUST](ctx, s) {
    const c = s / 2;
    const g = ctx.createRadialGradient(c, c, 0, c, c, c);
    g.addColorStop(0, 'rgba(206,190,152,0.55)');
    g.addColorStop(1, 'rgba(206,190,152,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  },
  [SPR.GLOW](ctx, s) {
    const c = s / 2;
    const g = ctx.createRadialGradient(c, c, 0, c, c, c);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  },
  [SPR.RING](ctx, s) {
    const c = s / 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(c, c, c - 6, 0, TAU); ctx.stroke();
  },
};

/** Build both texture arrays and hand back the raw pixel data. */
function buildTextureArrays() {
  const mats = new Uint8Array(TEX_SIZE * TEX_SIZE * 4 * MAT_COUNT);
  const canvas = newCanvas(TEX_SIZE);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  for (let layer = 0; layer < MAT_COUNT; layer++) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, TEX_SIZE, TEX_SIZE);
    const painter = MATERIAL_PAINTERS[layer];
    if (painter) painter(ctx, TEX_SIZE);
    else fillRect(ctx, '#ff00ff', 0, 0, TEX_SIZE, TEX_SIZE);
    const data = ctx.getImageData(0, 0, TEX_SIZE, TEX_SIZE).data;
    mats.set(data, layer * TEX_SIZE * TEX_SIZE * 4);
  }

  const sprites = new Uint8Array(SPRITE_SIZE * SPRITE_SIZE * 4 * SPR_COUNT);
  const sc = newCanvas(SPRITE_SIZE);
  const sctx = sc.getContext('2d', { willReadFrequently: true });
  for (let layer = 0; layer < SPR_COUNT; layer++) {
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.clearRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);
    const painter = SPRITE_PAINTERS[layer];
    if (painter) painter(sctx, SPRITE_SIZE);
    const data = sctx.getImageData(0, 0, SPRITE_SIZE, SPRITE_SIZE).data;
    sprites.set(data, layer * SPRITE_SIZE * SPRITE_SIZE * 4);
  }

  return { mats, sprites };
}
