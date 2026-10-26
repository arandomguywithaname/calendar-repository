/* reveals.js — one unique reveal per aura. A reveal is a scene (what the screen does), a title
   style (how the name appears) and an overlay. 24 x 8 x 5 = 960 combinations, assigned
   deterministically so that no two auras share one. Common and Uncommon rolls have no reveal. */
(function (global) {
  "use strict";

  var TAU = Math.PI * 2;

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function fmt(n) { return Math.floor(n).toLocaleString("en-US"); }
  function ease(p) { return 1 - Math.pow(1 - p, 3); }
  function easeIn(p) { return p * p * p; }
  function clamp01(x) { return Math.max(0, Math.min(1, x)); }
  function lerp(a, b, p) { return a + (b - a) * p; }
  function withAlpha(hsl, a) {
    /* colours are "#rrggbb" or "hsl(h, s%, l%)" */
    if (hsl[0] === "#") {
      var r = parseInt(hsl.slice(1, 3), 16), g = parseInt(hsl.slice(3, 5), 16), b = parseInt(hsl.slice(5, 7), 16);
      return "rgba(" + r + "," + g + "," + b + "," + a + ")";
    }
    return hsl.replace("hsl(", "hsla(").replace(")", ", " + a + ")");
  }
  function fill(ctx, w, h, color) { ctx.fillStyle = color; ctx.fillRect(0, 0, w, h); }
  function glow(ctx, color, blur) { ctx.shadowColor = color; ctx.shadowBlur = blur; }
  function noglow(ctx) { ctx.shadowBlur = 0; }
  function label(ctx, text, x, y, size, color, align, font) {
    ctx.font = (font || "600") + " " + size + "px Rajdhani, sans-serif";
    ctx.textAlign = align || "center";
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }
  function fadeIn(ctx, t, w, h, secs) {
    if (t < secs) { ctx.fillStyle = "#000"; ctx.globalAlpha = 1 - t / secs; ctx.fillRect(0, 0, w, h); ctx.globalAlpha = 1; }
  }
  function flash(ctx, w, h, amount, color) {
    if (amount <= 0) return;
    ctx.fillStyle = color || "#fff"; ctx.globalAlpha = Math.min(1, amount); ctx.fillRect(0, 0, w, h); ctx.globalAlpha = 1;
  }

  /* ---------- Scenes. make(env) returns draw(ctx, t, w, h). env: aura, colors, c1, c2, name, rarity, dur, rng, level ---------- */

  var SCENES = {

    /* A line chart of rarity over time that climbs to the aura's odds. */
    graph: { titleAt: 0.74, oddsAt: 0.88, textY: 0.5, make: function (env) {
      var n = 64, noise = [];
      for (var i = 0; i <= n; i++) noise.push(env.rng());
      return function (ctx, t, w, h) {
        var p = t / env.dur;
        fill(ctx, w, h, "#060913");
        var L = Math.max(70, w * 0.09), R = w - 50, T = 110, B = h - 120, plotW = R - L, plotH = B - T;
        ctx.strokeStyle = "rgba(255,255,255,.07)"; ctx.lineWidth = 1;
        for (var gx = 0; gx <= 8; gx++) { var x = L + plotW * gx / 8; ctx.beginPath(); ctx.moveTo(x, T); ctx.lineTo(x, B); ctx.stroke(); }
        for (var gy = 0; gy <= 4; gy++) { var y = T + plotH * gy / 4; ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(R, y); ctx.stroke(); }
        ctx.strokeStyle = withAlpha(env.c1, 0.9); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(L, T); ctx.lineTo(L, B); ctx.lineTo(R, B); ctx.stroke();
        for (var k = 0; k <= 4; k++) label(ctx, "1 in " + fmt(env.rarity * k / 4), L - 10, B - plotH * k / 4 + 5, 13, "rgba(255,255,255,.6)", "right");
        label(ctx, "RARITY OVER TIME", w / 2, 64, 15, "rgba(255,255,255,.75)", "center", "700");
        label(ctx, "time →", R, B + 28, 13, "rgba(255,255,255,.5)", "right");
        var q = clamp01(p / 0.7), m = Math.floor(q * n);
        var val = function (i) { var f = i / n; return env.rarity * Math.pow(f, 3.4) * (1 + (noise[i] - 0.5) * 0.18 * (1 - f)); };
        ctx.beginPath();
        for (var j = 0; j <= m; j++) { var vx = L + plotW * j / n, vy = B - clamp01(val(j) / env.rarity) * plotH; if (j === 0) ctx.moveTo(vx, vy); else ctx.lineTo(vx, vy); }
        var lx = L + plotW * q, lv = val(Math.min(n, m)) * (q >= 1 ? 1 : 1), ly = B - clamp01(lv / env.rarity) * plotH;
        if (q >= 1) { lv = env.rarity; ly = T; }
        ctx.lineTo(lx, ly);
        glow(ctx, env.c1, 18); ctx.strokeStyle = env.c1; ctx.lineWidth = 3.5; ctx.stroke(); noglow(ctx);
        ctx.lineTo(lx, B); ctx.lineTo(L, B); ctx.closePath();
        var g = ctx.createLinearGradient(0, T, 0, B); g.addColorStop(0, withAlpha(env.c1, 0.35)); g.addColorStop(1, withAlpha(env.c2, 0.02));
        ctx.fillStyle = g; ctx.fill();
        var pulse = q >= 1 ? 6 + 4 * Math.sin(t * 8) : 5;
        glow(ctx, "#fff", 20); ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(lx, ly, pulse, 0, TAU); ctx.fill(); noglow(ctx);
        label(ctx, "1 in " + fmt(lv), Math.min(lx, R - 90), ly - 16, 20, "#fff", "center", "700");
        if (q >= 1) {
          ctx.setLineDash([8, 8]); ctx.strokeStyle = withAlpha(env.c1, 0.7); ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(L, T); ctx.lineTo(R, T); ctx.stroke(); ctx.setLineDash([]);
          flash(ctx, w, h, (0.25 - (p - 0.7)) * 2, env.c1);
        }
        fadeIn(ctx, t, w, h, 0.5);
      };
    } },

    /* An odometer that counts up to the odds. */
    counter: { titleAt: 0.78, oddsAt: 0.9, textY: 0.7, make: function (env) {
      return function (ctx, t, w, h) {
        var p = t / env.dur, q = clamp01(p / 0.72);
        var g = ctx.createRadialGradient(w / 2, h * 0.38, 0, w / 2, h * 0.38, Math.max(w, h) * 0.6);
        g.addColorStop(0, withAlpha(env.c2, 0.6)); g.addColorStop(1, "#04040a");
        fill(ctx, w, h, g);
        var v = env.rarity * (1 - Math.pow(1 - q, 4));
        if (q < 1) v += env.rng() * Math.max(1, env.rarity * 0.002 * (1 - q));
        label(ctx, "1 IN", w / 2, h * 0.27, 22, "rgba(255,255,255,.6)", "center", "700");
        var size = Math.min(w * 0.11, 110);
        ctx.font = "900 " + size + "px Cinzel, serif"; ctx.textAlign = "center";
        glow(ctx, env.c1, q >= 1 ? 40 + 20 * Math.sin(t * 6) : 14);
        ctx.fillStyle = q >= 1 ? "#fff" : env.c1;
        ctx.fillText(fmt(Math.min(v, env.rarity)), w / 2, h * 0.42);
        noglow(ctx);
        if (q >= 1) { var rr = ((p - 0.72) * 3) % 1; ctx.strokeStyle = withAlpha(env.c1, 1 - rr); ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(w / 2, h * 0.38, 80 + rr * 420, 0, TAU); ctx.stroke(); }
        fadeIn(ctx, t, w, h, 0.4);
      };
    } },

    /* Slot machine reels locking the digits of the odds one by one. */
    reels: { titleAt: 0.8, oddsAt: 0.92, textY: 0.72, make: function (env) {
      var digits = String(env.rarity).split("").map(Number), n = digits.length;
      var offs = digits.map(function () { return env.rng() * 10; });
      return function (ctx, t, w, h) {
        var p = t / env.dur;
        fill(ctx, w, h, "#0b0810");
        var cell = Math.min(90, (w - 80) / n - 8), gap = 8, total = n * cell + (n - 1) * gap, x0 = (w - total) / 2, y0 = h * 0.36 - cell * 0.75, ch = cell * 1.5;
        for (var i = 0; i < n; i++) {
          var lockAt = 0.15 + 0.6 * (i / Math.max(1, n - 1)), locked = p >= lockAt;
          var x = x0 + i * (cell + gap);
          ctx.fillStyle = "#15111f"; ctx.strokeStyle = locked ? env.c1 : "rgba(255,255,255,.15)"; ctx.lineWidth = locked ? 3 : 1.5;
          glow(ctx, locked ? env.c1 : "#000", locked ? 18 : 0);
          ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y0, cell, ch, 12) : ctx.rect(x, y0, cell, ch); ctx.fill(); ctx.stroke(); noglow(ctx);
          ctx.save(); ctx.beginPath(); ctx.rect(x, y0, cell, ch); ctx.clip();
          ctx.font = "900 " + Math.round(cell * 0.8) + "px Cinzel, serif"; ctx.textAlign = "center";
          if (locked) { ctx.fillStyle = "#fff"; glow(ctx, env.c1, 12); ctx.fillText(String(digits[i]), x + cell / 2, y0 + ch * 0.72); noglow(ctx); }
          else {
            var spin = (t * 14 + offs[i]) % 10;
            for (var d = -1; d <= 2; d++) { var dg = ((Math.floor(spin) + d) % 10 + 10) % 10, yy = y0 + ch * 0.72 + (d - (spin % 1)) * ch * 0.6; ctx.fillStyle = "rgba(255,255,255,.35)"; ctx.fillText(String(dg), x + cell / 2, yy); }
          }
          ctx.restore();
          if (locked && p - lockAt < 0.12) { ctx.strokeStyle = "#fff"; ctx.globalAlpha = 1 - (p - lockAt) / 0.12; ctx.lineWidth = 3; ctx.strokeRect(x - 6, y0 - 6, cell + 12, ch + 12); ctx.globalAlpha = 1; }
        }
        label(ctx, "1 IN", w / 2, y0 - 22, 20, "rgba(255,255,255,.6)", "center", "700");
        fadeIn(ctx, t, w, h, 0.4);
      };
    } },

    /* A terminal typing out the scan results. */
    terminal: { titleAt: 0.82, oddsAt: 0.9, textY: 0.8, make: function (env) {
      var lines = ["> initializing aura scanner v7.84", "> sampling probability field ......", "> anomaly detected", "> rarity: 1 in " + fmt(env.rarity), "> class: " + env.tierName.toUpperCase(), "> subject: " + env.name.toUpperCase()];
      var totalChars = lines.reduce(function (a, l) { return a + l.length + 6; }, 0);
      return function (ctx, t, w, h) {
        var p = t / env.dur;
        fill(ctx, w, h, "#020604");
        var budget = Math.floor(clamp01(p / 0.75) * totalChars), y = h * 0.18, size = Math.min(26, w / 32);
        ctx.font = "600 " + size + "px ui-monospace, Menlo, Consolas, monospace"; ctx.textAlign = "left";
        for (var i = 0; i < lines.length && budget > 0; i++) {
          var shown = lines[i].slice(0, Math.min(lines[i].length, budget));
          budget -= lines[i].length + 6;
          var isLast = i >= 3;
          ctx.fillStyle = isLast ? env.c1 : "rgba(140,255,170,.85)";
          glow(ctx, isLast ? env.c1 : "#4ade80", isLast ? 14 : 6);
          ctx.fillText(shown, w * 0.08, y + i * size * 1.7);
          if (budget <= 0 && Math.floor(t * 3) % 2 === 0) ctx.fillRect(w * 0.08 + ctx.measureText(shown).width + 6, y + i * size * 1.7 - size * 0.8, size * 0.55, size);
          noglow(ctx);
        }
        if (p > 0.75) { var k = ((p - 0.75) * 4) % 1; ctx.fillStyle = withAlpha(env.c1, 0.08 * (1 - k)); ctx.fillRect(0, 0, w, h); }
        fadeIn(ctx, t, w, h, 0.3);
      };
    } },

    /* The screen cracks and shatters into flying shards. */
    shatter: { titleAt: 0.5, oddsAt: 0.68, textY: 0.5, make: function (env) {
      var cols = 9, rows = 6, pts = [], tris = [];
      for (var r = 0; r <= rows; r++) for (var c = 0; c <= cols; c++) pts.push([c / cols + (c > 0 && c < cols ? (env.rng() - 0.5) * 0.08 : 0), r / rows + (r > 0 && r < rows ? (env.rng() - 0.5) * 0.1 : 0)]);
      var idx = function (c, r) { return r * (cols + 1) + c; };
      for (var rr = 0; rr < rows; rr++) for (var cc = 0; cc < cols; cc++) {
        var a = idx(cc, rr), b = idx(cc + 1, rr), c2 = idx(cc, rr + 1), d = idx(cc + 1, rr + 1);
        tris.push([a, b, d], [a, d, c2]);
      }
      var vel = tris.map(function () { return { vx: (env.rng() - 0.5) * 1.6, vy: (env.rng() - 0.5) * 1.6 - 0.3, rot: (env.rng() - 0.5) * 3, delay: env.rng() * 0.15 }; });
      return function (ctx, t, w, h) {
        var p = t / env.dur;
        var g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7);
        g.addColorStop(0, env.c1); g.addColorStop(0.5, env.c2); g.addColorStop(1, "#000");
        fill(ctx, w, h, g);
        var crack = clamp01(p / 0.33), fly = clamp01((p - 0.36) / 0.45);
        tris.forEach(function (tri, i) {
          var v = vel[i], f = clamp01((fly - v.delay) / (1 - v.delay));
          var cx = (pts[tri[0]][0] + pts[tri[1]][0] + pts[tri[2]][0]) / 3 * w, cy = (pts[tri[0]][1] + pts[tri[1]][1] + pts[tri[2]][1]) / 3 * h;
          ctx.save(); ctx.translate(cx + v.vx * f * w, cy + v.vy * f * h + f * f * h * 0.6); ctx.rotate(v.rot * f); ctx.translate(-cx, -cy);
          ctx.globalAlpha = 1 - f;
          ctx.fillStyle = "#07060f"; ctx.beginPath();
          tri.forEach(function (pi, k) { var P = pts[pi]; if (k === 0) ctx.moveTo(P[0] * w, P[1] * h); else ctx.lineTo(P[0] * w, P[1] * h); });
          ctx.closePath(); ctx.fill();
          if (crack > i / tris.length) { ctx.strokeStyle = withAlpha(env.c1, 0.9); ctx.lineWidth = 1.5; glow(ctx, env.c1, 8); ctx.stroke(); noglow(ctx); }
          ctx.restore();
        });
        if (p > 0.33 && p < 0.42) flash(ctx, w, h, (0.42 - p) * 8);
        fadeIn(ctx, t, w, h, 0.3);
      };
    } },

    /* A dark disc crosses a blazing one; totality erupts. */
    eclipse: { titleAt: 0.66, oddsAt: 0.8, textY: 0.78, make: function (env) {
      return function (ctx, t, w, h) {
        var p = t / env.dur, cx = w / 2, cy = h * 0.42, R = Math.min(w, h) * 0.2;
        fill(ctx, w, h, "#03030a");
        var tot = 1 - Math.abs(clamp01(p / 0.66) * 2 - 1);
        var rays = 22;
        ctx.save(); ctx.translate(cx, cy); ctx.globalCompositeOperation = "lighter";
        for (var i = 0; i < rays; i++) {
          var a = i / rays * TAU + t * 0.15, L = R * (1.6 + tot * 2.2 + 0.3 * Math.sin(t * 5 + i));
          var rg = ctx.createLinearGradient(0, 0, Math.cos(a) * L, Math.sin(a) * L);
          rg.addColorStop(0, withAlpha(env.c1, 0.5 + tot * 0.4)); rg.addColorStop(1, withAlpha(env.c1, 0));
          ctx.fillStyle = rg; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a - 0.05) * L, Math.sin(a - 0.05) * L); ctx.lineTo(Math.cos(a + 0.05) * L, Math.sin(a + 0.05) * L); ctx.closePath(); ctx.fill();
        }
        ctx.restore();
        glow(ctx, env.c1, 60 + tot * 80); ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill(); noglow(ctx);
        var dx = lerp(-R * 3.2, R * 3.2, clamp01(p / 0.66) * 0.5 + (p > 0.66 ? (p - 0.66) * 0.3 : 0));
        ctx.fillStyle = "#03030a"; ctx.beginPath(); ctx.arc(cx + dx, cy, R * 1.02, 0, TAU); ctx.fill();
        if (tot > 0.97) flash(ctx, w, h, 0.5, env.c1);
        fadeIn(ctx, t, w, h, 0.4);
      };
    } },

    /* A swirling portal opens and pulls in light. */
    portal: { titleAt: 0.6, oddsAt: 0.75, textY: 0.5, make: function (env) {
      var parts = []; for (var i = 0; i < 160; i++) parts.push({ a: env.rng() * TAU, d: 0.4 + env.rng() * 0.8, o: env.rng(), s: 1 + env.rng() * 2.5 });
      return function (ctx, t, w, h) {
        var p = t / env.dur, cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.3 * ease(clamp01(p / 0.5));
        fill(ctx, w, h, "#050308");
        ctx.save(); ctx.globalCompositeOperation = "lighter";
        parts.forEach(function (q) { var lp = (t * 0.35 + q.o) % 1, d = R * (0.6 + q.d * (1 - lp) * 2.2), a = q.a + lp * 5 + t; ctx.fillStyle = lp < 0.5 ? env.c1 : env.c2; ctx.globalAlpha = Math.sin(lp * Math.PI); ctx.beginPath(); ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.75, q.s, 0, TAU); ctx.fill(); });
        ctx.restore(); ctx.globalAlpha = 1;
        var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R); g.addColorStop(0, "#000"); g.addColorStop(0.75, withAlpha(env.c2, 0.6)); g.addColorStop(1, withAlpha(env.c1, 0.9));
        ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(cx, cy, R, R * 0.75, 0, 0, TAU); ctx.fill();
        for (var k = 0; k < 3; k++) { ctx.strokeStyle = k % 2 ? env.c1 : "#fff"; ctx.lineWidth = 3 - k; glow(ctx, env.c1, 20); ctx.beginPath(); ctx.ellipse(cx, cy, R * (1 + k * 0.08), R * 0.75 * (1 + k * 0.08), t * (k % 2 ? 0.8 : -0.6), 0.3, TAU - 0.5); ctx.stroke(); }
        noglow(ctx);
        if (p > 0.5) { var rp = ((p - 0.5) * 2.5) % 1; ctx.strokeStyle = withAlpha(env.c1, 1 - rp); ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(cx, cy, R * (1 + rp * 1.5), R * 0.75 * (1 + rp * 1.5), 0, 0, TAU); ctx.stroke(); }
        fadeIn(ctx, t, w, h, 0.4);
      };
    } },

    /* Rain and lightning. */
    storm: { titleAt: 0.55, oddsAt: 0.7, textY: 0.5, make: function (env) {
      var drops = []; for (var i = 0; i < 260; i++) drops.push({ x: env.rng(), y: env.rng(), s: 0.6 + env.rng() * 0.8, l: 12 + env.rng() * 22 });
      var bolts = [], next = 0.5;
      return function (ctx, t, w, h) {
        var p = t / env.dur;
        fill(ctx, w, h, "#05070f");
        if (t > next) { next = t + 0.35 + env.rng() * 0.6; var x0 = env.rng() * w, pts = [[x0, 0]]; for (var s = 1; s <= 10; s++) pts.push([x0 + (env.rng() - 0.5) * w * 0.25 * (s / 10) + (env.rng() - 0.5) * 60, h * s / 10]); bolts.push({ pts: pts, born: t }); }
        bolts = bolts.filter(function (b) { return t - b.born < 0.3; });
        bolts.forEach(function (b) { var age = (t - b.born) / 0.3; ctx.strokeStyle = env.c1; ctx.lineWidth = 4 * (1 - age); glow(ctx, env.c1, 30); ctx.globalAlpha = 1 - age; ctx.beginPath(); b.pts.forEach(function (P, i) { if (i === 0) ctx.moveTo(P[0], P[1]); else ctx.lineTo(P[0], P[1]); }); ctx.stroke(); noglow(ctx); ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5; ctx.stroke(); if (age < 0.2) flash(ctx, w, h, 0.35 * (1 - age / 0.2), env.c1); ctx.globalAlpha = 1; });
        ctx.strokeStyle = withAlpha(env.c1, 0.5); ctx.lineWidth = 1.5;
        drops.forEach(function (d) { var y = ((d.y + t * d.s * 0.9) % 1) * h, x = ((d.x - t * 0.08 * d.s) % 1 + 1) % 1 * w; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 5, y + d.l); ctx.stroke(); });
        var g = ctx.createLinearGradient(0, 0, 0, h * 0.4); g.addColorStop(0, withAlpha(env.c2, 0.8)); g.addColorStop(1, "rgba(0,0,0,0)"); fill(ctx, w, h, g);
        fadeIn(ctx, t, w, h, 0.4);
      };
    } },

    /* Meteors streak across a starry sky. */
    starfall: { titleAt: 0.55, oddsAt: 0.7, textY: 0.5, make: function (env) {
      var stars = []; for (var i = 0; i < 140; i++) stars.push({ x: env.rng(), y: env.rng(), s: env.rng() * 1.5 + 0.4, ph: env.rng() * 6 });
      var mets = []; for (var k = 0; k < 28; k++) mets.push({ x: env.rng() * 1.4 - 0.2, y: -0.1 - env.rng() * 0.3, born: env.rng() * env.dur * 0.8, sp: 0.5 + env.rng() * 0.6, len: 80 + env.rng() * 160, col: env.colors[k % env.colors.length] });
      return function (ctx, t, w, h) {
        var g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, "#03030c"); g.addColorStop(1, withAlpha(env.c2, 0.5)); fill(ctx, w, h, g);
        stars.forEach(function (s) { ctx.globalAlpha = 0.4 + 0.6 * Math.sin(t * 3 + s.ph) * 0.5 + 0.3; ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(s.x * w, s.y * h, s.s, 0, TAU); ctx.fill(); }); ctx.globalAlpha = 1;
        ctx.lineCap = "round";
        mets.forEach(function (m) { var age = t - m.born; if (age < 0) return; var x = m.x * w + age * m.sp * w * 0.6, y = m.y * h + age * m.sp * h * 0.9; if (y > h * 1.2) return; var dx = 0.55, dy = 0.83; var lg = ctx.createLinearGradient(x, y, x - dx * m.len, y - dy * m.len); lg.addColorStop(0, "#fff"); lg.addColorStop(0.3, m.col); lg.addColorStop(1, withAlpha(m.col, 0)); ctx.strokeStyle = lg; ctx.lineWidth = 3; glow(ctx, m.col, 14); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - dx * m.len, y - dy * m.len); ctx.stroke(); noglow(ctx); });
        fadeIn(ctx, t, w, h, 0.4);
      };
    } },

    /* Falling columns of glyphs. */
    matrix: { titleAt: 0.62, oddsAt: 0.76, textY: 0.5, make: function (env) {
      var chars = "アイウエオカキクケコ0123456789ABCDEF∑∆Ω";
      var cols = []; var cw = 22; var n = 70;
      for (var i = 0; i < n; i++) cols.push({ sp: 6 + env.rng() * 14, off: env.rng() * 60, len: 8 + Math.floor(env.rng() * 18), seed: Math.floor(env.rng() * 1000) });
      return function (ctx, t, w, h) {
        var p = t / env.dur;
        fill(ctx, w, h, "#020405");
        var count = Math.ceil(w / cw);
        ctx.font = "700 18px ui-monospace, monospace"; ctx.textAlign = "center";
        for (var c = 0; c < count; c++) {
          var col = cols[c % n], head = (t * col.sp + col.off) % (h / 20 + col.len);
          for (var k = 0; k < col.len; k++) {
            var row = head - k, y = row * 20; if (y < 0 || y > h) continue;
            var ch = chars[(col.seed + Math.floor(row) * 7 + k * 3) % chars.length];
            var mid = Math.abs(y - h / 2) < h * 0.12 && p > 0.6 ? 0.25 : 1;
            ctx.fillStyle = k === 0 ? "#fff" : withAlpha(env.c1, (1 - k / col.len) * 0.9 * mid);
            ctx.fillText(ch, c * cw + cw / 2, y);
          }
        }
        if (p > 0.6) { var g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w * 0.4); g.addColorStop(0, withAlpha(env.c2, 0.85)); g.addColorStop(1, "rgba(0,0,0,0)"); fill(ctx, w, h, g); }
        fadeIn(ctx, t, w, h, 0.3);
      };
    } },

    /* A heart monitor whose beats grow until one enormous spike. */
    ecg: { titleAt: 0.76, oddsAt: 0.88, textY: 0.74, make: function (env) {
      return function (ctx, t, w, h) {
        var p = t / env.dur, base = h * 0.42;
        fill(ctx, w, h, "#030806");
        ctx.strokeStyle = "rgba(255,255,255,.06)"; ctx.lineWidth = 1;
        for (var gx = 0; gx < w; gx += 30) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, h); ctx.stroke(); }
        for (var gy = 0; gy < h; gy += 30) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke(); }
        var speed = w / 2.2, x0 = w - ((t * speed) % (w * 3));
        ctx.beginPath(); var first = true;
        for (var x = 0; x <= w; x += 3) {
          var u = (x - x0) / speed + t * 0 + 100, cyc = u % 1.0, amp = h * (0.05 + 0.3 * clamp01((t - (x - w) / speed) / env.dur / 0.7));
          var y = base;
          if (cyc > 0.1 && cyc < 0.14) y = base - amp * 0.25 * Math.sin((cyc - 0.1) / 0.04 * Math.PI);
          else if (cyc > 0.2 && cyc < 0.24) y = base + amp * 0.3 * Math.sin((cyc - 0.2) / 0.04 * Math.PI);
          else if (cyc > 0.24 && cyc < 0.3) y = base - amp * Math.sin((cyc - 0.24) / 0.06 * Math.PI);
          else if (cyc > 0.3 && cyc < 0.34) y = base + amp * 0.35 * Math.sin((cyc - 0.3) / 0.04 * Math.PI);
          else if (cyc > 0.45 && cyc < 0.55) y = base - amp * 0.2 * Math.sin((cyc - 0.45) / 0.1 * Math.PI);
          if (first) { ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y);
        }
        glow(ctx, env.c1, 16); ctx.strokeStyle = env.c1; ctx.lineWidth = 3; ctx.stroke(); noglow(ctx);
        var beat = Math.pow(Math.max(0, Math.sin(t * TAU * (1 + p))), 10);
        ctx.fillStyle = withAlpha(env.c1, 0.08 * beat); ctx.fillRect(0, 0, w, h);
        label(ctx, "♥ " + Math.round(60 + p * 140) + " bpm", w * 0.08, h * 0.14, 24, env.c1, "left", "700");
        label(ctx, "1 in " + fmt(env.rarity * clamp01(p / 0.75)), w * 0.92, h * 0.14, 24, "#fff", "right", "700");
        fadeIn(ctx, t, w, h, 0.3);
      };
    } },

    /* Stars appear and join into a constellation. */
    constellation: { titleAt: 0.62, oddsAt: 0.78, textY: 0.5, make: function (env) {
      var n = 26, stars = [];
      for (var i = 0; i < n; i++) stars.push({ x: 0.15 + env.rng() * 0.7, y: 0.12 + env.rng() * 0.76, s: 2 + env.rng() * 3, at: env.rng() * 0.45 });
      var links = []; for (var a = 0; a < n; a++) { var best = -1, bd = 1e9; for (var b = 0; b < n; b++) { if (a === b) continue; var d = Math.hypot(stars[a].x - stars[b].x, stars[a].y - stars[b].y); if (d < bd) { bd = d; best = b; } } links.push([a, best, 0.2 + env.rng() * 0.45]); }
      var bg = []; for (var k = 0; k < 120; k++) bg.push({ x: env.rng(), y: env.rng(), ph: env.rng() * 6 });
      return function (ctx, t, w, h) {
        var p = t / env.dur;
        fill(ctx, w, h, "#030412");
        bg.forEach(function (s) { ctx.globalAlpha = 0.3 + 0.3 * Math.sin(t * 2 + s.ph); ctx.fillStyle = "#fff"; ctx.fillRect(s.x * w, s.y * h, 1.5, 1.5); }); ctx.globalAlpha = 1;
        links.forEach(function (l) { var q = clamp01((p - l[2]) / 0.2); if (q <= 0) return; var A = stars[l[0]], B = stars[l[1]]; ctx.strokeStyle = withAlpha(env.c1, 0.8); ctx.lineWidth = 1.5; glow(ctx, env.c1, 8); ctx.beginPath(); ctx.moveTo(A.x * w, A.y * h); ctx.lineTo(lerp(A.x, B.x, q) * w, lerp(A.y, B.y, q) * h); ctx.stroke(); noglow(ctx); });
        stars.forEach(function (s, i) { var q = clamp01((p - s.at) / 0.1); if (q <= 0) return; var r = s.s * q * (1 + 0.3 * Math.sin(t * 4 + i)); glow(ctx, "#fff", 14); ctx.fillStyle = i % 3 ? "#fff" : env.c1; ctx.beginPath(); ctx.arc(s.x * w, s.y * h, r, 0, TAU); ctx.fill(); noglow(ctx); });
        if (p > 0.6) { var g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w * 0.5); g.addColorStop(0, withAlpha(env.c2, 0.5 * Math.min(1, (p - 0.6) * 4))); g.addColorStop(1, "rgba(0,0,0,0)"); fill(ctx, w, h, g); }
        fadeIn(ctx, t, w, h, 0.4);
      };
    } },

    /* A radar sweep finds the target. */
    radar: { titleAt: 0.7, oddsAt: 0.84, textY: 0.5, make: function (env) {
      var blips = []; for (var i = 0; i < 9; i++) blips.push({ a: env.rng() * TAU, d: 0.25 + env.rng() * 0.65 });
      return function (ctx, t, w, h) {
        var p = t / env.dur, cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.42;
        fill(ctx, w, h, "#020a08");
        ctx.strokeStyle = withAlpha(env.c1, 0.35); ctx.lineWidth = 1.5;
        for (var k = 1; k <= 4; k++) { ctx.beginPath(); ctx.arc(cx, cy, R * k / 4, 0, TAU); ctx.stroke(); }
        ctx.beginPath(); ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy); ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R); ctx.stroke();
        var ang = t * 2.2;
        for (var s = 0; s < 40; s++) { var a0 = ang - s * 0.03; ctx.fillStyle = withAlpha(env.c1, 0.5 * (1 - s / 40)); ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, a0 - 0.035, a0); ctx.closePath(); ctx.fill(); }
        blips.forEach(function (b) { var diff = ((ang - b.a) % TAU + TAU) % TAU, al = Math.max(0, 1 - diff / 2.5); if (al <= 0) return; glow(ctx, env.c1, 12); ctx.fillStyle = "#fff"; ctx.globalAlpha = al; ctx.beginPath(); ctx.arc(cx + Math.cos(b.a) * R * b.d, cy + Math.sin(b.a) * R * b.d, 4, 0, TAU); ctx.fill(); noglow(ctx); ctx.globalAlpha = 1; });
        if (p > 0.6) { var q = ((p - 0.6) * 3) % 1; glow(ctx, "#fff", 30); ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(cx, cy, 10 + 6 * Math.sin(t * 10), 0, TAU); ctx.fill(); noglow(ctx); ctx.strokeStyle = withAlpha("#ffffff", 1 - q); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy, 10 + q * R, 0, TAU); ctx.stroke(); label(ctx, "TARGET LOCKED", cx, cy - R - 16, 16, env.c1, "center", "700"); }
        fadeIn(ctx, t, w, h, 0.3);
      };
    } },

    /* An equalizer that builds to a wall of sound. */
    bars: { titleAt: 0.55, oddsAt: 0.72, textY: 0.5, make: function (env) {
      var n = 56, ph = []; for (var i = 0; i < n; i++) ph.push(env.rng() * 6);
      return function (ctx, t, w, h) {
        var p = t / env.dur, bw = w / n;
        fill(ctx, w, h, "#06040c");
        for (var i = 0; i < n; i++) {
          var amp = (0.25 + 0.75 * clamp01(p / 0.6)) * h * 0.42 * (0.35 + 0.65 * Math.abs(Math.sin(t * 3 + ph[i]) * Math.sin(t * 1.3 + i * 0.2)));
          var col = env.colors[i % env.colors.length];
          var g = ctx.createLinearGradient(0, h / 2 - amp, 0, h / 2 + amp); g.addColorStop(0, withAlpha(col, 0.2)); g.addColorStop(0.5, col); g.addColorStop(1, withAlpha(col, 0.2));
          ctx.fillStyle = g; ctx.fillRect(i * bw + 1, h / 2 - amp, bw - 2, amp * 2);
          ctx.fillStyle = "#fff"; ctx.fillRect(i * bw + 1, h / 2 - amp - 3, bw - 2, 3); ctx.fillRect(i * bw + 1, h / 2 + amp, bw - 2, 3);
        }
        fadeIn(ctx, t, w, h, 0.3);
      };
    } },

    /* Spiral arms spin around a bright core. */
    vortex: { titleAt: 0.55, oddsAt: 0.7, textY: 0.5, make: function (env) {
      var dots = []; for (var i = 0; i < 400; i++) dots.push({ a: env.rng() * TAU, r: env.rng(), arm: i % 4 });
      return function (ctx, t, w, h) {
        var p = t / env.dur, cx = w / 2, cy = h / 2, m = Math.max(w, h);
        fill(ctx, w, h, "#030309");
        ctx.save(); ctx.globalCompositeOperation = "lighter";
        dots.forEach(function (d) { var r = ((d.r + t * 0.12) % 1), rad = r * m * 0.6, a = d.arm * TAU / 4 + Math.log(1 + rad * 0.02) * 3 + t * (0.6 + 0.4 * p); ctx.fillStyle = d.arm % 2 ? env.c1 : env.c2; ctx.globalAlpha = (1 - r) * 0.9; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad * 0.7, 1.5 + (1 - r) * 2.5, 0, TAU); ctx.fill(); });
        ctx.restore(); ctx.globalAlpha = 1;
        var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, m * 0.18); g.addColorStop(0, "#fff"); g.addColorStop(0.3, env.c1); g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 5); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); ctx.globalAlpha = 1;
        fadeIn(ctx, t, w, h, 0.4);
      };
    } },

    /* An accretion disc around a black hole. */
    blackhole: { titleAt: 0.6, oddsAt: 0.76, textY: 0.5, make: function (env) {
      var ps = []; for (var i = 0; i < 300; i++) ps.push({ a: env.rng() * TAU, r: 1.1 + env.rng() * 1.4, sp: 0.6 + env.rng() * 0.8, s: 1 + env.rng() * 2 });
      var stars = []; for (var k = 0; k < 150; k++) stars.push({ x: env.rng(), y: env.rng() });
      return function (ctx, t, w, h) {
        var p = t / env.dur, cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.13 * (0.6 + 0.4 * clamp01(p * 2));
        fill(ctx, w, h, "#000004");
        ctx.fillStyle = "#fff"; stars.forEach(function (s) { var dx = s.x * w - cx, dy = s.y * h - cy, d = Math.hypot(dx, dy), pull = Math.max(0, 1 - d / (R * 4)) * R * 0.8; ctx.globalAlpha = 0.6; ctx.fillRect(s.x * w - dx / d * pull, s.y * h - dy / d * pull, 1.5, 1.5); }); ctx.globalAlpha = 1;
        ctx.save(); ctx.globalCompositeOperation = "lighter";
        ps.forEach(function (q) { var a = q.a + t * q.sp * 1.6, x = cx + Math.cos(a) * R * q.r, y = cy + Math.sin(a) * R * q.r * 0.32, front = Math.sin(a) > 0, dop = Math.cos(a) > 0 ? 1 : 0.55; ctx.fillStyle = q.r < 1.5 ? "#fff" : env.c1; ctx.globalAlpha = (front ? 0.95 : 0.55) * dop; ctx.beginPath(); ctx.arc(x, y, q.s, 0, TAU); ctx.fill(); });
        ctx.restore(); ctx.globalAlpha = 1;
        var g = ctx.createRadialGradient(cx, cy, R, cx, cy, R * 1.5); g.addColorStop(0, withAlpha(env.c1, 0.9)); g.addColorStop(1, "rgba(0,0,0,0)"); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R * 1.5, 0, TAU); ctx.fill();
        ctx.fillStyle = "#000"; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();
        ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; glow(ctx, "#fff", 16); ctx.beginPath(); ctx.arc(cx, cy, R * 1.02, 0, TAU); ctx.stroke(); noglow(ctx);
        fadeIn(ctx, t, w, h, 0.4);
      };
    } },

    /* Flying down a warp tunnel of rings. */
    tunnel: { titleAt: 0.55, oddsAt: 0.7, textY: 0.5, make: function (env) {
      return function (ctx, t, w, h) {
        var p = t / env.dur, cx = w / 2 + Math.sin(t * 0.7) * w * 0.05, cy = h / 2 + Math.cos(t * 0.9) * h * 0.05, m = Math.max(w, h);
        fill(ctx, w, h, "#030309");
        for (var i = 0; i < 18; i++) {
          var z = ((i / 18 + t * (0.25 + p * 0.5)) % 1), r = Math.pow(z, 2.2) * m * 0.9, sq = i % 2 === 0;
          ctx.strokeStyle = i % 3 === 0 ? "#fff" : (i % 2 ? env.c1 : env.c2); ctx.lineWidth = 1 + z * 5; ctx.globalAlpha = z;
          ctx.save(); ctx.translate(cx, cy); ctx.rotate(t * 0.4 + i * 0.1);
          ctx.beginPath(); if (sq) ctx.rect(-r, -r * 0.65, r * 2, r * 1.3); else ctx.ellipse(0, 0, r, r * 0.65, 0, 0, TAU); ctx.stroke();
          ctx.restore();
        }
        ctx.globalAlpha = 1;
        var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, m * 0.25); g.addColorStop(0, withAlpha(env.c1, 0.8)); g.addColorStop(1, "rgba(0,0,0,0)"); fill(ctx, w, h, g);
        fadeIn(ctx, t, w, h, 0.4);
      };
    } },

    /* Shockwave rings on a heartbeat. */
    pulse: { titleAt: 0.5, oddsAt: 0.66, textY: 0.5, make: function (env) {
      return function (ctx, t, w, h) {
        var p = t / env.dur, cx = w / 2, cy = h / 2, m = Math.max(w, h), period = 0.75;
        fill(ctx, w, h, "#050308");
        for (var k = 0; k < 6; k++) { var age = ((t + k * period) % (period * 4)) / (period * 4); var r = age * m * 0.75; ctx.strokeStyle = env.colors[k % env.colors.length]; ctx.lineWidth = 12 * (1 - age) + 1; ctx.globalAlpha = (1 - age) * 0.9; glow(ctx, env.c1, 20); ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke(); noglow(ctx); }
        ctx.globalAlpha = 1;
        var beat = Math.pow(Math.max(0, Math.sin(t / period * Math.PI)), 6);
        var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, m * 0.3 * (1 + beat * 0.4)); g.addColorStop(0, withAlpha("#ffffff", 0.9)); g.addColorStop(0.3, withAlpha(env.c1, 0.8 * (0.6 + beat))); g.addColorStop(1, "rgba(0,0,0,0)"); fill(ctx, w, h, g);
        fadeIn(ctx, t, w, h, 0.3);
      };
    } },

    /* Fireworks. */
    fireworks: { titleAt: 0.6, oddsAt: 0.76, textY: 0.5, make: function (env) {
      var shells = []; for (var i = 0; i < 9; i++) shells.push({ x: 0.15 + env.rng() * 0.7, top: 0.15 + env.rng() * 0.4, at: 0.05 + i * 0.08 + env.rng() * 0.04, col: env.colors[i % env.colors.length], n: 60 + Math.floor(env.rng() * 50), seed: env.rng() * 100 });
      return function (ctx, t, w, h) {
        var p = t / env.dur;
        fill(ctx, w, h, "#04030a");
        shells.forEach(function (s) {
          var age = p - s.at; if (age < 0) return;
          var rise = 0.1, ex = s.x * w, ey = s.top * h;
          if (age < rise) { var q = age / rise; var y = h - (h - ey) * ease(q); glow(ctx, s.col, 14); ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(ex, y, 3, 0, TAU); ctx.fill(); noglow(ctx); return; }
          var e = (age - rise) / 0.35; if (e > 1) return;
          var rr = mulberry32(Math.floor(s.seed * 1000));
          ctx.save(); ctx.globalCompositeOperation = "lighter";
          for (var k = 0; k < s.n; k++) { var a = rr() * TAU, sp = 60 + rr() * 200; var x = ex + Math.cos(a) * sp * ease(e), y2 = ey + Math.sin(a) * sp * ease(e) + e * e * 120; ctx.fillStyle = k % 5 ? s.col : "#fff"; ctx.globalAlpha = 1 - e; ctx.beginPath(); ctx.arc(x, y2, 2.5 * (1 - e * 0.6), 0, TAU); ctx.fill(); }
          ctx.restore(); ctx.globalAlpha = 1;
          if (e < 0.1) flash(ctx, w, h, 0.15 * (1 - e / 0.1), s.col);
        });
        fadeIn(ctx, t, w, h, 0.3);
      };
    } },

    /* Ash and embers drift down over a glowing ground. */
    ash: { titleAt: 0.5, oddsAt: 0.66, textY: 0.5, make: function (env) {
      var fl = []; for (var i = 0; i < 320; i++) fl.push({ x: env.rng(), y: env.rng(), s: 0.03 + env.rng() * 0.08, r: 1 + env.rng() * 3, ph: env.rng() * 6, bright: env.rng() < 0.15 });
      return function (ctx, t, w, h) {
        var g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, "#050307"); g.addColorStop(0.7, "#0a0608"); g.addColorStop(1, withAlpha(env.c2, 0.9)); fill(ctx, w, h, g);
        var gg = ctx.createRadialGradient(w / 2, h, 0, w / 2, h, w * 0.6); gg.addColorStop(0, withAlpha(env.c1, 0.45 + 0.1 * Math.sin(t * 2))); gg.addColorStop(1, "rgba(0,0,0,0)"); fill(ctx, w, h, gg);
        fl.forEach(function (f) { var y = ((f.y + t * f.s) % 1) * h, x = (f.x + Math.sin(t * 1.3 + f.ph) * 0.02) * w, tw = 0.5 + 0.5 * Math.sin(t * 6 + f.ph); ctx.fillStyle = f.bright ? env.c1 : "rgba(200,200,210,.6)"; ctx.globalAlpha = f.bright ? 0.6 + 0.4 * tw : 0.5; if (f.bright) glow(ctx, env.c1, 10); ctx.beginPath(); ctx.arc(x, y, f.r, 0, TAU); ctx.fill(); noglow(ctx); });
        ctx.globalAlpha = 1;
        fadeIn(ctx, t, w, h, 0.4);
      };
    } },

    /* A rotating double helix. */
    helix: { titleAt: 0.55, oddsAt: 0.7, textY: 0.5, make: function (env) {
      return function (ctx, t, w, h) {
        var p = t / env.dur, cy = h / 2, amp = h * 0.22, rot = t * 2;
        fill(ctx, w, h, "#030510");
        var n = Math.floor(w / 14);
        for (var i = 0; i <= n; i++) {
          var x = i / n * w, ph = i / n * TAU * 2.2 + rot, y1 = cy + Math.sin(ph) * amp, y2 = cy + Math.sin(ph + Math.PI) * amp, z1 = Math.cos(ph), z2 = -z1;
          if (i % 3 === 0) { ctx.strokeStyle = withAlpha(env.c1, 0.35); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y1); ctx.lineTo(x, y2); ctx.stroke(); }
          [[y1, z1, env.c1], [y2, z2, env.c2]].forEach(function (s) { var r = 3 + (s[1] + 1) * 2.5; ctx.globalAlpha = 0.5 + (s[1] + 1) * 0.25; glow(ctx, s[2], 12); ctx.fillStyle = s[2]; ctx.beginPath(); ctx.arc(x, s[0], r, 0, TAU); ctx.fill(); noglow(ctx); });
        }
        ctx.globalAlpha = 1;
        var g = ctx.createRadialGradient(w / 2, cy, 0, w / 2, cy, w * 0.45); g.addColorStop(0, withAlpha(env.c2, 0.35 * clamp01(p * 2))); g.addColorStop(1, "rgba(0,0,0,0)"); fill(ctx, w, h, g);
        fadeIn(ctx, t, w, h, 0.4);
      };
    } },

    /* A waveform that swells into a roar. */
    wave: { titleAt: 0.55, oddsAt: 0.7, textY: 0.5, make: function (env) {
      return function (ctx, t, w, h) {
        var p = t / env.dur, cy = h / 2, amp = h * 0.05 + h * 0.3 * clamp01(p / 0.6);
        fill(ctx, w, h, "#04030a");
        for (var k = 0; k < 5; k++) {
          ctx.beginPath();
          for (var x = 0; x <= w; x += 4) { var u = x / w; var y = cy + Math.sin(u * 9 + t * 5 + k) * Math.sin(u * 2.3 - t * 1.7) * amp * (1 - k * 0.15) * Math.sin(u * Math.PI); if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
          ctx.strokeStyle = k === 0 ? "#fff" : env.colors[k % env.colors.length]; ctx.lineWidth = k === 0 ? 2.5 : 2; ctx.globalAlpha = 1 - k * 0.15; glow(ctx, env.c1, 14); ctx.stroke(); noglow(ctx);
        }
        ctx.globalAlpha = 1;
        fadeIn(ctx, t, w, h, 0.3);
      };
    } },

    /* A pixel grid dissolves into colour. */
    dissolve: { titleAt: 0.7, oddsAt: 0.84, textY: 0.5, make: function (env) {
      var cols = 40, rows = 24, order = []; for (var i = 0; i < cols * rows; i++) order.push({ i: i, at: env.rng(), col: env.colors[Math.floor(env.rng() * env.colors.length)] });
      return function (ctx, t, w, h) {
        var p = t / env.dur, cw = w / cols, chh = h / rows, q = clamp01(p / 0.75);
        fill(ctx, w, h, "#050308");
        order.forEach(function (c) { if (c.at > q) return; var x = (c.i % cols) * cw, y = Math.floor(c.i / cols) * chh, age = clamp01((q - c.at) / 0.1); ctx.fillStyle = age < 1 ? "#fff" : c.col; ctx.globalAlpha = 0.25 + 0.75 * age * (0.7 + 0.3 * Math.sin(t * 3 + c.i)); ctx.fillRect(x + 1, y + 1, cw - 2, chh - 2); });
        ctx.globalAlpha = 1;
        if (q >= 1) { var g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w * 0.45); g.addColorStop(0, "rgba(0,0,0,.75)"); g.addColorStop(1, "rgba(0,0,0,0)"); fill(ctx, w, h, g); }
        fadeIn(ctx, t, w, h, 0.3);
      };
    } },

    /* A clock whose hands race, then strike. */
    clock: { titleAt: 0.78, oddsAt: 0.9, textY: 0.5, make: function (env) {
      return function (ctx, t, w, h) {
        var p = t / env.dur, cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.36;
        fill(ctx, w, h, "#06050c");
        ctx.strokeStyle = withAlpha(env.c1, 0.8); ctx.lineWidth = 4; glow(ctx, env.c1, 18); ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke(); noglow(ctx);
        for (var i = 0; i < 60; i++) { var a = i / 60 * TAU - Math.PI / 2, big = i % 5 === 0; ctx.strokeStyle = big ? "#fff" : "rgba(255,255,255,.35)"; ctx.lineWidth = big ? 3 : 1; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * R * (big ? 0.86 : 0.92), cy + Math.sin(a) * R * (big ? 0.86 : 0.92)); ctx.lineTo(cx + Math.cos(a) * R * 0.97, cy + Math.sin(a) * R * 0.97); ctx.stroke(); }
        var spin = p < 0.72 ? Math.pow(p / 0.72, 2.5) * 40 : 40, strike = p >= 0.72;
        var hour = (spin * TAU / 12) % TAU, minute = (spin * TAU) % TAU;
        if (strike) { hour = 0; minute = 0; }
        [[hour, 0.5, 8, "#fff"], [minute, 0.78, 5, env.c1]].forEach(function (hd) { var a = hd[0] - Math.PI / 2; ctx.strokeStyle = hd[3]; ctx.lineWidth = hd[2]; ctx.lineCap = "round"; glow(ctx, hd[3], 10); ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * R * hd[1], cy + Math.sin(a) * R * hd[1]); ctx.stroke(); noglow(ctx); });
        ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(cx, cy, 7, 0, TAU); ctx.fill();
        if (strike) { var q = ((p - 0.72) * 3) % 1; ctx.strokeStyle = withAlpha(env.c1, 1 - q); ctx.lineWidth = 6 * (1 - q); ctx.beginPath(); ctx.arc(cx, cy, R * (1 + q * 0.6), 0, TAU); ctx.stroke(); if (p - 0.72 < 0.08) flash(ctx, w, h, (0.08 - (p - 0.72)) * 6, env.c1); }
        fadeIn(ctx, t, w, h, 0.3);
      };
    } }
  };

  var SCENE_KEYS = Object.keys(SCENES);
  var TITLE_KEYS = ["stagger", "type", "slam", "blur", "flip", "rise", "glitch", "decode"];
  var OVERLAY_KEYS = ["none", "scanlines", "vignette", "grid", "noise"];
  var FORCED = { "Beyond Axiom": { scene: "graph", title: "type", overlay: "grid" } };

  function encode(f) {
    return SCENE_KEYS.indexOf(f.scene) + SCENE_KEYS.length * (TITLE_KEYS.indexOf(f.title) + TITLE_KEYS.length * OVERLAY_KEYS.indexOf(f.overlay));
  }
  function decode(idx) {
    var s = idx % SCENE_KEYS.length; idx = (idx - s) / SCENE_KEYS.length;
    var t = idx % TITLE_KEYS.length; var o = (idx - t) / TITLE_KEYS.length;
    return { scene: SCENE_KEYS[s], title: TITLE_KEYS[t], overlay: OVERLAY_KEYS[o] };
  }

  var assignments = null;
  function build(list) {
    var total = SCENE_KEYS.length * TITLE_KEYS.length * OVERLAY_KEYS.length;
    var rng = mulberry32(777);
    var order = []; for (var i = 0; i < total; i++) order.push(i);
    for (var j = total - 1; j > 0; j--) { var k = Math.floor(rng() * (j + 1)); var tmp = order[j]; order[j] = order[k]; order[k] = tmp; }
    var used = {}; assignments = {};
    list.forEach(function (a) { var f = FORCED[a.name]; if (f) { used[encode(f)] = true; assignments[a.id] = f; } });
    var ptr = 0;
    list.forEach(function (a) {
      if (assignments[a.id] || a.rarity < 1000) return;
      while (used[order[ptr]]) ptr++;
      used[order[ptr]] = true;
      assignments[a.id] = decode(order[ptr++]);
    });
  }

  function assign(aura) {
    if (!assignments) build(global.AURAS.list);
    return assignments[aura.id] || null;
  }

  /* Title styles: letters are spans with a per-letter delay. decode runs a character scramble in JS. */
  function applyTitle(el, text, style, step) {
    el.innerHTML = "";
    el.className = el.className.replace(/\bts-\S+/g, "").trim() + " ts-" + style;
    var spans = [], i = 0;
    text.split("").forEach(function (ch) {
      var sp = document.createElement("span");
      sp.className = "ltr" + (ch === " " ? " space" : "");
      sp.textContent = ch === " " ? " " : ch;
      sp.style.setProperty("--d", (i * step) + "s");
      el.appendChild(sp); spans.push(sp); i++;
    });
    var anim = style === "type" ? 0.05 : style === "slam" ? 0.5 : 1.1;
    var cancel = null;
    if (style === "decode") {
      var pool = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$%&*";
      var start = performance.now();
      var iv = setInterval(function () {
        var el2 = (performance.now() - start) / 1000;
        var done = true;
        spans.forEach(function (sp, k) {
          if (sp.classList.contains("space")) return;
          if (el2 < k * step + 0.5) { sp.textContent = pool[Math.floor(Math.random() * pool.length)]; done = false; }
          else sp.textContent = text[k];
        });
        if (done) clearInterval(iv);
      }, 45);
      cancel = function () { clearInterval(iv); };
    }
    return { done: i * step + anim, cancel: cancel };
  }

  global.REVEALS = { SCENES: SCENES, SCENE_KEYS: SCENE_KEYS, TITLE_KEYS: TITLE_KEYS, OVERLAY_KEYS: OVERLAY_KEYS, assign: assign, applyTitle: applyTitle, mulberry32: mulberry32, _build: build };
  if (typeof module !== "undefined" && module.exports) module.exports = global.REVEALS;
})(typeof window !== "undefined" ? window : globalThis);
