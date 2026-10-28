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
  /* Compact form for axis labels: 982M, 1.5B, 45K. */
  function fmtShort(n) {
    var units = [[1e9, "B"], [1e6, "M"], [1e3, "K"]];
    for (var i = 0; i < units.length; i++) if (n >= units[i][0]) { var v = n / units[i][0]; return (v >= 100 ? Math.round(v) : Math.round(v * 10) / 10) + units[i][1]; }
    return String(Math.round(n));
  }
  /* Largest font size (up to max) at which text fits inside maxWidth. */
  function fitFont(ctx, text, weight, family, max, maxWidth) {
    ctx.font = weight + " " + max + "px " + family;
    var wd = ctx.measureText(text).width;
    var size = wd > maxWidth ? Math.floor(max * maxWidth / wd) : max;
    ctx.font = weight + " " + size + "px " + family;
    return size;
  }
  function arr(n, fn) { var o = []; for (var i = 0; i < n; i++) o.push(fn(i)); return o; }
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
  function rrect(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function bez(u, a, b, c, d) { var v = 1 - u; return v * v * v * a + 3 * v * v * u * b + 3 * v * u * u * c + u * u * u * d; }
  /* A rune is a vertical stem plus one to three branch strokes on a small grid, drawn with lines so no special font is needed. */
  function makeGlyph(rng) {
    var strokes = [[[0.5, 0], [0.5, 1]]], n = 1 + Math.floor(rng() * 3);
    for (var i = 0; i < n; i++) {
      var y1 = Math.floor(rng() * 3) / 3, y2 = Math.min(1, y1 + (1 + Math.floor(rng() * 2)) / 3), side = rng() < 0.5 ? 0 : 1;
      strokes.push(rng() < 0.5 ? [[0.5, y1], [side, y2]] : [[side, y1], [0.5, y2]]);
    }
    return strokes;
  }
  function drawGlyph(ctx, g, size) {
    ctx.beginPath();
    g.forEach(function (st) { ctx.moveTo((st[0][0] - 0.5) * size * 0.6, (st[0][1] - 0.5) * size); ctx.lineTo((st[1][0] - 0.5) * size * 0.6, (st[1][1] - 0.5) * size); });
    ctx.stroke();
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
        ctx.font = "600 13px Rajdhani, sans-serif";
        var L = Math.max(w * 0.06, ctx.measureText("1 in " + fmtShort(env.rarity)).width + 18), R = w - Math.max(16, w * 0.04), T = 110, B = h - 120, plotW = R - L, plotH = B - T;
        ctx.strokeStyle = "rgba(255,255,255,.07)"; ctx.lineWidth = 1;
        for (var gx = 0; gx <= 8; gx++) { var x = L + plotW * gx / 8; ctx.beginPath(); ctx.moveTo(x, T); ctx.lineTo(x, B); ctx.stroke(); }
        for (var gy = 0; gy <= 4; gy++) { var y = T + plotH * gy / 4; ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(R, y); ctx.stroke(); }
        ctx.strokeStyle = withAlpha(env.c1, 0.9); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(L, T); ctx.lineTo(L, B); ctx.lineTo(R, B); ctx.stroke();
        for (var k = 0; k <= 4; k++) label(ctx, k === 0 ? "0" : "1 in " + fmtShort(env.rarity * k / 4), L - 8, B - plotH * k / 4 + 5, 13, "rgba(255,255,255,.6)", "right");
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
        var tipText = "1 in " + fmt(lv), tipSize = fitFont(ctx, tipText, "700", "Rajdhani, sans-serif", 20, w - 24), tipHalf = ctx.measureText(tipText).width / 2;
        label(ctx, tipText, Math.max(12 + tipHalf, Math.min(lx, w - 12 - tipHalf)), ly - 16, tipSize, "#fff", "center", "700");
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
        fitFont(ctx, fmt(env.rarity), "900", "Cinzel, serif", Math.min(w * 0.11, 110), w * 0.9); ctx.textAlign = "center";
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
      var chars = fmt(env.rarity).split(""), digits = chars.filter(function (c) { return c !== ","; }).map(Number), n = digits.length, commas = chars.length - n;
      var offs = digits.map(function () { return env.rng() * 10; });
      return function (ctx, t, w, h) {
        var p = t / env.dur;
        fill(ctx, w, h, "#0b0810");
        var gap = Math.max(3, Math.min(8, w * 0.01)), cell = Math.min(90, (w - 32 - (n - 1) * gap) / (n + commas * 0.35)), cw = cell * 0.35;
        var total = n * cell + (n - 1) * gap + commas * cw, x0 = (w - total) / 2, y0 = h * 0.36 - cell * 0.75, ch = cell * 1.5;
        var xs = [], cx0 = x0, di = 0;
        chars.forEach(function (c) {
          if (c === ",") { label(ctx, ",", cx0 + cw / 2 - gap / 2, y0 + ch * 0.85, Math.round(cell * 0.7), "rgba(255,255,255,.7)", "center", "900"); cx0 += cw; return; }
          xs.push(cx0); cx0 += cell + gap; di++;
        });
        for (var i = 0; i < n; i++) {
          var lockAt = 0.15 + 0.6 * (i / Math.max(1, n - 1)), locked = p >= lockAt;
          var x = xs[i];
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
        var tot = p < 0.66 ? ease(clamp01(p / 0.66)) : Math.max(0.4, 1 - (p - 0.66) * 1.6);
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
        if (p > 0.64 && p < 0.7) flash(ctx, w, h, (0.7 - p) * 8, env.c1);
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
      var mets = []; for (var k = 0; k < 28; k++) mets.push({ x: env.rng() * 1.4 - 0.2, y: -0.1 - env.rng() * 0.3, born: env.rng() * env.dur * 1.5, sp: 0.5 + env.rng() * 0.6, len: 80 + env.rng() * 160, col: env.colors[k % env.colors.length] });
      return function (ctx, t, w, h) {
        var g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, "#03030c"); g.addColorStop(1, withAlpha(env.c2, 0.5)); fill(ctx, w, h, g);
        stars.forEach(function (s) { ctx.globalAlpha = 0.4 + 0.6 * Math.sin(t * 3 + s.ph) * 0.5 + 0.3; ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(s.x * w, s.y * h, s.s, 0, TAU); ctx.fill(); }); ctx.globalAlpha = 1;
        ctx.lineCap = "round";
        mets.forEach(function (m) { var age = t - m.born; if (age < 0) return; age = age % (env.dur * 0.9); var x = m.x * w + age * m.sp * w * 0.6, y = m.y * h + age * m.sp * h * 0.9; if (y > h * 1.2) return; var dx = 0.55, dy = 0.83; var lg = ctx.createLinearGradient(x, y, x - dx * m.len, y - dy * m.len); lg.addColorStop(0, "#fff"); lg.addColorStop(0.3, m.col); lg.addColorStop(1, withAlpha(m.col, 0)); ctx.strokeStyle = lg; ctx.lineWidth = 3; glow(ctx, m.col, 14); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - dx * m.len, y - dy * m.len); ctx.stroke(); noglow(ctx); });
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
          var u = (x - x0) / speed + t * 0 + 100, cyc = u % 1.0, amp = h * (0.05 + 0.24 * clamp01((t - (x - w) / speed) / env.dur / 0.7));
          var y = base;
          if (cyc > 0.1 && cyc < 0.14) y = base - amp * 0.25 * Math.sin((cyc - 0.1) / 0.04 * Math.PI);
          else if (cyc > 0.2 && cyc < 0.24) y = base + amp * 0.3 * Math.sin((cyc - 0.2) / 0.04 * Math.PI);
          else if (cyc > 0.24 && cyc < 0.3) y = base - amp * Math.sin((cyc - 0.24) / 0.06 * Math.PI);
          else if (cyc > 0.3 && cyc < 0.34) y = base + amp * 0.35 * Math.sin((cyc - 0.3) / 0.04 * Math.PI);
          else if (cyc > 0.45 && cyc < 0.55) y = base - amp * 0.2 * Math.sin((cyc - 0.45) / 0.1 * Math.PI);
          if (first) { ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y);
        }
        glow(ctx, env.c1, 16); ctx.strokeStyle = env.c1; ctx.lineWidth = 3; ctx.stroke(); noglow(ctx);
        var beat = Math.pow(Math.max(0, Math.sin(t * TAU * (1 + Math.min(p, 1)))), 10);
        ctx.fillStyle = withAlpha(env.c1, 0.08 * beat); ctx.fillRect(0, 0, w, h);
        var ls = Math.round(Math.max(15, Math.min(24, w / 22))), narrow = w < 640;
        label(ctx, "♥ " + Math.round(60 + Math.min(p, 1) * 140) + " bpm", w * 0.06, h * 0.07, ls, env.c1, "left", "700");
        label(ctx, "1 in " + fmt(env.rarity * clamp01(p / 0.75)), narrow ? w * 0.06 : w * 0.94, narrow ? h * 0.07 + ls * 1.4 : h * 0.07, ls, "#fff", narrow ? "left" : "right", "700");
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
        dots.forEach(function (d) { var r = ((d.r + t * 0.12) % 1), rad = r * m * 0.6, a = d.arm * TAU / 4 + Math.log(1 + rad * 0.02) * 3 + t * (0.6 + 0.4 * Math.min(p, 1)); ctx.fillStyle = d.arm % 2 ? env.c1 : env.c2; ctx.globalAlpha = (1 - r) * 0.9; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad * 0.7, 1.5 + (1 - r) * 2.5, 0, TAU); ctx.fill(); });
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
          var z = ((i / 18 + t * (0.25 + Math.min(p, 1) * 0.5)) % 1), r = Math.pow(z, 2.2) * m * 0.9, sq = i % 2 === 0;
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
      var shells = []; for (var i = 0; i < 16; i++) shells.push({ x: 0.15 + env.rng() * 0.7, top: 0.15 + env.rng() * 0.4, at: 0.05 + i * 0.075 + env.rng() * 0.04, col: env.colors[i % env.colors.length], n: 60 + Math.floor(env.rng() * 50), seed: env.rng() * 100 });
      return function (ctx, t, w, h) {
        var p = t / env.dur;
        fill(ctx, w, h, "#04030a");
        shells.forEach(function (s) {
          var age = p - s.at; if (age < 0) return; age = age % 1.2;
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

  /* ---------- Ten more scenes ---------- */

  /* Northern lights ripple above a mountain range. */
  SCENES.aurora = { titleAt: 0.55, oddsAt: 0.7, textY: 0.48, make: function (env) {
    var stars = []; for (var i = 0; i < 160; i++) stars.push({ x: env.rng(), y: env.rng() * 0.7, s: 0.5 + env.rng() * 1.4, ph: env.rng() * 6 });
    var ridge = []; for (var k = 0; k <= 28; k++) ridge.push(0.7 + env.rng() * 0.14 - Math.sin(k / 28 * Math.PI) * 0.06);
    var front = []; for (var j = 0; j <= 18; j++) front.push(0.85 + env.rng() * 0.09);
    return function (ctx, t, w, h) {
      var p = t / env.dur, q = ease(clamp01(p / 0.5));
      var g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, "#01020a"); g.addColorStop(1, withAlpha(env.c2, 0.45)); fill(ctx, w, h, g);
      ctx.fillStyle = "#fff";
      stars.forEach(function (s) { ctx.globalAlpha = 0.35 + 0.35 * Math.sin(t * 2 + s.ph); ctx.fillRect(s.x * w, s.y * h, s.s, s.s); });
      ctx.globalAlpha = 1;
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      for (var r = 0; r < 4; r++) {
        var col = env.colors[r % env.colors.length], base = h * (0.14 + r * 0.07), depth = h * (0.22 + r * 0.03) * q, top = [];
        for (var x = -20; x <= w + 20; x += 10) top.push([x, base + Math.sin(x * 0.004 + t * 0.55 + r * 1.7) * h * 0.07 + Math.sin(x * 0.013 - t * 0.9 + r) * h * 0.025]);
        ctx.beginPath();
        top.forEach(function (P, n) { if (n === 0) ctx.moveTo(P[0], P[1]); else ctx.lineTo(P[0], P[1]); });
        for (var b = top.length - 1; b >= 0; b--) ctx.lineTo(top[b][0], top[b][1] + depth);
        ctx.closePath();
        var cg = ctx.createLinearGradient(0, base - h * 0.1, 0, base + depth + h * 0.08);
        cg.addColorStop(0, withAlpha(col, 0)); cg.addColorStop(0.35, withAlpha(col, 0.6 * q)); cg.addColorStop(1, withAlpha(col, 0));
        ctx.globalAlpha = 0.55 + 0.25 * Math.sin(t * 1.3 + r);
        ctx.fillStyle = cg; ctx.fill();
      }
      ctx.restore(); ctx.globalAlpha = 1;
      [[ridge, "#05050d"], [front, "#000"]].forEach(function (layer) {
        var pts = layer[0]; ctx.fillStyle = layer[1]; ctx.beginPath(); ctx.moveTo(0, h);
        pts.forEach(function (y, n) { ctx.lineTo(n / (pts.length - 1) * w, y * h); });
        ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
      });
      fadeIn(ctx, t, w, h, 0.5);
    };
  } };

  /* A mirrored kaleidoscope that blooms from the centre. */
  SCENES.kaleidoscope = { titleAt: 0.58, oddsAt: 0.74, textY: 0.5, make: function (env) {
    var SEG = 12, shapes = [];
    for (var i = 0; i < 16; i++) shapes.push({ r: 0.15 + env.rng() * 0.85, a: env.rng() * 0.25, s: 8 + env.rng() * 36, col: env.colors[i % env.colors.length], kind: i % 3, sp: env.rng() * 2 - 1 });
    return function (ctx, t, w, h) {
      var p = t / env.dur, cx = w / 2, cy = h / 2, R = Math.hypot(cx, cy), q = ease(clamp01(p / 0.45));
      fill(ctx, w, h, "#04030a");
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(t * 0.22); ctx.globalCompositeOperation = "lighter";
      for (var k = 0; k < SEG; k++) {
        ctx.save(); ctx.rotate(k * TAU / SEG); if (k % 2) ctx.scale(1, -1);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R, -TAU / SEG / 2 - 0.01, TAU / SEG / 2 + 0.01); ctx.closePath(); ctx.clip();
        shapes.forEach(function (s) {
          var d = s.r * R * q * (0.75 + 0.25 * Math.sin(t * 0.9 + s.sp * 3)), an = s.a + Math.sin(t * 0.7 * s.sp) * 0.2;
          var x = Math.cos(an) * d, y = Math.sin(an) * d, z = s.s * (0.4 + 0.6 * q) * (1 + s.r);
          ctx.globalAlpha = 0.55; ctx.fillStyle = s.col; ctx.beginPath();
          if (s.kind === 0) ctx.arc(x, y, z * 0.5, 0, TAU);
          else if (s.kind === 1) { ctx.moveTo(x, y - z * 0.6); ctx.lineTo(x + z * 0.55, y + z * 0.4); ctx.lineTo(x - z * 0.55, y + z * 0.4); ctx.closePath(); }
          else { ctx.moveTo(x, y - z * 0.6); ctx.lineTo(x + z * 0.4, y); ctx.lineTo(x, y + z * 0.6); ctx.lineTo(x - z * 0.4, y); ctx.closePath(); }
          ctx.fill();
        });
        ctx.restore();
      }
      ctx.restore(); ctx.globalAlpha = 1;
      var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(w, h) * 0.45);
      g.addColorStop(0, "rgba(0,0,0," + 0.7 * clamp01((p - 0.45) * 3) + ")"); g.addColorStop(1, "rgba(0,0,0,0)"); fill(ctx, w, h, g);
      fadeIn(ctx, t, w, h, 0.4);
    };
  } };

  /* A summoning circle draws itself, rune by rune, then fires a pillar of light. */
  SCENES.runes = { titleAt: 0.64, oddsAt: 0.78, textY: 0.5, make: function (env) {
    var outer = [], inner = [], motes = [];
    for (var i = 0; i < 24; i++) outer.push(makeGlyph(env.rng));
    for (var j = 0; j < 14; j++) inner.push(makeGlyph(env.rng));
    for (var m = 0; m < 70; m++) motes.push({ a: env.rng() * TAU, o: env.rng(), s: 1 + env.rng() * 2 });
    return function (ctx, t, w, h) {
      var p = t / env.dur, cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.42, gs = R * 0.1;
      fill(ctx, w, h, "#05030a");
      var bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.3); bg.addColorStop(0, withAlpha(env.c2, 0.45 * clamp01(p * 2))); bg.addColorStop(1, "rgba(0,0,0,0)"); fill(ctx, w, h, bg);
      ctx.save(); ctx.translate(cx, cy); ctx.lineCap = "round"; ctx.lineJoin = "round";
      glow(ctx, env.c1, 16); ctx.strokeStyle = env.c1; ctx.lineWidth = 3;
      var q1 = clamp01(p / 0.22), q2 = clamp01((p - 0.08) / 0.22);
      if (q1 > 0) { ctx.beginPath(); ctx.arc(0, 0, R, -Math.PI / 2, -Math.PI / 2 + q1 * TAU); ctx.stroke(); }
      if (q2 > 0) {
        ctx.beginPath(); ctx.arc(0, 0, R * 0.74, Math.PI / 2, Math.PI / 2 - q2 * TAU, true); ctx.stroke();
        ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, 0, R * 0.56, 0, q2 * TAU); ctx.stroke();
      }
      var shownO = clamp01((p - 0.18) / 0.25) * outer.length;
      ctx.lineWidth = 2.5; ctx.save(); ctx.rotate(t * 0.18);
      outer.forEach(function (gl, n) { if (n >= shownO) return; ctx.save(); ctx.rotate(n / outer.length * TAU); ctx.translate(0, -R * 0.87); ctx.strokeStyle = n + 1 > shownO ? "#ffffff" : env.c1; drawGlyph(ctx, gl, gs); ctx.restore(); });
      ctx.restore();
      var shownI = clamp01((p - 0.28) / 0.22) * inner.length;
      ctx.lineWidth = 2; ctx.save(); ctx.rotate(-t * 0.3);
      inner.forEach(function (gl, n) { if (n >= shownI) return; ctx.save(); ctx.rotate(n / inner.length * TAU); ctx.translate(0, -R * 0.65); ctx.strokeStyle = env.colors[n % env.colors.length]; drawGlyph(ctx, gl, gs * 0.8); ctx.restore(); });
      ctx.restore();
      var q3 = clamp01((p - 0.38) / 0.22) * 3;
      ctx.strokeStyle = withAlpha(env.c1, 0.9); ctx.lineWidth = 2.5;
      for (var tri = 0; tri < 2; tri++) {
        var pts = [];
        for (var v = 0; v < 3; v++) { var a2 = -Math.PI / 2 + tri * Math.PI + v * TAU / 3 + t * 0.1; pts.push([Math.cos(a2) * R * 0.56, Math.sin(a2) * R * 0.56]); }
        ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
        for (var e2 = 0; e2 < 3; e2++) { var f = clamp01(q3 - e2); if (f <= 0) break; var A = pts[e2], B = pts[(e2 + 1) % 3]; ctx.lineTo(lerp(A[0], B[0], f), lerp(A[1], B[1], f)); }
        ctx.stroke();
      }
      ctx.restore();
      if (p > 0.6) {
        var bw = R * 0.22 * clamp01((p - 0.6) / 0.1);
        var beam = ctx.createLinearGradient(cx - bw, 0, cx + bw, 0); beam.addColorStop(0, withAlpha(env.c1, 0)); beam.addColorStop(0.5, withAlpha(env.c1, 0.55)); beam.addColorStop(1, withAlpha(env.c1, 0));
        ctx.fillStyle = beam; ctx.fillRect(cx - bw, 0, bw * 2, h);
        if (p < 0.67) flash(ctx, w, h, (0.67 - p) * 6, env.c1);
      }
      var dk = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.6); dk.addColorStop(0, "rgba(0,0,0," + 0.65 * clamp01((p - 0.55) * 4) + ")"); dk.addColorStop(1, "rgba(0,0,0,0)"); fill(ctx, w, h, dk);
      ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.fillStyle = env.c1;
      motes.forEach(function (mo) { var lp = (t * 0.25 + mo.o) % 1; ctx.globalAlpha = Math.sin(lp * Math.PI) * clamp01(p * 3); ctx.beginPath(); ctx.arc(cx + Math.cos(mo.a) * R * (0.6 + 0.4 * mo.o), cy + Math.sin(mo.a) * R * 0.5 - lp * h * 0.4, mo.s, 0, TAU); ctx.fill(); });
      ctx.restore(); ctx.globalAlpha = 1;
      fadeIn(ctx, t, w, h, 0.4);
    };
  } };

  /* A VHS tape plays colour bars, then the picture tears and glitches into the reveal. */
  SCENES.vhs = { titleAt: 0.52, oddsAt: 0.68, textY: 0.5, make: function (env) {
    var bars = ["#ffffff", "#fde047", "#22d3ee", "#4ade80", "#e879f9", "#ef4444", "#3b82f6"];
    return function (ctx, t, w, h) {
      var p = t / env.dur, chaos = 1 - clamp01((p - 0.4) / 0.25);
      if (p < 0.32) {
        var bw = w / bars.length;
        bars.forEach(function (c, n) { ctx.fillStyle = n % 2 ? c : env.colors[n % env.colors.length]; ctx.fillRect(n * bw, 0, bw + 1, h * 0.7); });
        for (var n2 = 0; n2 < bars.length; n2++) { ctx.fillStyle = n2 % 2 ? "#111111" : "#eeeeee"; ctx.fillRect(n2 * bw, h * 0.7, bw + 1, h * 0.08); }
        ctx.fillStyle = "#0b0b14"; ctx.fillRect(0, h * 0.78, w, h * 0.22);
      } else {
        var g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7); g.addColorStop(0, withAlpha(env.c2, 0.9)); g.addColorStop(1, "#000"); fill(ctx, w, h, g);
      }
      var tears = Math.floor(3 + chaos * 10);
      for (var k = 0; k < tears; k++) {
        if (Math.random() > 0.6 * chaos + 0.08) continue;
        var y = Math.random() * (h - 44), hh = 4 + Math.random() * 40, off = (Math.random() - 0.5) * 120 * (chaos + 0.2);
        try { ctx.drawImage(ctx.canvas, 0, y, w, hh, off, y, w, hh); } catch (e) { /* ignore */ }
        ctx.fillStyle = withAlpha(Math.random() < 0.5 ? "#22d3ee" : "#ff00ff", 0.25); ctx.fillRect(0, y, w, 2);
      }
      var blockCols = [env.c1, "#00ffff", "#ff00ff", "#ffffff"];
      for (var b = 0; b < 14 * chaos; b++) { ctx.fillStyle = withAlpha(blockCols[b % 4], 0.5); ctx.fillRect(Math.random() * w, Math.random() * h, 20 + Math.random() * 160, 4 + Math.random() * 20); }
      var by = ((t * 0.35) % 1.2 - 0.1) * h, band = ctx.createLinearGradient(0, by - 40, 0, by + 40);
      band.addColorStop(0, "rgba(255,255,255,0)"); band.addColorStop(0.5, "rgba(255,255,255,.12)"); band.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = band; ctx.fillRect(0, by - 40, w, 80);
      ctx.fillStyle = "rgba(255,255,255,.5)"; for (var n3 = 0; n3 < 260; n3++) ctx.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5);
      ctx.font = "700 " + Math.round(Math.min(28, w / 30)) + "px ui-monospace, Menlo, Consolas, monospace"; ctx.fillStyle = "#fff";
      ctx.textAlign = "left"; ctx.fillText(p < 0.32 ? "PLAY ▶" : "REC ●", w * 0.05, h * 0.09);
      var secs = Math.floor(t), fr = Math.floor((t % 1) * 30);
      ctx.textAlign = "right"; ctx.fillText("00:00:" + (secs < 10 ? "0" : "") + secs + ":" + (fr < 10 ? "0" : "") + fr, w * 0.95, h * 0.93);
      if (p > 0.32 && p < 0.38) flash(ctx, w, h, (0.38 - p) * 10);
      fadeIn(ctx, t, w, h, 0.2);
    };
  } };

  /* A glowing tree grows branch by branch and blossoms in the aura's colours. */
  SCENES.tree = { titleAt: 0.62, oddsAt: 0.76, textY: 0.2, make: function (env) {
    var branches = [], leaves = [], fall = [];
    function grow(x, y, ang, len, depth, start) {
      var x2 = x + Math.cos(ang) * len, y2 = y + Math.sin(ang) * len;
      branches.push({ x: x, y: y, x2: x2, y2: y2, depth: depth, start: start });
      if (depth >= 8) { leaves.push({ x: x2, y: y2, start: start + 0.06, col: env.colors[leaves.length % env.colors.length], ph: env.rng() * 6 }); return; }
      var n = depth < 2 ? 2 : (env.rng() < 0.3 ? 3 : 2);
      for (var k = 0; k < n; k++) grow(x2, y2, ang + (k - (n - 1) / 2) * (0.38 + env.rng() * 0.22) + (env.rng() - 0.5) * 0.18, len * (0.72 + env.rng() * 0.08), depth + 1, start + 0.055 + env.rng() * 0.012);
    }
    grow(0, 0, -Math.PI / 2, 0.17, 0, 0);
    for (var i = 0; i < 50; i++) fall.push({ x: (env.rng() - 0.5) * 1.1, y: -0.75 + env.rng() * 0.5, sp: 0.03 + env.rng() * 0.05, ph: env.rng() * 6, col: env.colors[i % env.colors.length] });
    return function (ctx, t, w, h) {
      var p = t / env.dur, U = Math.min(w, h), bx = w / 2, by = h * 0.97;
      var g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, "#03040a"); g.addColorStop(1, withAlpha(env.c2, 0.5)); fill(ctx, w, h, g);
      var gg = ctx.createRadialGradient(bx, by, 0, bx, by, w * 0.5); gg.addColorStop(0, withAlpha(env.c1, 0.3)); gg.addColorStop(1, "rgba(0,0,0,0)"); fill(ctx, w, h, gg);
      ctx.lineCap = "round";
      branches.forEach(function (b) {
        var q = clamp01((p - b.start) / 0.06); if (q <= 0) return;
        ctx.strokeStyle = b.depth < 3 ? "#1d1424" : withAlpha(env.c1, 0.25 + b.depth * 0.08);
        ctx.lineWidth = Math.max(1, (9 - b.depth) * U / 260);
        ctx.beginPath(); ctx.moveTo(bx + b.x * U, by + b.y * U); ctx.lineTo(bx + lerp(b.x, b.x2, q) * U, by + lerp(b.y, b.y2, q) * U); ctx.stroke();
      });
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      leaves.forEach(function (l) {
        var q = clamp01((p - l.start) / 0.08); if (q <= 0) return;
        var x = bx + l.x * U, y = by + l.y * U, r = (2 + Math.sin(t * 3 + l.ph)) * q;
        ctx.fillStyle = l.col; ctx.globalAlpha = 0.25; ctx.beginPath(); ctx.arc(x, y, r * 3.5, 0, TAU); ctx.fill();
        ctx.globalAlpha = 0.9; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
      });
      if (p > 0.6) fall.forEach(function (f) {
        var y = by + (f.y + (t - env.dur * 0.6) * f.sp) * U; if (y > by) return;
        ctx.globalAlpha = 0.8; ctx.fillStyle = f.col; ctx.beginPath(); ctx.arc(bx + (f.x + Math.sin(t + f.ph) * 0.03) * U, y, 2.5, 0, TAU); ctx.fill();
      });
      ctx.restore(); ctx.globalAlpha = 1;
      fadeIn(ctx, t, w, h, 0.4);
    };
  } };

  /* An atom: electrons speed up around a pulsing nucleus until it fuses. */
  SCENES.atom = { titleAt: 0.6, oddsAt: 0.74, textY: 0.83, make: function (env) {
    var orbits = [], nuc = [];
    for (var i = 0; i < 4; i++) orbits.push({ tilt: i * Math.PI / 4 + env.rng() * 0.2, sp: 1.4 + env.rng() * 1.2, ph: env.rng() * TAU, col: env.colors[i % env.colors.length] });
    for (var k = 0; k < 16; k++) { var a = env.rng() * TAU, r = Math.sqrt(env.rng()); nuc.push({ x: Math.cos(a) * r, y: Math.sin(a) * r, c: k % 2 }); }
    return function (ctx, t, w, h) {
      var p = t / env.dur, cx = w / 2, cy = h * 0.42, U = Math.min(w, h), q = ease(clamp01(p / 0.3));
      var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, U * 0.7); g.addColorStop(0, withAlpha(env.c2, 0.45)); g.addColorStop(1, "#020208"); fill(ctx, w, h, g);
      var rx = U * 0.36 * q, ry = U * 0.12 * q;
      orbits.forEach(function (o) {
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(o.tilt);
        ctx.strokeStyle = withAlpha(o.col, 0.45); ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(0, 0, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, TAU); ctx.stroke();
        var speed = o.sp * (1 + Math.min(p, 1) * 2.5);
        for (var s = 0; s < 18; s++) {
          var an = o.ph + t * speed - s * 0.06;
          ctx.globalAlpha = (1 - s / 18) * 0.9; ctx.fillStyle = s === 0 ? "#fff" : o.col;
          ctx.beginPath(); ctx.arc(Math.cos(an) * rx, Math.sin(an) * ry, (s === 0 ? 7 : 5) * (1 - s / 22), 0, TAU); ctx.fill();
        }
        ctx.globalAlpha = 1; ctx.restore();
      });
      var nr = U * 0.045 * q * (1 + 0.08 * Math.sin(t * (6 + p * 10)));
      if (nr > 0.5) nuc.forEach(function (n) {
        var x = cx + n.x * nr, y = cy + n.y * nr, sg = ctx.createRadialGradient(x - nr * 0.15, y - nr * 0.15, 0, x, y, nr * 0.5);
        sg.addColorStop(0, "#fff"); sg.addColorStop(1, n.c ? env.c1 : env.c2); ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(x, y, nr * 0.42, 0, TAU); ctx.fill();
      });
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      var core = ctx.createRadialGradient(cx, cy, 0, cx, cy, U * 0.2); core.addColorStop(0, withAlpha(env.c1, 0.5 * clamp01(p * 1.5))); core.addColorStop(1, "rgba(0,0,0,0)"); ctx.fillStyle = core; ctx.fillRect(0, 0, w, h);
      ctx.restore();
      if (p > 0.55) {
        var r2 = ((p - 0.55) * 2) % 1;
        ctx.strokeStyle = withAlpha("#ffffff", 1 - r2); ctx.lineWidth = 4 * (1 - r2); ctx.beginPath(); ctx.arc(cx, cy, U * 0.05 + r2 * U * 0.6, 0, TAU); ctx.stroke();
        if (p < 0.6) flash(ctx, w, h, (0.6 - p) * 8, env.c1);
      }
      fadeIn(ctx, t, w, h, 0.4);
    };
  } };

  /* Sand runs through an hourglass; when it empties, the glass bursts with light. */
  SCENES.hourglass = { titleAt: 0.68, oddsAt: 0.82, textY: 0.84, make: function (env) {
    var burst = [], grains = [];
    for (var i = 0; i < 120; i++) burst.push({ a: env.rng() * TAU, s: 0.2 + env.rng() * 0.9, r: 1 + env.rng() * 2.5 });
    for (var k = 0; k < 40; k++) grains.push({ o: env.rng(), dx: env.rng() - 0.5 });
    return function (ctx, t, w, h) {
      var p = t / env.dur, cx = w / 2, cy = h * 0.37, H = Math.min(h * 0.28, w * 0.3), W = H * 0.6, neck = W * 0.07, q = clamp01(p / 0.6);
      var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.6); g.addColorStop(0, withAlpha(env.c2, 0.4)); g.addColorStop(1, "#030308"); fill(ctx, w, h, g);
      function glass() {
        ctx.beginPath(); ctx.moveTo(cx - W, cy - H);
        ctx.bezierCurveTo(cx - W, cy - H * 0.35, cx - neck, cy - H * 0.2, cx - neck, cy);
        ctx.bezierCurveTo(cx - neck, cy + H * 0.2, cx - W, cy + H * 0.35, cx - W, cy + H);
        ctx.lineTo(cx + W, cy + H);
        ctx.bezierCurveTo(cx + W, cy + H * 0.35, cx + neck, cy + H * 0.2, cx + neck, cy);
        ctx.bezierCurveTo(cx + neck, cy - H * 0.2, cx + W, cy - H * 0.35, cx + W, cy - H);
        ctx.closePath();
      }
      var sand = ctx.createLinearGradient(0, cy - H, 0, cy + H); sand.addColorStop(0, env.c1); sand.addColorStop(1, env.c2);
      ctx.save(); glass(); ctx.clip();
      ctx.fillStyle = "rgba(255,255,255,.04)"; ctx.fillRect(cx - W, cy - H, W * 2, H * 2);
      ctx.fillStyle = sand;
      var topLevel = lerp(cy - H * 0.8, cy, Math.pow(q, 0.8));
      if (q < 1) ctx.fillRect(cx - W, topLevel, W * 2, cy - topLevel);
      var pile = H * 0.75 * Math.pow(q, 0.9);
      ctx.beginPath(); ctx.moveTo(cx - W * 1.1, cy + H); ctx.lineTo(cx - W * 1.1, cy + H - pile * 0.35); ctx.quadraticCurveTo(cx, cy + H - pile * 1.35, cx + W * 1.1, cy + H - pile * 0.35); ctx.lineTo(cx + W * 1.1, cy + H); ctx.closePath(); ctx.fill();
      if (q > 0 && q < 1) {
        var fallLen = Math.max(0, H - pile * 0.85);
        ctx.fillRect(cx - 1.5, cy, 3, fallLen);
        grains.forEach(function (gr) { var lp = (t * 1.8 + gr.o) % 1; ctx.fillRect(cx + gr.dx * 6 - 1, cy + lp * fallLen, 2, 2); });
      }
      ctx.restore();
      ctx.strokeStyle = "rgba(255,255,255,.6)"; ctx.lineWidth = 2.5; glow(ctx, env.c1, 14); glass(); ctx.stroke(); noglow(ctx);
      ctx.fillStyle = env.c1; ctx.fillRect(cx - W * 1.2, cy - H - 14, W * 2.4, 14); ctx.fillRect(cx - W * 1.2, cy + H, W * 2.4, 14);
      if (q >= 1) {
        var bq = clamp01((p - 0.6) / 0.35);
        if (bq < 0.15) flash(ctx, w, h, (0.15 - bq) * 5, env.c1);
        ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.fillStyle = env.c1;
        burst.forEach(function (b) { var d = b.s * Math.max(w, h) * 0.6 * ease(bq); ctx.globalAlpha = 1 - bq; ctx.beginPath(); ctx.arc(cx + Math.cos(b.a) * d, cy + Math.sin(b.a) * d, b.r, 0, TAU); ctx.fill(); });
        ctx.restore(); ctx.globalAlpha = 1;
        var halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, H * 1.6); halo.addColorStop(0, withAlpha(env.c1, 0.35 + 0.1 * Math.sin(t * 4))); halo.addColorStop(1, "rgba(0,0,0,0)"); fill(ctx, w, h, halo);
      }
      fadeIn(ctx, t, w, h, 0.4);
    };
  } };

  /* Five fortune cards are dealt and flipped; the centre card holds the aura. */
  SCENES.cards = { titleAt: 0.72, oddsAt: 0.84, textY: 0.8, make: function (env) {
    var syms = ["★", "✦", "✧", "☾", "♛", "♆", "❂", "✺", "✵", "✶"], pick = [];
    for (var i = 0; i < 5; i++) pick.push(syms[Math.floor(env.rng() * syms.length)]);
    var flipOrder = [0, 4, 1, 3, 2], drawOrder = [0, 1, 3, 4, 2], initial = env.name.charAt(0).toUpperCase();
    return function (ctx, t, w, h) {
      var p = t / env.dur, cw = Math.min(w * 0.14, 150), ch = cw * 1.6, cx = w / 2, cy = h * 0.38;
      var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.7); g.addColorStop(0, "#1a0f24"); g.addColorStop(1, "#050308"); fill(ctx, w, h, g);
      var reveal = clamp01((p - 0.66) / 0.12);
      drawOrder.forEach(function (n) {
        var d = ease(clamp01((p - n * 0.05) / 0.16)), center = n === 2;
        var x = lerp(cx, cx + (n - 2) * cw * 1.22, d), y = lerp(h + ch, cy, d) - (center ? reveal * ch * 0.12 : 0), rot = (1 - d) * (n - 2) * 0.6;
        var f = clamp01((p - 0.3 - flipOrder.indexOf(n) * 0.07) / 0.08), face = f >= 0.5, scale = 1 + (center ? reveal * 0.35 : 0);
        ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(Math.abs(Math.cos(f * Math.PI)) * scale + 0.001, scale);
        ctx.globalAlpha = !center && reveal > 0 ? 1 - reveal * 0.5 : 1;
        if (center && face) glow(ctx, env.c1, 30 + 20 * reveal);
        ctx.fillStyle = face ? "#160d22" : "#0d1030"; rrect(ctx, -cw / 2, -ch / 2, cw, ch, cw * 0.08); ctx.fill(); noglow(ctx);
        ctx.strokeStyle = face ? env.c1 : withAlpha(env.c2, 0.9); ctx.lineWidth = 3; ctx.stroke();
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        if (!face) {
          ctx.save(); rrect(ctx, -cw / 2 + 6, -ch / 2 + 6, cw - 12, ch - 12, cw * 0.06); ctx.clip();
          ctx.strokeStyle = withAlpha(env.c1, 0.35); ctx.lineWidth = 1.5;
          for (var k = -6; k <= 6; k++) {
            ctx.beginPath(); ctx.moveTo(k * cw * 0.2 - ch, -ch / 2); ctx.lineTo(k * cw * 0.2 + ch, ch / 2); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(k * cw * 0.2 + ch, -ch / 2); ctx.lineTo(k * cw * 0.2 - ch, ch / 2); ctx.stroke();
          }
          ctx.restore();
        } else if (center) {
          var cg = ctx.createLinearGradient(0, -ch / 2, 0, ch / 2);
          env.colors.forEach(function (c, ci) { cg.addColorStop(ci / Math.max(1, env.colors.length - 1), withAlpha(c, 0.55)); });
          ctx.fillStyle = cg; rrect(ctx, -cw / 2 + 8, -ch / 2 + 8, cw - 16, ch - 16, cw * 0.06); ctx.fill();
          ctx.font = "900 " + Math.round(cw * 0.6) + "px Cinzel, serif"; ctx.fillStyle = "#fff"; glow(ctx, env.c1, 20); ctx.fillText(initial, 0, 0); noglow(ctx);
        } else {
          ctx.font = "700 " + Math.round(cw * 0.45) + "px serif"; ctx.fillStyle = env.colors[n % env.colors.length]; ctx.fillText(pick[n], 0, 0);
        }
        ctx.restore();
      });
      ctx.globalAlpha = 1;
      if (reveal > 0) { var r = ((p - 0.66) * 2) % 1; ctx.strokeStyle = withAlpha(env.c1, (1 - r) * 0.8); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy, cw * 0.8 + r * w * 0.5, 0, TAU); ctx.stroke(); }
      if (p > 0.66 && p < 0.72) flash(ctx, w, h, (0.72 - p) * 5, env.c1);
      fadeIn(ctx, t, w, h, 0.3);
    };
  } };

  /* Blossom petals drift across a rising moon. */
  SCENES.sakura = { titleAt: 0.5, oddsAt: 0.66, textY: 0.68, make: function (env) {
    var petals = [], blossoms = [];
    for (var i = 0; i < 170; i++) petals.push({ x: env.rng() * 1.3, y: env.rng(), s: 4 + env.rng() * 7, sp: 0.05 + env.rng() * 0.09, sw: 0.6 + env.rng() * 1.4, rot: env.rng() * TAU, spin: (env.rng() - 0.5) * 4, col: env.rng() < 0.6 ? "#fbcfe8" : env.colors[i % env.colors.length] });
    for (var k = 0; k < 60; k++) blossoms.push({ u: env.rng(), off: (env.rng() - 0.5) * 0.06, r: 3 + env.rng() * 6 });
    return function (ctx, t, w, h) {
      var p = t / env.dur, mq = ease(clamp01(p / 0.5));
      var g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, "#0a0614"); g.addColorStop(1, withAlpha(env.c2, 0.65)); fill(ctx, w, h, g);
      var mr = Math.min(w, h) * 0.2, mx = w * 0.66, my = lerp(h * 0.75, h * 0.33, mq);
      var halo = ctx.createRadialGradient(mx, my, mr * 0.8, mx, my, mr * 2.6); halo.addColorStop(0, withAlpha(env.c1, 0.35)); halo.addColorStop(1, "rgba(0,0,0,0)"); fill(ctx, w, h, halo);
      var mg = ctx.createRadialGradient(mx - mr * 0.3, my - mr * 0.3, 0, mx, my, mr); mg.addColorStop(0, "#fffaf0"); mg.addColorStop(1, withAlpha(env.c1, 0.9));
      ctx.fillStyle = mg; ctx.beginPath(); ctx.arc(mx, my, mr, 0, TAU); ctx.fill();
      var P = [[-20, h * 0.08], [w * 0.2, h * 0.26], [w * 0.38, h * 0.02], [w * 0.58, h * 0.2]];
      ctx.strokeStyle = "#07040b"; ctx.lineCap = "round"; ctx.lineWidth = Math.max(6, w * 0.012);
      ctx.beginPath(); ctx.moveTo(P[0][0], P[0][1]); ctx.bezierCurveTo(P[1][0], P[1][1], P[2][0], P[2][1], P[3][0], P[3][1]); ctx.stroke();
      ctx.lineWidth = Math.max(3, w * 0.005); ctx.beginPath(); ctx.moveTo(w * 0.24, h * 0.14); ctx.quadraticCurveTo(w * 0.3, h * 0.3, w * 0.36, h * 0.36); ctx.stroke();
      ctx.fillStyle = "#f9a8d4"; ctx.globalAlpha = 0.9;
      blossoms.forEach(function (b) { ctx.beginPath(); ctx.arc(bez(b.u, P[0][0], P[1][0], P[2][0], P[3][0]), bez(b.u, P[0][1], P[1][1], P[2][1], P[3][1]) + b.off * h, b.r, 0, TAU); ctx.fill(); });
      petals.forEach(function (pt) {
        var y = ((pt.y + t * pt.sp) % 1.1) - 0.05, x = ((pt.x - t * 0.04 + Math.sin(t * pt.sw + pt.rot) * 0.02) % 1.3 + 1.3) % 1.3 - 0.15;
        ctx.save(); ctx.translate(x * w, y * h); ctx.rotate(pt.rot + t * pt.spin); ctx.scale(1, 0.55 + 0.45 * Math.sin(t * pt.sw * 2 + pt.rot));
        ctx.fillStyle = pt.col; ctx.globalAlpha = 0.85; ctx.beginPath(); ctx.ellipse(0, 0, pt.s, pt.s * 0.6, 0, 0, TAU); ctx.fill(); ctx.restore();
      });
      ctx.globalAlpha = 1;
      fadeIn(ctx, t, w, h, 0.5);
    };
  } };

  /* A ringed planet rises into view and the sun flares over its edge. */
  SCENES.planet = { titleAt: 0.6, oddsAt: 0.75, textY: 0.2, make: function (env) {
    var stars = [], bands = [];
    for (var i = 0; i < 200; i++) stars.push({ x: env.rng(), y: env.rng(), s: 0.5 + env.rng() * 1.5, ph: env.rng() * 6 });
    for (var k = 0; k < 7; k++) bands.push({ y: -0.85 + k * 0.26 + env.rng() * 0.06, hgt: 0.05 + env.rng() * 0.1, col: env.colors[k % env.colors.length], a: 0.25 + env.rng() * 0.3 });
    return function (ctx, t, w, h) {
      var p = t / env.dur, q = ease(clamp01(p / 0.6)), R = Math.min(w, h) * 0.24, cx = w / 2, cy = lerp(h + R * 1.6, h * 0.6, q), tilt = -0.28;
      fill(ctx, w, h, "#010107");
      ctx.fillStyle = "#fff";
      stars.forEach(function (s) { ctx.globalAlpha = 0.3 + 0.4 * Math.abs(Math.sin(t + s.ph)); ctx.fillRect(s.x * w, s.y * h, s.s, s.s); });
      ctx.globalAlpha = 1;
      function rings(start, end) {
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(tilt);
        for (var r = 0; r < 4; r++) { ctx.strokeStyle = withAlpha(env.colors[r % env.colors.length], 0.55 - r * 0.08); ctx.lineWidth = R * (0.07 - r * 0.012); ctx.beginPath(); ctx.ellipse(0, 0, R * (1.55 + r * 0.16), R * (0.32 + r * 0.035), 0, start, end); ctx.stroke(); }
        ctx.restore();
      }
      rings(Math.PI, TAU);
      var pg = ctx.createRadialGradient(cx - R * 0.45, cy - R * 0.5, R * 0.1, cx, cy, R * 1.05); pg.addColorStop(0, env.c1); pg.addColorStop(0.55, env.c2); pg.addColorStop(1, "#000");
      ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fillStyle = pg; ctx.fill(); ctx.clip();
      ctx.translate(cx, cy); ctx.rotate(tilt);
      bands.forEach(function (b) { ctx.fillStyle = withAlpha(b.col, b.a); ctx.fillRect(-R * 1.2, (b.y + Math.sin(t * 0.3 + b.y * 5) * 0.01) * R, R * 2.4, b.hgt * R); });
      ctx.restore();
      var sg = ctx.createLinearGradient(cx - R, cy - R, cx + R, cy + R); sg.addColorStop(0.45, "rgba(0,0,0,0)"); sg.addColorStop(1, "rgba(0,0,0,.75)");
      ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();
      ctx.strokeStyle = withAlpha(env.c1, 0.6); ctx.lineWidth = 3; glow(ctx, env.c1, 24); ctx.beginPath(); ctx.arc(cx, cy, R + 1, Math.PI * 0.9, Math.PI * 1.8); ctx.stroke(); noglow(ctx);
      rings(0, Math.PI);
      if (p > 0.55) {
        var f = clamp01((p - 0.55) / 0.15), sx = cx + R * 0.72, sy = cy - R * 0.72;
        ctx.save(); ctx.globalCompositeOperation = "lighter";
        var sun = ctx.createRadialGradient(sx, sy, 0, sx, sy, R * 1.2 * f + 1); sun.addColorStop(0, "rgba(255,255,255,.95)"); sun.addColorStop(0.15, withAlpha(env.c1, 0.6)); sun.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = sun; ctx.fillRect(0, 0, w, h);
        var streak = ctx.createLinearGradient(0, sy, w, sy); streak.addColorStop(0, "rgba(255,255,255,0)"); streak.addColorStop(clamp01(sx / w), "rgba(255,255,255," + 0.7 * f + ")"); streak.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = streak; ctx.fillRect(0, sy - 2, w, 4);
        for (var gh = 1; gh <= 4; gh++) { ctx.fillStyle = withAlpha(env.colors[gh % env.colors.length], 0.12 * f); ctx.beginPath(); ctx.arc(lerp(sx, w - sx, gh / 5), lerp(sy, h - sy, gh / 5), R * (0.08 + gh * 0.05), 0, TAU); ctx.fill(); }
        ctx.restore();
      }
      fadeIn(ctx, t, w, h, 0.4);
    };
  } };

  /* ---------- Twenty more scenes ---------- */

  /* A lighthouse sweeps its beam over a night sea. */
  SCENES.lighthouse = { titleAt: 0.6, oddsAt: 0.75, textY: 0.4, make: function (env) {
    var stars = arr(120, function () { return { x: env.rng(), y: env.rng() * 0.6, s: 0.5 + env.rng() * 1.2, ph: env.rng() * 6 }; });
    var waves = arr(8, function (k) { return { y: 0.69 + k * 0.04, amp: 2 + k * 1.6, sp: 0.6 + env.rng(), ph: env.rng() * 6 }; });
    return function (ctx, t, w, h) {
      var p = t / env.dur, U = Math.min(w, h), on = clamp01((p - 0.12) / 0.12), hz = h * 0.66;
      var sky = ctx.createLinearGradient(0, 0, 0, hz); sky.addColorStop(0, "#02030c"); sky.addColorStop(1, withAlpha(env.c2, 0.55)); ctx.fillStyle = sky; ctx.fillRect(0, 0, w, hz);
      var sea = ctx.createLinearGradient(0, hz, 0, h); sea.addColorStop(0, "#050816"); sea.addColorStop(1, "#000"); ctx.fillStyle = sea; ctx.fillRect(0, hz, w, h - hz);
      ctx.fillStyle = "#fff"; stars.forEach(function (s) { ctx.globalAlpha = 0.3 + 0.3 * Math.sin(t * 2 + s.ph); ctx.fillRect(s.x * w, s.y * h, s.s, s.s); }); ctx.globalAlpha = 1;
      waves.forEach(function (wv, k) {
        ctx.strokeStyle = withAlpha(env.c1, 0.1 + k * 0.02); ctx.lineWidth = 1.5; ctx.beginPath();
        for (var x = 0; x <= w; x += 12) { var y = wv.y * h + Math.sin(x * 0.012 + t * wv.sp + wv.ph) * wv.amp; if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
        ctx.stroke();
      });
      var lx = w * 0.84, th = U * 0.34, topY = hz - th, lampY = topY - U * 0.03, tb = U * 0.045, tt = U * 0.028;
      ctx.fillStyle = "#06050c"; ctx.beginPath(); ctx.ellipse(lx, hz + U * 0.01, U * 0.12, U * 0.025, 0, 0, TAU); ctx.fill();
      ctx.save(); ctx.beginPath(); ctx.moveTo(lx - tb, hz); ctx.lineTo(lx - tt, topY); ctx.lineTo(lx + tt, topY); ctx.lineTo(lx + tb, hz); ctx.closePath();
      ctx.fillStyle = "#0b0b16"; ctx.fill(); ctx.clip();
      ctx.fillStyle = withAlpha(env.c1, 0.22); for (var b = 0; b < 3; b++) ctx.fillRect(lx - tb, topY + th * (0.15 + b * 0.3), tb * 2, th * 0.12);
      ctx.restore();
      ctx.fillStyle = "#111018"; ctx.fillRect(lx - tt * 1.25, lampY - U * 0.02, tt * 2.5, U * 0.05);
      ctx.fillStyle = withAlpha(env.c1, 0.4 + 0.6 * on); ctx.fillRect(lx - tt * 0.9, lampY - U * 0.012, tt * 1.8, U * 0.032);
      ctx.fillStyle = "#111018"; ctx.beginPath(); ctx.moveTo(lx - tt * 1.4, lampY - U * 0.02); ctx.lineTo(lx, lampY - U * 0.06); ctx.lineTo(lx + tt * 1.4, lampY - U * 0.02); ctx.closePath(); ctx.fill();
      var face = Math.pow(Math.max(0, Math.sin(t * 1.6)), 10), a = Math.PI + 0.22 * Math.sin(t * 0.7) - 0.06, L = w * 1.2, spread = 0.08 + 0.03 * Math.sin(t * 1.3);
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      [[a, L, 0.75], [a - Math.PI, L * 0.25, 0.35]].forEach(function (bm) {
        var g = ctx.createLinearGradient(lx, lampY, lx + Math.cos(bm[0]) * bm[1], lampY + Math.sin(bm[0]) * bm[1]);
        g.addColorStop(0, withAlpha("#ffffff", bm[2] * on)); g.addColorStop(0.25, withAlpha(env.c1, 0.35 * on)); g.addColorStop(1, withAlpha(env.c1, 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(lx, lampY);
        ctx.lineTo(lx + Math.cos(bm[0] - spread) * bm[1], lampY + Math.sin(bm[0] - spread) * bm[1]); ctx.lineTo(lx + Math.cos(bm[0] + spread) * bm[1], lampY + Math.sin(bm[0] + spread) * bm[1]); ctx.closePath(); ctx.fill();
      });
      var lg = ctx.createRadialGradient(lx, lampY, 0, lx, lampY, U * (0.06 + 0.16 * face) + 1); lg.addColorStop(0, withAlpha("#ffffff", 0.9 * on)); lg.addColorStop(1, withAlpha(env.c1, 0));
      ctx.fillStyle = lg; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = withAlpha(env.c1, 0.35 * on);
      for (var r = 0; r < 16; r++) { var ry = hz + 6 + r * (h - hz) / 16, rw = 6 + r * 3 + Math.sin(t * 3 + r) * 4; ctx.globalAlpha = (1 - r / 16) * (0.5 + 0.5 * Math.sin(t * 4 + r * 1.7)); ctx.fillRect(lx - rw / 2, ry, rw, 2); }
      ctx.restore(); ctx.globalAlpha = 1;
      if (p > 0.57 && p < 0.64) flash(ctx, w, h, (0.64 - p) * 6, env.c1);
      fadeIn(ctx, t, w, h, 0.4);
    };
  } };

  /* A volcano rumbles, then erupts in a fountain of lava. */
  SCENES.volcano = { titleAt: 0.58, oddsAt: 0.72, textY: 0.2, make: function (env) {
    var lava = arr(150, function () { var r = env.rng(); return { vx: (env.rng() - 0.5) * 0.9, vy: 0.9 + env.rng() * 0.9, s: 1.5 + env.rng() * 3.5, o: env.rng(), col: r < 0.35 ? "#fff3c4" : (r < 0.7 ? "#ff8a1f" : env.c1) }; });
    var smoke = arr(26, function () { return { x: (env.rng() - 0.5) * 0.3, o: env.rng(), r: 0.06 + env.rng() * 0.1, sp: 0.06 + env.rng() * 0.06 }; });
    var flows = arr(6, function (i) { return { s: i % 2 ? 1 : -1, k: 0.15 + env.rng() * 0.5, w: 0.6 + env.rng() * 0.8 }; });
    var ERUPT = 0.32;
    return function (ctx, t, w, h) {
      var p = t / env.dur, U = Math.min(w, h), cx = w / 2, topY = h * 0.5, cw = U * 0.07, et = Math.max(0, (p - ERUPT) * env.dur), heat = p < ERUPT ? p / ERUPT : 1;
      var rumble = p < ERUPT ? heat * 4 : Math.max(0, 7 - et * 3);
      ctx.save(); ctx.translate((Math.random() - 0.5) * rumble, (Math.random() - 0.5) * rumble);
      var sky = ctx.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, "#080204"); sky.addColorStop(1, withAlpha(env.c2, 0.55)); fill(ctx, w, h, sky);
      var glowc = ctx.createRadialGradient(cx, topY, 0, cx, topY, U * 0.8); glowc.addColorStop(0, "rgba(255,120,30," + (0.15 + 0.45 * heat) + ")"); glowc.addColorStop(1, "rgba(0,0,0,0)"); fill(ctx, w, h, glowc);
      smoke.forEach(function (sm) {
        var lp = (t * sm.sp + sm.o) % 1, y = topY - lp * h * 0.6, x = cx + (sm.x + lp * 0.25) * w * 0.5, rr = (sm.r + lp * 0.15) * U;
        var sg = ctx.createRadialGradient(x, y + rr * 0.3, 0, x, y, rr); sg.addColorStop(0, withAlpha(env.c1, 0.18 * (1 - lp) * heat)); sg.addColorStop(0.5, "rgba(35,22,26," + 0.5 * (1 - lp) + ")"); sg.addColorStop(1, "rgba(20,12,14,0)");
        ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(x, y, rr, 0, TAU); ctx.fill();
      });
      if (p >= ERUPT) {
        ctx.save(); ctx.globalCompositeOperation = "lighter";
        lava.forEach(function (q) {
          var age = (et * 0.45 + q.o) % 1, x = cx + q.vx * age * U * 0.9, y = topY - (q.vy * age - 1.25 * age * age) * U * 0.75;
          if (y > topY + U * 0.05) return;
          ctx.globalAlpha = 1 - age * 0.5; ctx.fillStyle = q.col; ctx.beginPath(); ctx.arc(x, y, q.s, 0, TAU); ctx.fill();
        });
        ctx.restore(); ctx.globalAlpha = 1;
      }
      var mg = ctx.createLinearGradient(0, topY, 0, h); mg.addColorStop(0, "#1c0e11"); mg.addColorStop(1, "#050203");
      ctx.fillStyle = mg; ctx.beginPath(); ctx.moveTo(cx - w * 0.65, h);
      ctx.quadraticCurveTo(cx - w * 0.16, h * 0.68, cx - cw, topY); ctx.lineTo(cx - cw * 0.5, topY + U * 0.015); ctx.lineTo(cx + cw * 0.5, topY + U * 0.015); ctx.lineTo(cx + cw, topY);
      ctx.quadraticCurveTo(cx + w * 0.16, h * 0.68, cx + w * 0.65, h); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "rgba(255,170,60," + (0.4 + 0.5 * heat) + ")"; ctx.beginPath(); ctx.ellipse(cx, topY + U * 0.008, cw * 0.85, U * 0.012, 0, 0, TAU); ctx.fill();
      if (p >= ERUPT) {
        ctx.lineCap = "round"; glow(ctx, "#ff7a1a", 16);
        flows.forEach(function (f) {
          var u = clamp01(et / 3 * f.w); if (u <= 0) return;
          ctx.strokeStyle = "rgba(255," + Math.round(110 + 60 * Math.sin(t * 3 + f.k * 9)) + ",30,.9)"; ctx.lineWidth = 3 + f.k * 4; ctx.beginPath(); ctx.moveTo(cx + f.s * cw * 0.6, topY + 4);
          for (var j = 1; j <= 12; j++) { var v = u * j / 12; ctx.lineTo(cx + f.s * (cw * 0.6 + v * w * 0.42 * f.k) + Math.sin(v * 9 + f.k * 5) * 6, topY + (h - topY) * Math.pow(v, 0.8) * 0.9); }
          ctx.stroke();
        });
        noglow(ctx);
        if (et < 0.35) flash(ctx, w, h, (0.35 - et) * 2.5, "#ffb347");
      }
      ctx.restore();
      fadeIn(ctx, t, w, h, 0.4);
    };
  } };

  /* Two dice tumble across the table and land on double six. */
  SCENES.dice = { titleAt: 0.62, oddsAt: 0.76, textY: 0.8, make: function (env) {
    var PIPS = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] };
    var dice = [{ from: -1, spin: 7 + env.rng() * 3, ph: env.rng() * 6 }, { from: 1, spin: 8 + env.rng() * 3, ph: env.rng() * 6 }];
    var sparks = arr(70, function () { return { a: env.rng() * TAU, s: 0.3 + env.rng() * 0.7, r: 1 + env.rng() * 2 }; });
    var LAND = 0.48;
    return function (ctx, t, w, h) {
      var p = t / env.dur, U = Math.min(w, h), floor = h * 0.55, S = U * 0.14;
      var bg = ctx.createRadialGradient(w / 2, floor, 0, w / 2, floor, Math.max(w, h) * 0.7); bg.addColorStop(0, withAlpha(env.c2, 0.6)); bg.addColorStop(1, "#050307"); fill(ctx, w, h, bg);
      ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.beginPath(); ctx.ellipse(w / 2, floor + S * 0.1, w * 0.45, S * 0.6, 0, 0, TAU); ctx.fill();
      dice.forEach(function (d, i) {
        var q = clamp01(p / LAND), e = ease(q), rolling = q < 1;
        var x = lerp(w / 2 + d.from * w * 0.75, w / 2 + d.from * S * 0.75, e), bounce = Math.abs(Math.sin(q * Math.PI * 3)) * (1 - q) * h * 0.3, y = floor - S / 2 - bounce;
        var ang = rolling ? (1 - e) * d.spin * -d.from : 0, flip = rolling ? Math.max(0.15, Math.abs(Math.cos((1 - e) * d.spin * 1.7 + d.ph))) : 1;
        var face = rolling ? 1 + Math.floor((t * 12 + i * 3) % 6) : 6;
        ctx.fillStyle = "rgba(0,0,0," + (0.4 - bounce / h) + ")"; ctx.beginPath(); ctx.ellipse(x, floor, S * 0.55, S * 0.12, 0, 0, TAU); ctx.fill();
        ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.scale(flip, 1);
        if (!rolling) glow(ctx, env.c1, 26 + 10 * Math.sin(t * 4));
        ctx.fillStyle = "#f8f7ff"; rrect(ctx, -S / 2, -S / 2, S, S, S * 0.18); ctx.fill(); noglow(ctx);
        ctx.strokeStyle = withAlpha(env.c1, 0.9); ctx.lineWidth = 3; ctx.stroke();
        ctx.fillStyle = rolling ? "#1b1426" : env.c1;
        PIPS[face].forEach(function (pp) { ctx.beginPath(); ctx.arc(pp[0] * S * 0.27, pp[1] * S * 0.27, S * 0.085, 0, TAU); ctx.fill(); });
        ctx.restore();
      });
      if (p >= LAND) {
        var lq = clamp01((p - LAND) / 0.3);
        ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.fillStyle = env.c1;
        sparks.forEach(function (sp) { var dd = sp.s * U * 0.5 * ease(lq); ctx.globalAlpha = 1 - lq; ctx.beginPath(); ctx.arc(w / 2 + Math.cos(sp.a) * dd, floor - S / 2 + Math.sin(sp.a) * dd * 0.6, sp.r, 0, TAU); ctx.fill(); });
        ctx.restore(); ctx.globalAlpha = 1;
        if (lq < 0.2) flash(ctx, w, h, (0.2 - lq) * 2.5, env.c1);
        var tag = "★ DOUBLE SIX ★", ts = fitFont(ctx, tag, "800", "Cinzel, serif", Math.round(U * 0.05), w * 0.9);
        label(ctx, tag, w / 2, floor - S * 1.35, ts, env.c1, "center", "800");
      }
      fadeIn(ctx, t, w, h, 0.3);
    };
  } };

  /* Crystals grow out of the ground and catch the light. */
  SCENES.crystals = { titleAt: 0.6, oddsAt: 0.75, textY: 0.22, make: function (env) {
    var cr = arr(17, function (i) { return { x: (env.rng() - 0.5) * 0.9, ang: (env.rng() - 0.5) * 0.9, len: 0.15 + env.rng() * 0.35, wid: 0.03 + env.rng() * 0.035, at: env.rng() * 0.35, col: env.colors[i % env.colors.length], ph: env.rng() * 6 }; }).sort(function (a, b) { return a.len - b.len; });
    return function (ctx, t, w, h) {
      var p = t / env.dur, U = Math.min(w, h), gy = h * 0.92;
      var bg = ctx.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, "#04030a"); bg.addColorStop(1, withAlpha(env.c2, 0.5)); fill(ctx, w, h, bg);
      if (p > 0.5) {
        ctx.save(); ctx.globalCompositeOperation = "lighter";
        var rq = clamp01((p - 0.5) / 0.15);
        for (var k = 0; k < 7; k++) { var ra = -Math.PI / 2 + (k - 3) * 0.2 + Math.sin(t * 0.4 + k) * 0.03, L = h; var rg = ctx.createLinearGradient(w / 2, gy, w / 2 + Math.cos(ra) * L, gy + Math.sin(ra) * L); rg.addColorStop(0, withAlpha(env.colors[k % env.colors.length], 0.25 * rq)); rg.addColorStop(1, "rgba(0,0,0,0)"); ctx.fillStyle = rg; ctx.beginPath(); ctx.moveTo(w / 2, gy); ctx.lineTo(w / 2 + Math.cos(ra - 0.05) * L, gy + Math.sin(ra - 0.05) * L); ctx.lineTo(w / 2 + Math.cos(ra + 0.05) * L, gy + Math.sin(ra + 0.05) * L); ctx.closePath(); ctx.fill(); }
        ctx.restore();
      }
      cr.forEach(function (c) {
        var q = ease(clamp01((p - c.at) / 0.25)); if (q <= 0) return;
        var L = c.len * U * 1.4 * q, W = c.wid * U * 1.4;
        ctx.save(); ctx.translate(w / 2 + c.x * w * 0.45, gy); ctx.rotate(c.ang * 0.7);
        var g = ctx.createLinearGradient(-W / 2, 0, W / 2, 0); g.addColorStop(0, withAlpha(c.col, 0.95)); g.addColorStop(0.5, "rgba(255,255,255,.55)"); g.addColorStop(1, withAlpha(c.col, 0.7));
        glow(ctx, c.col, 20); ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-W / 2, 0); ctx.lineTo(W / 2, 0); ctx.lineTo(W / 2, -L * 0.78); ctx.lineTo(0, -L); ctx.lineTo(-W / 2, -L * 0.78); ctx.closePath(); ctx.fill(); noglow(ctx);
        ctx.strokeStyle = "rgba(255,255,255,.6)"; ctx.lineWidth = 1; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -L); ctx.stroke();
        if (q >= 1) { var tw = 0.5 + 0.5 * Math.sin(t * 4 + c.ph), sz = 6 + tw * 8; ctx.strokeStyle = "rgba(255,255,255," + tw + ")"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-sz, -L); ctx.lineTo(sz, -L); ctx.moveTo(0, -L - sz); ctx.lineTo(0, -L + sz); ctx.stroke(); }
        ctx.restore();
      });
      ctx.fillStyle = "#050308"; ctx.fillRect(0, gy, w, h - gy);
      fadeIn(ctx, t, w, h, 0.4);
    };
  } };

  /* A cathedral window lights up pane by pane and casts coloured light. */
  SCENES.stainedglass = { titleAt: 0.62, oddsAt: 0.76, textY: 0.86, make: function (env) {
    var cols = 6, rows = 9, pts = [], cells = [], pal = env.colors.concat(["#fde68a", "#ffffff"]);
    for (var r = 0; r <= rows; r++) for (var c = 0; c <= cols; c++) pts.push([c / cols + (c > 0 && c < cols ? (env.rng() - 0.5) * 0.06 : 0), r / rows + (r > 0 && r < rows ? (env.rng() - 0.5) * 0.04 : 0)]);
    for (var rr = 0; rr < rows; rr++) for (var cc = 0; cc < cols; cc++) {
      var ids = [rr * (cols + 1) + cc, rr * (cols + 1) + cc + 1, (rr + 1) * (cols + 1) + cc + 1, (rr + 1) * (cols + 1) + cc];
      var mx = (cc + 0.5) / cols, my = (rr + 0.5) / rows;
      cells.push({ ids: ids, col: pal[Math.floor(env.rng() * pal.length)], at: 0.08 + Math.hypot(mx - 0.5, (1 - my) * 0.8) * 0.5 });
    }
    return function (ctx, t, w, h) {
      var p = t / env.dur, H = h * 0.68, W = Math.min(w * 0.62, H * 0.62), x0 = w / 2 - W / 2, y0 = h * 0.05, archH = W * 0.55;
      fill(ctx, w, h, "#07050c");
      function win() { ctx.beginPath(); ctx.moveTo(x0, y0 + H); ctx.lineTo(x0, y0 + archH); ctx.quadraticCurveTo(x0, y0 + archH * 0.15, x0 + W / 2, y0); ctx.quadraticCurveTo(x0 + W, y0 + archH * 0.15, x0 + W, y0 + archH); ctx.lineTo(x0 + W, y0 + H); ctx.closePath(); }
      if (p > 0.45) {
        var rq = clamp01((p - 0.45) / 0.2);
        ctx.save(); ctx.globalCompositeOperation = "lighter";
        for (var k = 0; k < 5; k++) { var sx = x0 + W * (0.15 + k * 0.18), col = pal[k % pal.length]; var g = ctx.createLinearGradient(sx, y0 + H * 0.4, sx + W * 0.4, h); g.addColorStop(0, withAlpha(col, 0.16 * rq)); g.addColorStop(1, withAlpha(col, 0)); ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(sx - W * 0.05, y0 + H * 0.4); ctx.lineTo(sx + W * 0.07, y0 + H * 0.4); ctx.lineTo(sx + W * 0.55, h); ctx.lineTo(sx + W * 0.25, h); ctx.closePath(); ctx.fill(); }
        ctx.restore();
      }
      ctx.save(); win(); ctx.fillStyle = "#0c0a14"; ctx.fill(); ctx.clip();
      cells.forEach(function (ce, i) {
        var lit = clamp01((p - ce.at) / 0.12);
        ctx.fillStyle = withAlpha(ce.col, 0.12 + 0.75 * lit * (0.85 + 0.15 * Math.sin(t * 2 + i)));
        ctx.beginPath(); ce.ids.forEach(function (id, n) { var P = pts[id], X = x0 + P[0] * W, Y = y0 + P[1] * H; if (n === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y); }); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = "#0a0a0a"; ctx.lineWidth = Math.max(3, W * 0.012); ctx.stroke();
      });
      ctx.restore();
      ctx.strokeStyle = "#2a2433"; ctx.lineWidth = Math.max(6, W * 0.04); win(); ctx.stroke();
      if (p > 0.6 && p < 0.66) flash(ctx, w, h, (0.66 - p) * 4, env.c1);
      fadeIn(ctx, t, w, h, 0.4);
    };
  } };

  /* Circuit traces race in from the edges and power up a chip. */
  SCENES.circuit = { titleAt: 0.6, oddsAt: 0.75, textY: 0.82, make: function (env) {
    var seeds = arr(28, function () { return [env.rng(), env.rng(), env.rng(), env.rng()]; }), traces = null, key = "";
    function build(w, h) {
      var cx = w / 2, cy = h * 0.4, cs = Math.min(w, h) * 0.09;
      traces = seeds.map(function (sd, i) {
        var side = i % 4, k = Math.floor(i / 4), off = ((k + 0.5) / 7 - 0.5) * cs * 1.8, pin, start, mid, corner, d;
        if (side === 0) { pin = [cx - cs, cy + off]; start = [0, sd[0] * h]; mid = [lerp(0, pin[0], 0.2 + sd[1] * 0.4), start[1]]; d = Math.abs(pin[1] - mid[1]); if (mid[0] + d > pin[0] - 12) mid[0] = pin[0] - 12 - d; corner = [mid[0] + d, pin[1]]; }
        else if (side === 1) { pin = [cx + cs, cy + off]; start = [w, sd[0] * h]; mid = [lerp(w, pin[0], 0.2 + sd[1] * 0.4), start[1]]; d = Math.abs(pin[1] - mid[1]); if (mid[0] - d < pin[0] + 12) mid[0] = pin[0] + 12 + d; corner = [mid[0] - d, pin[1]]; }
        else if (side === 2) { pin = [cx + off, cy - cs]; start = [sd[0] * w, 0]; mid = [start[0], lerp(0, pin[1], 0.2 + sd[1] * 0.4)]; d = Math.abs(pin[0] - mid[0]); if (mid[1] + d > pin[1] - 12) mid[1] = pin[1] - 12 - d; corner = [pin[0], mid[1] + d]; }
        else { pin = [cx + off, cy + cs]; start = [sd[0] * w, h]; mid = [start[0], lerp(h, pin[1], 0.2 + sd[1] * 0.4)]; d = Math.abs(pin[0] - mid[0]); if (mid[1] - d < pin[1] + 12) mid[1] = pin[1] + 12 + d; corner = [pin[0], mid[1] - d]; }
        var pts = [start, mid, corner, pin], segs = [], len = 0;
        for (var j = 1; j < pts.length; j++) { var l = Math.hypot(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1]); segs.push(l); len += l; }
        return { pts: pts, segs: segs, len: len, at: 0.04 + sd[2] * 0.3, pulse: sd[3] };
      });
    }
    function pathTo(tr, dist) {
      ctx_moveTo(tr.pts[0]); var left = dist;
      for (var j = 0; j < tr.segs.length; j++) { var A = tr.pts[j], B = tr.pts[j + 1], f = Math.min(1, left / (tr.segs[j] || 1)); ctx_lineTo([lerp(A[0], B[0], f), lerp(A[1], B[1], f)]); left -= tr.segs[j]; if (left <= 0) return [lerp(A[0], B[0], f), lerp(A[1], B[1], f)]; }
      return tr.pts[tr.pts.length - 1];
    }
    var ctx_moveTo, ctx_lineTo;
    return function (ctx, t, w, h) {
      if (key !== w + "x" + h) { build(w, h); key = w + "x" + h; }
      ctx_moveTo = function (P) { ctx.moveTo(P[0], P[1]); }; ctx_lineTo = function (P) { ctx.lineTo(P[0], P[1]); };
      var p = t / env.dur, U = Math.min(w, h), cx = w / 2, cy = h * 0.4, cs = U * 0.09, done = clamp01((p - 0.48) / 0.1);
      fill(ctx, w, h, "#020806");
      ctx.fillStyle = withAlpha(env.c1, 0.08); for (var gx = 12; gx < w; gx += 26) for (var gy = 12; gy < h; gy += 26) ctx.fillRect(gx, gy, 2, 2);
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      traces.forEach(function (tr) {
        var q = clamp01((p - tr.at) / 0.28); if (q <= 0) return;
        ctx.strokeStyle = withAlpha(env.c1, 0.45); ctx.lineWidth = 3; ctx.beginPath(); var head = pathTo(tr, tr.len * q); ctx.stroke();
        ctx.fillStyle = withAlpha(env.c1, 0.7); ctx.beginPath(); ctx.arc(tr.pts[0][0], tr.pts[0][1], 4, 0, TAU); ctx.fill();
        if (q < 1) { glow(ctx, "#fff", 12); ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(head[0], head[1], 4, 0, TAU); ctx.fill(); noglow(ctx); }
        else for (var k = 0; k < 2; k++) {
          var dd = ((t * 0.35 + tr.pulse + k * 0.5) % 1) * tr.len; ctx.beginPath(); var P = pathTo(tr, dd);
          glow(ctx, env.c1, 14); ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(P[0], P[1], 3.5, 0, TAU); ctx.fill(); noglow(ctx);
        }
      });
      ctx.fillStyle = "#0d1110"; glow(ctx, env.c1, 30 * done); ctx.fillRect(cx - cs, cy - cs, cs * 2, cs * 2); noglow(ctx);
      ctx.strokeStyle = withAlpha(env.c1, 0.4 + 0.6 * done); ctx.lineWidth = 2; ctx.strokeRect(cx - cs, cy - cs, cs * 2, cs * 2);
      ctx.fillStyle = withAlpha(env.c1, 0.7);
      for (var k2 = 0; k2 < 7; k2++) { var o = ((k2 + 0.5) / 7 - 0.5) * cs * 1.8; ctx.fillRect(cx - cs - 6, cy + o - 2, 6, 4); ctx.fillRect(cx + cs, cy + o - 2, 6, 4); ctx.fillRect(cx + o - 2, cy - cs - 6, 4, 6); ctx.fillRect(cx + o - 2, cy + cs, 4, 6); }
      if (done > 0) { var cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, cs * 1.2); cg.addColorStop(0, withAlpha(env.c1, 0.6 * done * (0.8 + 0.2 * Math.sin(t * 6)))); cg.addColorStop(1, withAlpha(env.c1, 0)); ctx.fillStyle = cg; ctx.fillRect(cx - cs, cy - cs, cs * 2, cs * 2); }
      var chipLabel = "AURA·" + String(env.aura.id).padStart(3, "0"), cl = fitFont(ctx, chipLabel, "700", "ui-monospace, monospace", Math.round(cs * 0.28), cs * 1.7);
      label(ctx, chipLabel, cx, cy + cl * 0.35, cl, "rgba(255,255,255,.8)", "center", "700");
      if (p > 0.5 && p < 0.56) flash(ctx, w, h, (0.56 - p) * 6, env.c1);
      fadeIn(ctx, t, w, h, 0.3);
    };
  } };

  /* A neon sign buzzes to life on a brick wall, framing the name. */
  SCENES.neon = { titleAt: 0.55, oddsAt: 0.7, textY: 0.5, make: function (env) {
    var tubes = [{ on: 0.06, seed: 1.3 }, { on: 0.14, seed: 2.7 }, { on: 0.22, seed: 4.1 }, { on: 0.3, seed: 5.9 }, { on: 0.38, seed: 7.3 }];
    var bricks = arr(400, function () { return 0.85 + env.rng() * 0.3; });
    function lit(tb, p, t) { var dt = p - tb.on; if (dt < 0) return 0; if (dt > 0.09) return 1; return Math.sin(t * 57 + tb.seed * 7) * Math.sin(t * 31 + tb.seed) > 0.05 ? 1 : 0.12; }
    return function (ctx, t, w, h) {
      var p = t / env.dur, U = Math.min(w, h), cx = w / 2, cy = h / 2, R = U * 0.4, bh = 26, bw = 64, n = 0;
      fill(ctx, w, h, "#07040a");
      for (var y = 0, row = 0; y < h; y += bh, row++) for (var x = (row % 2) * -bw / 2; x < w; x += bw) { var v = bricks[n++ % bricks.length]; ctx.fillStyle = "rgb(" + Math.round(26 * v) + "," + Math.round(15 * v) + "," + Math.round(19 * v) + ")"; ctx.fillRect(x + 2, y + 2, bw - 4, bh - 4); }
      var total = tubes.reduce(function (a, tb) { return a + lit(tb, p, t); }, 0) / tubes.length;
      var spill = ctx.createRadialGradient(cx, cy, 0, cx, cy, U * 0.8); spill.addColorStop(0, withAlpha(env.c1, 0.3 * total)); spill.addColorStop(1, "rgba(0,0,0,0)"); fill(ctx, w, h, spill);
      function tube(tb, color, width, path) {
        var a = lit(tb, p, t); ctx.lineCap = "round";
        if (a < 0.5) { ctx.strokeStyle = "rgba(255,255,255,.07)"; ctx.lineWidth = width; path(); ctx.stroke(); if (a <= 0) return; }
        ctx.globalAlpha = a; glow(ctx, color, 28); ctx.strokeStyle = color; ctx.lineWidth = width; path(); ctx.stroke(); noglow(ctx);
        ctx.strokeStyle = "rgba(255,255,255,.85)"; ctx.lineWidth = width * 0.35; path(); ctx.stroke(); ctx.globalAlpha = 1;
      }
      var c2 = env.colors[1 % env.colors.length], c3 = env.colors[2 % env.colors.length];
      tube(tubes[0], env.c1, 8, function () { ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); });
      ctx.setLineDash([R * 0.18, R * 0.08]); ctx.lineDashOffset = -t * 40;
      tube(tubes[1], c2, 4, function () { ctx.beginPath(); ctx.arc(cx, cy, R * 0.88, 0, TAU); });
      ctx.setLineDash([]);
      tube(tubes[2], c3, 5, function () { ctx.beginPath(); ctx.moveTo(cx - R * 0.72, cy - R * 0.36); ctx.lineTo(cx + R * 0.72, cy - R * 0.36); ctx.moveTo(cx - R * 0.72, cy + R * 0.36); ctx.lineTo(cx + R * 0.72, cy + R * 0.36); });
      tube(tubes[3], env.c1, 5, function () { ctx.beginPath(); [-1, 1].forEach(function (sd) { var bx = cx + sd * R * 1.18; ctx.moveTo(bx - sd * R * 0.08, cy - R * 0.14); ctx.lineTo(bx, cy); ctx.lineTo(bx - sd * R * 0.08, cy + R * 0.14); }); });
      tube(tubes[4], "#ffffff", 3, function () { ctx.beginPath(); [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]].forEach(function (s) { var sx = cx + s[0] * R, sy = cy + s[1] * R * 0.85, z = R * 0.07; ctx.moveTo(sx - z, sy); ctx.lineTo(sx + z, sy); ctx.moveTo(sx, sy - z); ctx.lineTo(sx, sy + z); }); });
      fadeIn(ctx, t, w, h, 0.3);
    };
  } };

  /* Deep water: light shafts, rising bubbles, and one big bubble that bursts. */
  SCENES.underwater = { titleAt: 0.56, oddsAt: 0.7, textY: 0.5, make: function (env) {
    var bubbles = arr(90, function () { return { x: env.rng(), o: env.rng(), r: 2 + env.rng() * 7, sp: 0.06 + env.rng() * 0.1, ph: env.rng() * 6 }; });
    var shafts = arr(6, function () { return { x: env.rng(), w: 0.05 + env.rng() * 0.08, ph: env.rng() * 6 }; });
    var snow = arr(110, function () { return { x: env.rng(), y: env.rng(), s: 0.5 + env.rng() * 1.5, ph: env.rng() * 6 }; });
    var drops = arr(24, function (i) { return { a: i / 24 * TAU + env.rng() * 0.2, s: 0.5 + env.rng() * 0.5 }; });
    return function (ctx, t, w, h) {
      var p = t / env.dur, U = Math.min(w, h);
      var g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, withAlpha(env.c1, 0.55)); g.addColorStop(0.45, withAlpha(env.c2, 0.6)); g.addColorStop(1, "#00030a"); fill(ctx, w, h, "#000"); fill(ctx, w, h, g);
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      shafts.forEach(function (s) { var x = s.x * w + Math.sin(t * 0.4 + s.ph) * 30, sw = s.w * w; var sg = ctx.createLinearGradient(0, 0, 0, h); sg.addColorStop(0, "rgba(255,255,255,.16)"); sg.addColorStop(1, "rgba(255,255,255,0)"); ctx.fillStyle = sg; ctx.beginPath(); ctx.moveTo(x - sw / 2, 0); ctx.lineTo(x + sw / 2, 0); ctx.lineTo(x + sw * 1.6 + h * 0.25, h); ctx.lineTo(x - sw * 0.2 + h * 0.25, h); ctx.closePath(); ctx.fill(); });
      ctx.restore();
      ctx.strokeStyle = "rgba(255,255,255,.07)"; ctx.lineWidth = 2;
      for (var k = 0; k < 12; k++) { ctx.beginPath(); for (var x = 0; x <= w; x += 14) { var y = h * 0.03 + k * h * 0.012 + Math.sin(x * 0.02 + t * 2 + k) * 6; if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); } ctx.stroke(); }
      ctx.fillStyle = "rgba(255,255,255,.45)"; snow.forEach(function (s) { ctx.fillRect(((s.x + Math.sin(t * 0.3 + s.ph) * 0.01) % 1) * w, ((s.y + t * 0.01) % 1) * h, s.s, s.s); });
      bubbles.forEach(function (b) { var y = h * (1.05 - ((t * b.sp + b.o) % 1.1)), x = b.x * w + Math.sin(t * 2 + b.ph) * 8; ctx.strokeStyle = "rgba(255,255,255,.5)"; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(x, y, b.r, 0, TAU); ctx.stroke(); ctx.fillStyle = "rgba(255,255,255,.55)"; ctx.beginPath(); ctx.arc(x - b.r * 0.35, y - b.r * 0.35, b.r * 0.25, 0, TAU); ctx.fill(); });
      var POP = 0.5;
      if (p < POP) {
        var q = ease(p / POP), by = lerp(h * 1.15, h * 0.5, q), br = U * 0.09 * (0.6 + 0.4 * q) * (1 + 0.05 * Math.sin(t * 7));
        var bgr = ctx.createRadialGradient(w / 2 - br * 0.3, by - br * 0.3, 0, w / 2, by, br); bgr.addColorStop(0, "rgba(255,255,255,.35)"); bgr.addColorStop(0.8, withAlpha(env.c1, 0.15)); bgr.addColorStop(1, withAlpha(env.c1, 0.5));
        ctx.fillStyle = bgr; ctx.beginPath(); ctx.arc(w / 2, by, br, 0, TAU); ctx.fill(); ctx.strokeStyle = "rgba(255,255,255,.75)"; ctx.lineWidth = 2; ctx.stroke();
      } else {
        var rp = clamp01((p - POP) / 0.15);
        ctx.strokeStyle = withAlpha(env.c1, 1 - rp); ctx.lineWidth = 4 * (1 - rp); ctx.beginPath(); ctx.arc(w / 2, h * 0.5, U * 0.09 + rp * U * 0.5, 0, TAU); ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255," + (1 - rp) + ")"; drops.forEach(function (d) { var dd = U * 0.09 + d.s * rp * U * 0.4; ctx.beginPath(); ctx.arc(w / 2 + Math.cos(d.a) * dd, h * 0.5 + Math.sin(d.a) * dd, 3, 0, TAU); ctx.fill(); });
        if (rp < 0.3) flash(ctx, w, h, (0.3 - rp) * 1.5, env.c1);
      }
      fadeIn(ctx, t, w, h, 0.4);
    };
  } };

  /* Fireflies wander a dark forest, then gather into a glowing ring. */
  SCENES.fireflies = { titleAt: 0.62, oddsAt: 0.76, textY: 0.5, make: function (env) {
    var flies = arr(130, function (i) { return { x: env.rng(), y: 0.3 + env.rng() * 0.6, ph: env.rng() * 6, sp: 0.3 + env.rng() * 0.6, ring: i / 130, col: env.rng() < 0.6 ? "#d9f99d" : env.colors[i % env.colors.length] }; });
    var trees = arr(14, function (i) { return { x: i < 7 ? env.rng() * 0.28 : 0.72 + env.rng() * 0.28, hgt: 0.45 + env.rng() * 0.4, wid: 0.012 + env.rng() * 0.02, crown: 0.08 + env.rng() * 0.07 }; });
    return function (ctx, t, w, h) {
      var p = t / env.dur, U = Math.min(w, h), cx = w / 2, cy = h / 2, g = ease(clamp01((p - 0.35) / 0.3));
      var bg = ctx.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, "#01030a"); bg.addColorStop(1, withAlpha(env.c2, 0.45)); fill(ctx, w, h, bg);
      ctx.fillStyle = "rgba(255,255,240,.8)"; ctx.beginPath(); ctx.arc(w * 0.16, h * 0.14, U * 0.035, 0, TAU); ctx.fill();
      ctx.fillStyle = "#020405";
      trees.forEach(function (tr) { var x = tr.x * w, top = h * (1 - tr.hgt); ctx.fillRect(x - tr.wid * w / 2, top, tr.wid * w, h - top); for (var k = 0; k < 4; k++) { ctx.beginPath(); ctx.arc(x + (k - 1.5) * tr.crown * U * 0.4, top + k * tr.crown * U * 0.3, tr.crown * U * (0.9 - k * 0.1), 0, TAU); ctx.fill(); } });
      ctx.fillRect(0, h * 0.93, w, h * 0.07);
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      flies.forEach(function (f) {
        var wx = (f.x + Math.sin(t * f.sp + f.ph) * 0.03 + Math.sin(t * f.sp * 0.37 + f.ph * 2) * 0.05) * w, wy = (f.y + Math.cos(t * f.sp * 0.8 + f.ph) * 0.03) * h;
        var an = f.ring * TAU + t * 0.25, rx = cx + Math.cos(an) * U * 0.42 * (1 + 0.05 * Math.sin(t * 3 + f.ph)), ry = cy + Math.sin(an) * U * 0.26;
        var x = lerp(wx, rx, g), y = lerp(wy, ry, g), b = 0.25 + 0.75 * Math.pow(Math.max(0, Math.sin(t * 2.2 + f.ph * 3)), 3); b = lerp(b, 0.9, g * 0.6);
        var hg = ctx.createRadialGradient(x, y, 0, x, y, 12 * b + 1); hg.addColorStop(0, withAlpha(f.col, 0.6 * b)); hg.addColorStop(1, withAlpha(f.col, 0)); ctx.fillStyle = hg; ctx.fillRect(x - 13, y - 13, 26, 26);
        ctx.fillStyle = withAlpha("#ffffff", b); ctx.beginPath(); ctx.arc(x, y, 1.6, 0, TAU); ctx.fill();
      });
      ctx.restore();
      fadeIn(ctx, t, w, h, 0.5);
    };
  } };

  /* A close-up of a sun: boiling surface, looping prominences, then a flare. */
  SCENES.sun = { titleAt: 0.6, oddsAt: 0.74, textY: 0.86, make: function (env) {
    var gran = arr(70, function () { var a = env.rng() * TAU, r = Math.sqrt(env.rng()); return { x: Math.cos(a) * r, y: Math.sin(a) * r, s: 0.05 + env.rng() * 0.08, ph: env.rng() * 6, dark: env.rng() < 0.5 }; });
    var proms = arr(6, function (i) { return { a: i / 6 * TAU + env.rng() * 0.6, size: 0.25 + env.rng() * 0.3, ph: env.rng() * 6 }; });
    var rays = arr(48, function () { return { l: 0.2 + env.rng() * 0.5, ph: env.rng() * 6 }; });
    var ejecta = arr(60, function () { return { a: (env.rng() - 0.5) * 0.9, s: 0.4 + env.rng() * 0.6, r: 1 + env.rng() * 2.5 }; });
    return function (ctx, t, w, h) {
      var p = t / env.dur, U = Math.min(w, h), cx = w / 2, cy = h * 0.42, R = U * 0.26 * (0.7 + 0.3 * ease(clamp01(p / 0.4)));
      var fq = clamp01((p - 0.55) / 0.08), flare = fq * Math.max(0, 1 - Math.max(0, p - 0.65) * 1.5);
      fill(ctx, w, h, "#050102");
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      rays.forEach(function (r, i) { var a = i / rays.length * TAU + t * 0.05, L = R * (1.1 + r.l * (0.6 + 0.4 * Math.sin(t * 1.5 + r.ph)) * (1 + flare)); var rg = ctx.createLinearGradient(cx, cy, cx + Math.cos(a) * L, cy + Math.sin(a) * L); rg.addColorStop(0.6, withAlpha(env.c1, 0.35)); rg.addColorStop(1, withAlpha(env.c1, 0)); ctx.fillStyle = rg; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a - 0.03) * L, cy + Math.sin(a - 0.03) * L); ctx.lineTo(cx + Math.cos(a + 0.03) * L, cy + Math.sin(a + 0.03) * L); ctx.closePath(); ctx.fill(); });
      var halo = ctx.createRadialGradient(cx, cy, R * 0.9, cx, cy, R * 2.4); halo.addColorStop(0, withAlpha(env.c1, 0.5)); halo.addColorStop(1, withAlpha(env.c1, 0)); ctx.fillStyle = halo; ctx.fillRect(0, 0, w, h);
      proms.forEach(function (pr) {
        var a = pr.a + t * 0.03, hgt = R * pr.size * (0.6 + 0.4 * Math.sin(t + pr.ph)) * (1 + flare * 0.8);
        var f1 = [cx + Math.cos(a - 0.12) * R, cy + Math.sin(a - 0.12) * R], f2 = [cx + Math.cos(a + 0.12) * R, cy + Math.sin(a + 0.12) * R];
        var c1 = [cx + Math.cos(a - 0.2) * (R + hgt * 1.4), cy + Math.sin(a - 0.2) * (R + hgt * 1.4)], c2p = [cx + Math.cos(a + 0.2) * (R + hgt * 1.4), cy + Math.sin(a + 0.2) * (R + hgt * 1.4)];
        glow(ctx, env.c1, 20); ctx.strokeStyle = withAlpha(env.c1, 0.8); ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(f1[0], f1[1]); ctx.bezierCurveTo(c1[0], c1[1], c2p[0], c2p[1], f2[0], f2[1]); ctx.stroke(); noglow(ctx);
        ctx.strokeStyle = "rgba(255,240,220,.6)"; ctx.lineWidth = 2; ctx.stroke();
      });
      ctx.restore();
      var body = ctx.createRadialGradient(cx - R * 0.2, cy - R * 0.2, 0, cx, cy, R); body.addColorStop(0, "#fffbe6"); body.addColorStop(0.6, env.c1); body.addColorStop(1, env.c2);
      ctx.fillStyle = body; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();
      ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.clip();
      gran.forEach(function (gr) { var x = cx + gr.x * R + Math.sin(t * 0.6 + gr.ph) * 4, y = cy + gr.y * R + Math.cos(t * 0.5 + gr.ph) * 4; ctx.fillStyle = gr.dark ? "rgba(0,0,0,.12)" : "rgba(255,255,255,.14)"; ctx.beginPath(); ctx.arc(x, y, gr.s * R * (1 + 0.2 * Math.sin(t * 2 + gr.ph)), 0, TAU); ctx.fill(); });
      ctx.restore();
      if (fq > 0) {
        var ea = proms[0].a + t * 0.03, eq = clamp01((p - 0.55) / 0.3);
        ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.fillStyle = "#fff3c4";
        ejecta.forEach(function (e) { var a = ea + e.a, d = R + e.s * U * 0.6 * ease(eq); ctx.globalAlpha = 1 - eq; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, e.r, 0, TAU); ctx.fill(); });
        ctx.restore(); ctx.globalAlpha = 1;
        if (p < 0.61) flash(ctx, w, h, (0.61 - p) * 8, "#fff3c4");
      }
      fadeIn(ctx, t, w, h, 0.4);
    };
  } };

  /* A comet streaks in with a long glowing tail. */
  SCENES.comet = { titleAt: 0.6, oddsAt: 0.75, textY: 0.74, make: function (env) {
    var stars = arr(180, function () { return { x: env.rng(), y: env.rng(), s: 0.5 + env.rng() * 1.4, ph: env.rng() * 6 }; });
    var debris = arr(90, function () { return { o: env.rng(), off: env.rng() - 0.5, s: 0.8 + env.rng() * 2 }; });
    return function (ctx, t, w, h) {
      var p = t / env.dur, U = Math.min(w, h), q = ease(clamp01(p / 0.6));
      fill(ctx, w, h, "#010108");
      var neb = ctx.createRadialGradient(w * 0.3, h * 0.3, 0, w * 0.3, h * 0.3, Math.max(w, h) * 0.6); neb.addColorStop(0, withAlpha(env.c2, 0.35)); neb.addColorStop(1, "rgba(0,0,0,0)"); fill(ctx, w, h, neb);
      ctx.fillStyle = "#fff"; stars.forEach(function (s) { ctx.globalAlpha = 0.3 + 0.4 * Math.abs(Math.sin(t + s.ph)); ctx.fillRect(s.x * w, s.y * h, s.s, s.s); }); ctx.globalAlpha = 1;
      var hx = lerp(-0.1 * w, w * 0.62, q), hy = lerp(h * 0.06, h * 0.36, q) + Math.sin(q * Math.PI) * h * 0.04;
      var dx = w * 0.72, dy = h * 0.3, dl = Math.hypot(dx, dy), ux = dx / dl, uy = dy / dl, px = -uy, py = ux, L = U * (0.95 + 0.25 * Math.sin(t * 0.8));
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      var dg = ctx.createLinearGradient(hx, hy, hx - ux * L, hy - uy * L); dg.addColorStop(0, withAlpha(env.c1, 0.65)); dg.addColorStop(1, withAlpha(env.c1, 0));
      ctx.fillStyle = dg; ctx.beginPath(); ctx.moveTo(hx + px * 6, hy + py * 6); ctx.quadraticCurveTo(hx - ux * L * 0.5 + px * L * 0.12, hy - uy * L * 0.5 + py * L * 0.12, hx - ux * L + px * L * 0.24, hy - uy * L + py * L * 0.24); ctx.lineTo(hx - ux * L - px * L * 0.06, hy - uy * L - py * L * 0.06); ctx.lineTo(hx - px * 6, hy - py * 6); ctx.closePath(); ctx.fill();
      var ion = env.colors[1 % env.colors.length], ig = ctx.createLinearGradient(hx, hy, hx - ux * L * 1.2, hy - uy * L * 0.6); ig.addColorStop(0, withAlpha(ion, 0.8)); ig.addColorStop(1, withAlpha(ion, 0));
      ctx.strokeStyle = ig; ctx.lineWidth = 3; glow(ctx, ion, 14); ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx - ux * L * 1.2, hy - uy * L * 0.6); ctx.stroke(); noglow(ctx);
      debris.forEach(function (d) { var k = (d.o + t * 0.15) % 1, x = hx - ux * k * L + px * d.off * k * L * 0.3, y = hy - uy * k * L + py * d.off * k * L * 0.3; ctx.globalAlpha = 1 - k; ctx.fillStyle = k < 0.3 ? "#fff" : env.c1; ctx.beginPath(); ctx.arc(x, y, d.s * (1 - k * 0.5), 0, TAU); ctx.fill(); });
      ctx.globalAlpha = 1;
      var pulse = p > 0.6 ? 1 + 0.15 * Math.sin(t * 5) : 1, coma = ctx.createRadialGradient(hx, hy, 0, hx, hy, U * 0.07 * pulse); coma.addColorStop(0, "rgba(255,255,255,1)"); coma.addColorStop(0.2, withAlpha(env.c1, 0.8)); coma.addColorStop(1, withAlpha(env.c1, 0));
      ctx.fillStyle = coma; ctx.fillRect(hx - U * 0.08, hy - U * 0.08, U * 0.16, U * 0.16);
      ctx.restore();
      if (p > 0.58 && p < 0.64) flash(ctx, w, h, (0.64 - p) * 5, env.c1);
      fadeIn(ctx, t, w, h, 0.4);
    };
  } };

  /* Spirograph curves draw themselves in the aura's colours. */
  SCENES.spirograph = { titleAt: 0.6, oddsAt: 0.75, textY: 0.5, make: function (env) {
    var curves = [[7, 3, 5], [9, 4, 6], [11, 5, 7]].map(function (c, i) {
      var R = c[0], r = c[1], d = c[2], N = 900, pts = [];
      for (var k = 0; k <= N; k++) { var th = k / N * TAU * r; pts.push([((R - r) * Math.cos(th) + d * Math.cos((R - r) / r * th)) / (R - r + d), ((R - r) * Math.sin(th) - d * Math.sin((R - r) / r * th)) / (R - r + d)]); }
      return { pts: pts, at: i * 0.12, col: env.colors[i % env.colors.length], rot: env.rng() * TAU, dir: i % 2 ? 1 : -1 };
    });
    return function (ctx, t, w, h) {
      var p = t / env.dur, U = Math.min(w, h), cx = w / 2, cy = h / 2;
      fill(ctx, w, h, "#04030a");
      var bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, U * 0.6); bg.addColorStop(0, withAlpha(env.c2, 0.35)); bg.addColorStop(1, "rgba(0,0,0,0)"); fill(ctx, w, h, bg);
      curves.forEach(function (c, i) {
        var q = clamp01((p - c.at) / 0.45), n = Math.floor(q * (c.pts.length - 1)); if (n < 2) return;
        var S = U * (0.44 - i * 0.07);
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(c.rot + t * 0.08 * c.dir);
        ctx.strokeStyle = c.col; ctx.lineWidth = 1.6; ctx.globalAlpha = 0.85; glow(ctx, c.col, 10);
        ctx.beginPath(); for (var k = 0; k <= n; k++) { var P = c.pts[k]; if (k === 0) ctx.moveTo(P[0] * S, P[1] * S); else ctx.lineTo(P[0] * S, P[1] * S); } ctx.stroke(); noglow(ctx);
        if (q < 1) { ctx.globalAlpha = 1; glow(ctx, "#fff", 14); ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(c.pts[n][0] * S, c.pts[n][1] * S, 4, 0, TAU); ctx.fill(); noglow(ctx); }
        ctx.restore();
      });
      ctx.globalAlpha = 1;
      var dk = ctx.createRadialGradient(cx, cy, 0, cx, cy, U * 0.3); dk.addColorStop(0, "rgba(0,0,0," + 0.6 * clamp01((p - 0.55) * 4) + ")"); dk.addColorStop(1, "rgba(0,0,0,0)"); fill(ctx, w, h, dk);
      fadeIn(ctx, t, w, h, 0.3);
    };
  } };

  /* A row of pendulums swings in and out of a travelling wave. */
  SCENES.pendulums = { titleAt: 0.6, oddsAt: 0.75, textY: 0.82, make: function (env) {
    var N = 15, T = 12;
    return function (ctx, t, w, h) {
      var p = t / env.dur, U = Math.min(w, h), top = h * 0.08, span = Math.min(w * 0.84, U * 1.3), x0 = w / 2 - span / 2, amp = 0.5 * ease(clamp01(p / 0.15)), maxL = h * 0.58;
      var bg = ctx.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, "#05040c"); bg.addColorStop(1, withAlpha(env.c2, 0.45)); fill(ctx, w, h, bg);
      ctx.strokeStyle = env.c1; ctx.lineWidth = 6; ctx.lineCap = "round"; glow(ctx, env.c1, 12); ctx.beginPath(); ctx.moveTo(x0 - 24, top); ctx.lineTo(x0 + span + 24, top); ctx.stroke(); noglow(ctx);
      var bobs = [];
      for (var i = 0; i < N; i++) {
        var period = T / (22 + i), L = maxL * Math.pow(period / (T / 22), 2), th = amp * Math.cos(TAU * t / period), ax = x0 + span * i / (N - 1);
        var bx = ax + Math.sin(th) * L, by = top + Math.cos(th) * L; bobs.push([bx, by]);
        ctx.strokeStyle = "rgba(255,255,255,.3)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(ax, top); ctx.lineTo(bx, by); ctx.stroke();
      }
      if (p > 0.5) {
        ctx.strokeStyle = withAlpha(env.c1, 0.6 * clamp01((p - 0.5) * 5)); ctx.lineWidth = 2; glow(ctx, env.c1, 14); ctx.beginPath();
        bobs.forEach(function (b, i) { if (i === 0) ctx.moveTo(b[0], b[1]); else { var pr = bobs[i - 1]; ctx.quadraticCurveTo(pr[0], pr[1], (pr[0] + b[0]) / 2, (pr[1] + b[1]) / 2); } });
        ctx.stroke(); noglow(ctx);
      }
      bobs.forEach(function (b, i) { var col = env.colors[i % env.colors.length], r = U * 0.022; var bg2 = ctx.createRadialGradient(b[0] - r * 0.3, b[1] - r * 0.3, 0, b[0], b[1], r); bg2.addColorStop(0, "#fff"); bg2.addColorStop(1, col); glow(ctx, col, 16); ctx.fillStyle = bg2; ctx.beginPath(); ctx.arc(b[0], b[1], r, 0, TAU); ctx.fill(); noglow(ctx); });
      fadeIn(ctx, t, w, h, 0.3);
    };
  } };

  /* Inside a lava lamp: glowing blobs rise, merge and sink. */
  SCENES.lavalamp = { titleAt: 0.55, oddsAt: 0.7, textY: 0.5, make: function (env) {
    var blobs = arr(14, function (i) { return { x: 0.12 + env.rng() * 0.76, ph: env.rng() * TAU, sp: 0.25 + env.rng() * 0.35, r: 0.06 + env.rng() * 0.08, col: env.colors[i % env.colors.length] }; });
    return function (ctx, t, w, h) {
      var p = t / env.dur, U = Math.min(w, h), heat = ease(clamp01(p / 0.4));
      var bg = ctx.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, "#06030a"); bg.addColorStop(1, withAlpha(env.c2, 0.7)); fill(ctx, w, h, bg);
      var hg = ctx.createRadialGradient(w / 2, h * 1.1, 0, w / 2, h * 1.1, h * 0.8); hg.addColorStop(0, withAlpha(env.c1, 0.5 * heat)); hg.addColorStop(1, "rgba(0,0,0,0)"); fill(ctx, w, h, hg);
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      blobs.forEach(function (b) {
        var y = h * (0.86 - heat * (0.36 + 0.38 * Math.sin(t * b.sp + b.ph))), x = w * (b.x + 0.04 * Math.sin(t * 0.5 + b.ph)), r = U * b.r * (1 + 0.15 * Math.sin(t * 1.3 + b.ph)), stretch = 1.1 + 0.25 * Math.sin(t * b.sp * 2 + b.ph);
        var g = ctx.createRadialGradient(x, y, 0, x, y, r * 1.3); g.addColorStop(0, withAlpha(b.col, 0.95)); g.addColorStop(0.55, withAlpha(b.col, 0.6)); g.addColorStop(1, withAlpha(b.col, 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, r * 1.3, r * 1.3 * stretch, 0, 0, TAU); ctx.fill();
      });
      ctx.restore();
      [0.07, 0.93].forEach(function (fx) { var sg = ctx.createLinearGradient(w * fx - 20, 0, w * fx + 20, 0); sg.addColorStop(0, "rgba(255,255,255,0)"); sg.addColorStop(0.5, "rgba(255,255,255,.07)"); sg.addColorStop(1, "rgba(255,255,255,0)"); ctx.fillStyle = sg; ctx.fillRect(w * fx - 20, 0, 40, h); });
      fadeIn(ctx, t, w, h, 0.4);
    };
  } };

  /* Jellyfish pulse upward through dark water. */
  SCENES.jellyfish = { titleAt: 0.58, oddsAt: 0.72, textY: 0.5, make: function (env) {
    var jellies = arr(6, function (i) { return { x: 0.1 + (i / 5) * 0.8 + (env.rng() - 0.5) * 0.08, s: 0.05 + env.rng() * 0.06, sp: 0.04 + env.rng() * 0.04, ph: env.rng() * 6, o: env.rng(), col: env.colors[i % env.colors.length] }; });
    var snow = arr(100, function () { return { x: env.rng(), y: env.rng(), s: 0.5 + env.rng() * 1.3, ph: env.rng() * 6 }; });
    return function (ctx, t, w, h) {
      var p = t / env.dur, U = Math.min(w, h);
      var bg = ctx.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, withAlpha(env.c2, 0.5)); bg.addColorStop(1, "#01020a"); fill(ctx, w, h, "#000"); fill(ctx, w, h, bg);
      ctx.fillStyle = "rgba(255,255,255,.35)"; snow.forEach(function (s) { ctx.fillRect(((s.x + Math.sin(t * 0.3 + s.ph) * 0.01) % 1) * w, ((s.y - t * 0.006 + 1) % 1) * h, s.s, s.s); });
      jellies.forEach(function (j, ji) {
        var pulse = Math.max(0, Math.sin(t * 2.4 + j.ph)), y = h * (1.2 - ((t * j.sp + j.o + 0.02 * pulse) % 1.4)), x = w * j.x + Math.sin(t * 0.5 + j.ph) * U * 0.03;
        var S = U * j.s * 1.6 * (0.6 + 0.4 * ease(clamp01(p / 0.3))), bw = S * (1 - 0.18 * pulse), bh = S * (0.75 + 0.12 * pulse);
        ctx.strokeStyle = withAlpha(j.col, 0.5); ctx.lineWidth = 1.5;
        for (var k = 0; k < 7; k++) { var tx = x + (k - 3) / 3 * bw * 0.8; ctx.beginPath(); ctx.moveTo(tx, y); ctx.quadraticCurveTo(tx + Math.sin(t * 2 + k + j.ph) * S * 0.5, y + S * 1.2, tx + Math.sin(t * 1.6 + k * 0.7 + j.ph) * S * 0.6, y + S * (2.4 + 0.3 * Math.sin(t + k))); ctx.stroke(); }
        var bell = ctx.createRadialGradient(x, y - bh * 0.6, 0, x, y - bh * 0.3, bw * 1.1); bell.addColorStop(0, "rgba(255,255,255,.6)"); bell.addColorStop(0.5, withAlpha(j.col, 0.45)); bell.addColorStop(1, withAlpha(j.col, 0.15));
        glow(ctx, j.col, 25); ctx.fillStyle = bell; ctx.beginPath(); ctx.moveTo(x - bw, y); ctx.bezierCurveTo(x - bw, y - bh * 1.3, x + bw, y - bh * 1.3, x + bw, y);
        for (var sc = 0; sc < 6; sc++) ctx.quadraticCurveTo(x + bw - (sc + 0.5) * bw / 3, y + bh * 0.18, x + bw - (sc + 1) * bw / 3, y);
        ctx.closePath(); ctx.fill(); noglow(ctx); ctx.strokeStyle = withAlpha(j.col, 0.8); ctx.lineWidth = 1.5; ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255,.35)"; for (var o = 0; o < 4; o++) { ctx.beginPath(); ctx.arc(x + (o - 1.5) * bw * 0.28, y - bh * 0.35, bw * 0.08, 0, TAU); ctx.fill(); }
      });
      fadeIn(ctx, t, w, h, 0.4);
    };
  } };

  /* A maze appears and a glowing path solves it. */
  SCENES.maze = { titleAt: 0.66, oddsAt: 0.8, textY: 0.5, make: function (env) {
    var C = 25, RW = 15, total = C * RW, walls = [], visited = [], path = [], i;
    for (i = 0; i < total; i++) { walls.push([1, 1, 1, 1]); visited.push(false); }
    var stack = [0]; visited[0] = true;
    while (stack.length) {
      var cur = stack[stack.length - 1], cx = cur % C, cy = Math.floor(cur / C), nb = [];
      if (cy > 0 && !visited[cur - C]) nb.push([cur - C, 0, 2]);
      if (cx < C - 1 && !visited[cur + 1]) nb.push([cur + 1, 1, 3]);
      if (cy < RW - 1 && !visited[cur + C]) nb.push([cur + C, 2, 0]);
      if (cx > 0 && !visited[cur - 1]) nb.push([cur - 1, 3, 1]);
      if (!nb.length) { stack.pop(); continue; }
      var n = nb[Math.floor(env.rng() * nb.length)];
      walls[cur][n[1]] = 0; walls[n[0]][n[2]] = 0; visited[n[0]] = true; stack.push(n[0]);
    }
    var prev = [], seen = [], queue = [0];
    for (i = 0; i < total; i++) { prev.push(-1); seen.push(false); }
    seen[0] = true;
    while (queue.length) {
      var c = queue.shift(); if (c === total - 1) break;
      var ccx = c % C, moves = [[0, -C], [1, 1], [2, C], [3, -1]];
      for (var m = 0; m < 4; m++) {
        var d = moves[m]; if (walls[c][d[0]]) continue;
        if ((d[0] === 1 && ccx === C - 1) || (d[0] === 3 && ccx === 0)) continue;
        var nx = c + d[1]; if (nx < 0 || nx >= total || seen[nx]) continue;
        seen[nx] = true; prev[nx] = c; queue.push(nx);
      }
    }
    for (var at = total - 1; at !== -1; at = prev[at]) path.unshift(at);
    return function (ctx, t, w, h) {
      var p = t / env.dur, cs = Math.min((w * 0.92) / C, (h * 0.86) / RW), mw = cs * C, mh = cs * RW, x0 = (w - mw) / 2, y0 = (h - mh) / 2;
      fill(ctx, w, h, "#04040a");
      var wa = clamp01(p / 0.12) * (p > 0.62 ? 0.45 : 1);
      ctx.strokeStyle = withAlpha(env.colors[1 % env.colors.length], 0.65 * wa); ctx.lineWidth = 2; ctx.lineCap = "square"; ctx.beginPath();
      for (var k = 0; k < total; k++) {
        var gx = x0 + (k % C) * cs, gy = y0 + Math.floor(k / C) * cs, wl = walls[k];
        if (wl[0]) { ctx.moveTo(gx, gy); ctx.lineTo(gx + cs, gy); }
        if (wl[3]) { ctx.moveTo(gx, gy); ctx.lineTo(gx, gy + cs); }
        if (wl[1] && k % C === C - 1) { ctx.moveTo(gx + cs, gy); ctx.lineTo(gx + cs, gy + cs); }
        if (wl[2] && Math.floor(k / C) === RW - 1) { ctx.moveTo(gx, gy + cs); ctx.lineTo(gx + cs, gy + cs); }
      }
      ctx.stroke();
      var center = function (id) { return [x0 + (id % C + 0.5) * cs, y0 + (Math.floor(id / C) + 0.5) * cs]; };
      var q = clamp01((p - 0.14) / 0.46), fpos = q * (path.length - 1), nn = Math.floor(fpos);
      ctx.strokeStyle = env.c1; ctx.lineWidth = Math.max(3, cs * 0.35); ctx.lineCap = "round"; ctx.lineJoin = "round"; glow(ctx, env.c1, q >= 1 ? 20 + 10 * Math.sin(t * 5) : 14);
      ctx.beginPath(); var head = center(path[0]); ctx.moveTo(head[0], head[1]);
      for (var s = 1; s <= nn; s++) { head = center(path[s]); ctx.lineTo(head[0], head[1]); }
      if (nn < path.length - 1) { var A = center(path[nn]), B = center(path[nn + 1]), fr = fpos - nn; head = [lerp(A[0], B[0], fr), lerp(A[1], B[1], fr)]; ctx.lineTo(head[0], head[1]); }
      ctx.stroke(); noglow(ctx);
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(head[0], head[1], Math.max(3, cs * 0.25), 0, TAU); ctx.fill();
      var ex = center(total - 1);
      if (q >= 1) { var rq = ((p - 0.6) * 2) % 1; ctx.strokeStyle = withAlpha(env.c1, 1 - rq); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(ex[0], ex[1], cs + rq * cs * 6, 0, TAU); ctx.stroke(); if (p < 0.66) flash(ctx, w, h, (0.66 - p) * 5, env.c1); }
      var dk = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.min(w, h) * 0.45); dk.addColorStop(0, "rgba(0,0,0," + 0.7 * clamp01((p - 0.6) * 4) + ")"); dk.addColorStop(1, "rgba(0,0,0,0)"); fill(ctx, w, h, dk);
      fadeIn(ctx, t, w, h, 0.3);
    };
  } };

  /* A beam of white light hits a prism and fans out into the aura's colours. */
  SCENES.prism = { titleAt: 0.6, oddsAt: 0.75, textY: 0.82, make: function (env) {
    var base = env.colors.length >= 3 ? env.colors : env.colors.concat(["#fde047", "#22d3ee", "#e879f9"]), bands = arr(7, function (i) { return base[i % base.length]; });
    return function (ctx, t, w, h) {
      var p = t / env.dur, U = Math.min(w, h), cx = w * 0.38, cy = h * 0.4, S = U * 0.2;
      fill(ctx, w, h, "#030308");
      var apex = [cx, cy - S], left = [cx - S * 0.87, cy + S * 0.5], right = [cx + S * 0.87, cy + S * 0.5];
      var E = [lerp(apex[0], left[0], 0.55), lerp(apex[1], left[1], 0.55)], X = [lerp(apex[0], right[0], 0.55), lerp(apex[1], right[1], 0.55)];
      var q1 = clamp01(p / 0.2), q2 = clamp01((p - 0.2) / 0.08), q3 = ease(clamp01((p - 0.28) / 0.3));
      var start = [-10, E[1] + S * 0.35], bx = lerp(start[0], E[0], q1), by = lerp(start[1], E[1], q1);
      glow(ctx, "#fff", 24); ctx.strokeStyle = "#fff"; ctx.lineWidth = 6; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(start[0], start[1]); ctx.lineTo(bx, by); ctx.stroke(); noglow(ctx);
      if (q2 > 0) { ctx.strokeStyle = "rgba(255,255,255,.55)"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(E[0], E[1]); ctx.lineTo(lerp(E[0], X[0], q2), lerp(E[1], X[1], q2)); ctx.stroke(); }
      if (q3 > 0) {
        ctx.save(); ctx.globalCompositeOperation = "lighter";
        bands.forEach(function (col, i) {
          var a0 = -0.18 + i * 0.075, a1 = a0 + 0.075, L = ((w + 40 - X[0]) / Math.cos(a0 + 0.04)) * q3;
          ctx.fillStyle = withAlpha(col, 0.5 + 0.12 * Math.sin(t * 2 + i)); ctx.beginPath(); ctx.moveTo(X[0], X[1]); ctx.lineTo(X[0] + Math.cos(a0) * L, X[1] + Math.sin(a0) * L); ctx.lineTo(X[0] + Math.cos(a1) * L, X[1] + Math.sin(a1) * L); ctx.closePath(); ctx.fill();
          if (q3 >= 1) { var ex = w - 4, ey = X[1] + Math.tan(a0 + 0.0375) * (ex - X[0]), tw = 0.5 + 0.5 * Math.sin(t * 5 + i * 1.3); ctx.fillStyle = "rgba(255,255,255," + tw * 0.7 + ")"; ctx.beginPath(); ctx.arc(ex, ey, 3 + tw * 3, 0, TAU); ctx.fill(); }
        });
        ctx.restore();
      }
      ctx.fillStyle = "rgba(255,255,255,.06)"; ctx.beginPath(); ctx.moveTo(apex[0], apex[1]); ctx.lineTo(left[0], left[1]); ctx.lineTo(right[0], right[1]); ctx.closePath(); ctx.fill();
      glow(ctx, env.c1, 18); ctx.strokeStyle = "rgba(255,255,255,.85)"; ctx.lineWidth = 2; ctx.stroke(); noglow(ctx);
      ctx.strokeStyle = "rgba(255,255,255,.25)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(lerp(apex[0], left[0], 0.15), lerp(apex[1], left[1], 0.15) + 6); ctx.lineTo(lerp(apex[0], left[0], 0.75), lerp(apex[1], left[1], 0.75)); ctx.stroke();
      if (p > 0.28 && p < 0.34) flash(ctx, w, h, (0.34 - p) * 4, "#ffffff");
      fadeIn(ctx, t, w, h, 0.3);
    };
  } };

  /* Countdown, ignition and lift-off. */
  SCENES.rocket = { titleAt: 0.62, oddsAt: 0.77, textY: 0.3, make: function (env) {
    var smoke = arr(80, function () { return { dx: env.rng() - 0.5, o: env.rng(), r: 0.04 + env.rng() * 0.07, sp: 0.4 + env.rng() * 0.6 }; });
    var stars = arr(150, function () { return { x: env.rng(), y: env.rng(), s: 0.5 + env.rng() * 1.3 }; });
    var LIFT = 0.3;
    return function (ctx, t, w, h) {
      var p = t / env.dur, U = Math.min(w, h), cx = w / 2, padY = h * 0.86, lt = Math.max(0, p - LIFT) * env.dur, rise = lt * lt * h * 0.16, RH = U * 0.24, RW = U * 0.065;
      var shake = lt > 0 && lt < 1.8 ? (1.8 - lt) * 5 : (p > LIFT - 0.06 && p < LIFT ? 3 : 0);
      ctx.save(); ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
      var dark = clamp01(lt / 2.5), sky = ctx.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, dark > 0.5 ? "#02020a" : "#0d0a24"); sky.addColorStop(1, withAlpha(env.c2, 0.7 * (1 - dark * 0.6))); fill(ctx, w, h, "#02020a"); fill(ctx, w, h, sky);
      ctx.fillStyle = "#fff"; ctx.globalAlpha = 0.2 + 0.7 * dark; stars.forEach(function (s) { ctx.fillRect(s.x * w, s.y * h * 0.8, s.s, s.s); }); ctx.globalAlpha = 1;
      ctx.fillStyle = "#08060c"; ctx.fillRect(0, padY, w, h - padY);
      ctx.strokeStyle = "#1c1826"; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(cx - RW * 2.2, padY); ctx.lineTo(cx - RW * 2.2, padY - RH * 1.1); ctx.lineTo(cx - RW * 0.9, padY - RH * 1.1); ctx.moveTo(cx - RW * 2.2, padY - RH * 0.5); ctx.lineTo(cx - RW * 0.9, padY - RH * 0.5); ctx.stroke();
      if (p > LIFT - 0.06) {
        smoke.forEach(function (s) { var age = (t * s.sp + s.o) % 1, x = cx + s.dx * age * w * 0.7, y = padY - age * U * 0.12, r = U * s.r * (0.5 + age * 2); var sg = ctx.createRadialGradient(x, y, 0, x, y, r); sg.addColorStop(0, "rgba(225,220,235," + 0.35 * (1 - age) + ")"); sg.addColorStop(1, "rgba(225,220,235,0)"); ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); });
      }
      var by = padY - rise;
      if (lt > 0) { ctx.save(); ctx.globalCompositeOperation = "lighter"; var tg = ctx.createLinearGradient(0, by, 0, padY); tg.addColorStop(0, withAlpha(env.c1, 0.7)); tg.addColorStop(1, withAlpha(env.c1, 0)); ctx.fillStyle = tg; ctx.fillRect(cx - RW * 0.35, by, RW * 0.7, Math.max(0, padY - by)); ctx.restore(); }
      if (p > LIFT - 0.06 && by + RH * 0.4 > 0) {
        var fl = U * (0.08 + 0.03 * Math.sin(t * 30)) * (lt > 0 ? 1.6 : 0.8), fg = ctx.createLinearGradient(0, by, 0, by + fl); fg.addColorStop(0, "#ffffff"); fg.addColorStop(0.3, "#ffb347"); fg.addColorStop(0.7, env.c1); fg.addColorStop(1, withAlpha(env.c1, 0));
        ctx.fillStyle = fg; ctx.beginPath(); ctx.moveTo(cx - RW * 0.38, by); ctx.quadraticCurveTo(cx, by + fl * 1.4, cx + RW * 0.38, by); ctx.closePath(); ctx.fill();
      }
      if (by > -RH * 1.2) {
        ctx.save(); ctx.translate(cx, by);
        ctx.fillStyle = env.colors[1 % env.colors.length]; ctx.beginPath(); ctx.moveTo(-RW / 2, -RH * 0.05); ctx.lineTo(-RW * 1.05, 0); ctx.lineTo(-RW / 2, -RH * 0.35); ctx.closePath(); ctx.fill(); ctx.beginPath(); ctx.moveTo(RW / 2, -RH * 0.05); ctx.lineTo(RW * 1.05, 0); ctx.lineTo(RW / 2, -RH * 0.35); ctx.closePath(); ctx.fill();
        var bodyG = ctx.createLinearGradient(-RW / 2, 0, RW / 2, 0); bodyG.addColorStop(0, "#9ca3af"); bodyG.addColorStop(0.45, "#ffffff"); bodyG.addColorStop(1, "#9ca3af"); ctx.fillStyle = bodyG; rrect(ctx, -RW / 2, -RH * 0.8, RW, RH * 0.8, RW * 0.2); ctx.fill();
        ctx.fillStyle = env.c1; ctx.beginPath(); ctx.moveTo(-RW / 2, -RH * 0.78); ctx.quadraticCurveTo(0, -RH * 1.15, RW / 2, -RH * 0.78); ctx.closePath(); ctx.fill();
        ctx.fillStyle = "#1e1b2e"; ctx.beginPath(); ctx.arc(0, -RH * 0.55, RW * 0.22, 0, TAU); ctx.fill(); ctx.fillStyle = withAlpha(env.c1, 0.8); ctx.beginPath(); ctx.arc(0, -RH * 0.55, RW * 0.15, 0, TAU); ctx.fill();
        ctx.restore();
      }
      ctx.restore();
      if (p < LIFT) {
        var cd = 3 - Math.floor(p / LIFT * 3), cp = (p / LIFT * 3) % 1, size = Math.round(U * 0.22 * (1.3 - cp * 0.3));
        ctx.globalAlpha = 1 - cp * 0.6; label(ctx, String(cd), cx, h * 0.38, size, "#fff", "center", "900"); ctx.globalAlpha = 1;
      }
      if (lt > 0 && lt < 0.3) flash(ctx, w, h, (0.3 - lt) * 2.5, "#ffb347");
      fadeIn(ctx, t, w, h, 0.3);
    };
  } };

  /* Sky lanterns drift up from a lake at night. */
  SCENES.lanterns = { titleAt: 0.55, oddsAt: 0.7, textY: 0.34, make: function (env) {
    var ls = arr(70, function (i) { return { x: env.rng(), z: 0.3 + env.rng() * 0.7, o: env.rng(), sp: 0.04 + env.rng() * 0.04, ph: env.rng() * 6, col: env.rng() < 0.55 ? "#ffb347" : env.colors[i % env.colors.length] }; }).sort(function (a, b) { return a.z - b.z; });
    var hills = arr(21, function () { return 0.6 + env.rng() * 0.05; }), stars = arr(120, function () { return { x: env.rng(), y: env.rng() * 0.55, s: 0.5 + env.rng() }; });
    return function (ctx, t, w, h) {
      var p = t / env.dur, U = Math.min(w, h), hz = h * 0.68;
      var sky = ctx.createLinearGradient(0, 0, 0, hz); sky.addColorStop(0, "#03020c"); sky.addColorStop(1, withAlpha(env.c2, 0.55)); fill(ctx, w, h, "#000"); ctx.fillStyle = sky; ctx.fillRect(0, 0, w, hz);
      ctx.fillStyle = "#fff"; ctx.globalAlpha = 0.5; stars.forEach(function (s) { ctx.fillRect(s.x * w, s.y * h, s.s, s.s); }); ctx.globalAlpha = 1;
      ctx.fillStyle = "#04030a"; ctx.beginPath(); ctx.moveTo(0, hz); hills.forEach(function (y, i) { ctx.lineTo(i / (hills.length - 1) * w, y * h); }); ctx.lineTo(w, hz); ctx.closePath(); ctx.fill();
      var lake = ctx.createLinearGradient(0, hz, 0, h); lake.addColorStop(0, "#060818"); lake.addColorStop(1, "#000"); ctx.fillStyle = lake; ctx.fillRect(0, hz, w, h - hz);
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      ls.forEach(function (l) {
        var age = t - l.o * env.dur * 0.4; if (age < 0) return;
        var y = hz - ((age * l.sp * (0.6 + l.z)) % 1.15) * hz, x = l.x * w + Math.sin(t * 0.6 + l.ph) * 10 * l.z, s = U * 0.022 * l.z * 1.6, a = 0.35 + 0.65 * l.z;
        var gl = ctx.createRadialGradient(x, y, 0, x, y, s * 4); gl.addColorStop(0, withAlpha(l.col, 0.4 * a)); gl.addColorStop(1, withAlpha(l.col, 0)); ctx.fillStyle = gl; ctx.fillRect(x - s * 4, y - s * 4, s * 8, s * 8);
        var lg = ctx.createLinearGradient(0, y - s, 0, y + s); lg.addColorStop(0, withAlpha(l.col, 0.75 * a)); lg.addColorStop(1, withAlpha("#fff3c4", 0.95 * a));
        ctx.fillStyle = lg; ctx.beginPath(); ctx.moveTo(x - s * 0.55, y - s); ctx.lineTo(x + s * 0.55, y - s); ctx.lineTo(x + s * 0.7, y + s); ctx.lineTo(x - s * 0.7, y + s); ctx.closePath(); ctx.fill();
        var ry = hz + (hz - y) * 0.3; if (ry < h) { ctx.fillStyle = withAlpha(l.col, 0.16 * a); ctx.fillRect(x - s * 0.5 + Math.sin(t * 3 + l.ph) * 2, ry, s, s * 2); }
      });
      ctx.restore();
      fadeIn(ctx, t, w, h, 0.5);
    };
  } };

  /* A wireframe globe turns while signals arc between points. */
  SCENES.globe = { titleAt: 0.6, oddsAt: 0.75, textY: 0.84, make: function (env) {
    var dots = arr(420, function () { var u = env.rng() * 2 - 1, a = env.rng() * TAU, r = Math.sqrt(1 - u * u); return [r * Math.cos(a), u, r * Math.sin(a)]; });
    var targets = arr(7, function () { var u = env.rng() * 1.4 - 0.7, a = (env.rng() - 0.5) * 2.4, r = Math.sqrt(1 - u * u); return [r * Math.sin(a), u, r * Math.cos(a)]; });
    var home = [0, 0.3, Math.sqrt(1 - 0.09)];
    return function (ctx, t, w, h) {
      var p = t / env.dur, U = Math.min(w, h), cx = w / 2, cy = h * 0.42, R = U * 0.32 * (0.6 + 0.4 * ease(clamp01(p / 0.3))), rot = (t - env.dur * 0.6) * 0.3, tilt = 0.3;
      function proj(v) { var x = v[0] * Math.cos(rot) + v[2] * Math.sin(rot), z = -v[0] * Math.sin(rot) + v[2] * Math.cos(rot), y = v[1], y2 = y * Math.cos(tilt) - z * Math.sin(tilt), z2 = y * Math.sin(tilt) + z * Math.cos(tilt); return [cx + x * R, cy - y2 * R, z2]; }
      var bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.7); bg.addColorStop(0, withAlpha(env.c2, 0.4)); bg.addColorStop(1, "#010108"); fill(ctx, w, h, bg);
      var atm = ctx.createRadialGradient(cx, cy, R * 0.95, cx, cy, R * 1.35); atm.addColorStop(0, withAlpha(env.c1, 0.45)); atm.addColorStop(1, withAlpha(env.c1, 0)); fill(ctx, w, h, atm);
      ctx.fillStyle = "#050914"; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();
      function line(pts) { for (var pass = 0; pass < 2; pass++) { ctx.strokeStyle = pass ? withAlpha(env.c1, 0.55) : withAlpha(env.c1, 0.08); ctx.beginPath(); var pen = false; pts.forEach(function (v) { var P = proj(v), front = P[2] > 0; if (front === !!pass) { if (!pen) { ctx.moveTo(P[0], P[1]); pen = true; } else ctx.lineTo(P[0], P[1]); } else pen = false; }); ctx.stroke(); } }
      ctx.lineWidth = 1;
      for (var k = 0; k < 12; k++) { var ph = k * Math.PI / 6, pts = []; for (var la = -Math.PI / 2; la <= Math.PI / 2 + 0.01; la += 0.1) pts.push([Math.cos(la) * Math.cos(ph), Math.sin(la), Math.cos(la) * Math.sin(ph)]); line(pts); }
      [-1, -0.5, 0, 0.5, 1].forEach(function (la0) { var la = la0 * 1.05, pts = []; for (var a = 0; a <= TAU + 0.01; a += 0.1) pts.push([Math.cos(la) * Math.cos(a), Math.sin(la), Math.cos(la) * Math.sin(a)]); line(pts); });
      ctx.fillStyle = withAlpha(env.c1, 0.85); dots.forEach(function (d) { var P = proj(d); if (P[2] > 0) ctx.fillRect(P[0] - 0.8, P[1] - 0.8, 1.6 + P[2], 1.6 + P[2]); });
      var hp = proj(home);
      targets.forEach(function (tg, i) {
        var q = clamp01((p - 0.3 - i * 0.04) / 0.2); if (q <= 0) return;
        ctx.strokeStyle = env.colors[i % env.colors.length]; ctx.lineWidth = 2; glow(ctx, ctx.strokeStyle, 10); ctx.beginPath();
        for (var s = 0; s <= 30 * q; s++) { var u = s / 30, v = [lerp(home[0], tg[0], u), lerp(home[1], tg[1], u), lerp(home[2], tg[2], u)], len = Math.hypot(v[0], v[1], v[2]) || 1, lift = 1 + 0.25 * Math.sin(u * Math.PI); v = [v[0] / len * lift, v[1] / len * lift, v[2] / len * lift]; var P = proj(v); if (s === 0) ctx.moveTo(P[0], P[1]); else ctx.lineTo(P[0], P[1]); }
        ctx.stroke(); noglow(ctx);
        if (q >= 1) { var tp = proj(tg); if (tp[2] > 0) { var rr = ((t * 0.8 + i * 0.3) % 1); ctx.strokeStyle = withAlpha(env.c1, 1 - rr); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(tp[0], tp[1], 3 + rr * 14, 0, TAU); ctx.stroke(); } }
      });
      if (hp[2] > 0) { var hr = (t * 0.9) % 1; glow(ctx, "#fff", 14); ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(hp[0], hp[1], 4, 0, TAU); ctx.fill(); noglow(ctx); ctx.strokeStyle = "rgba(255,255,255," + (1 - hr) + ")"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(hp[0], hp[1], 4 + hr * 24, 0, TAU); ctx.stroke(); }
      fadeIn(ctx, t, w, h, 0.4);
    };
  } };

  /* ---------- Accent layers: a second effect drawn over the scene, so every Epic+ aura's
     cutscene is a distinct scene + accent pairing. Each fades in over the first second. ---------- */

  function fadeA(t) { return Math.min(1, t / 1.0); }

  var ACCENTS = {
    shooting: function (env) {
      var m = arr(10, function () { return { x: env.rng() * 1.2, y: env.rng() * 0.5, o: env.rng(), len: 80 + env.rng() * 140 }; });
      return function (ctx, t, w, h) {
        ctx.lineCap = "round"; ctx.lineWidth = 2;
        m.forEach(function (s) { var lp = (t * 0.35 + s.o) % 1; if (lp > 0.35) return; var q = lp / 0.35, x = (s.x - q * 0.5) * w, y = (s.y + q * 0.35) * h; var g = ctx.createLinearGradient(x, y, x + s.len, y - s.len * 0.6); g.addColorStop(0, "rgba(255,255,255," + 0.9 * fadeA(t) * (1 - q) + ")"); g.addColorStop(1, "rgba(255,255,255,0)"); ctx.strokeStyle = g; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + s.len, y - s.len * 0.6); ctx.stroke(); });
      };
    },
    snow: function (env) {
      var f = arr(140, function () { return { x: env.rng(), y: env.rng(), s: 1 + env.rng() * 2.5, sp: 0.04 + env.rng() * 0.06, ph: env.rng() * 6 }; });
      return function (ctx, t, w, h) { ctx.fillStyle = "#fff"; f.forEach(function (p) { ctx.globalAlpha = 0.7 * fadeA(t); ctx.beginPath(); ctx.arc(((p.x + Math.sin(t * 0.8 + p.ph) * 0.02) % 1) * w, ((p.y + t * p.sp) % 1) * h, p.s, 0, TAU); ctx.fill(); }); };
    },
    embers: function (env) {
      var f = arr(90, function () { return { x: env.rng(), y: env.rng(), s: 1 + env.rng() * 2.5, sp: 0.05 + env.rng() * 0.08, ph: env.rng() * 6 }; });
      return function (ctx, t, w, h) { ctx.globalCompositeOperation = "lighter"; f.forEach(function (p) { var fl = 0.5 + 0.5 * Math.sin(t * 8 + p.ph); ctx.globalAlpha = (0.35 + 0.5 * fl) * fadeA(t); ctx.fillStyle = fl > 0.6 ? "#ffd27a" : env.c1; ctx.beginPath(); ctx.arc(((p.x + Math.sin(t + p.ph) * 0.02) % 1) * w, (1 - ((p.y + t * p.sp) % 1)) * h, p.s, 0, TAU); ctx.fill(); }); };
    },
    rain: function (env) {
      var d = arr(160, function () { return { x: env.rng(), y: env.rng(), sp: 0.7 + env.rng() * 0.6, l: 10 + env.rng() * 18 }; });
      return function (ctx, t, w, h) { ctx.strokeStyle = withAlpha(env.c1, 0.35 * fadeA(t)); ctx.lineWidth = 1.2; ctx.beginPath(); d.forEach(function (r) { var y = ((r.y + t * r.sp) % 1) * h, x = ((r.x - t * 0.05) % 1 + 1) % 1 * w; ctx.moveTo(x, y); ctx.lineTo(x - 3, y + r.l); }); ctx.stroke(); };
    },
    bubbles: function (env) {
      var b = arr(45, function () { return { x: env.rng(), o: env.rng(), r: 2 + env.rng() * 6, sp: 0.06 + env.rng() * 0.08, ph: env.rng() * 6 }; });
      return function (ctx, t, w, h) { ctx.strokeStyle = "rgba(255,255,255," + 0.45 * fadeA(t) + ")"; ctx.lineWidth = 1.2; b.forEach(function (p) { ctx.beginPath(); ctx.arc(p.x * w + Math.sin(t * 2 + p.ph) * 6, h * (1.05 - ((t * p.sp + p.o) % 1.1)), p.r, 0, TAU); ctx.stroke(); }); };
    },
    searchlights: function (env) {
      return function (ctx, t, w, h) {
        ctx.globalCompositeOperation = "lighter";
        [[0.2, 1], [0.8, -1]].forEach(function (s, i) {
          var bx = s[0] * w, a = -Math.PI / 2 + Math.sin(t * 0.6 + i * 2) * 0.55 * s[1], L = h * 1.3;
          var g = ctx.createLinearGradient(bx, h, bx + Math.cos(a) * L, h + Math.sin(a) * L); g.addColorStop(0, withAlpha(env.c1, 0.28 * fadeA(t))); g.addColorStop(1, withAlpha(env.c1, 0));
          ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(bx, h); ctx.lineTo(bx + Math.cos(a - 0.07) * L, h + Math.sin(a - 0.07) * L); ctx.lineTo(bx + Math.cos(a + 0.07) * L, h + Math.sin(a + 0.07) * L); ctx.closePath(); ctx.fill();
        });
      };
    },
    lightning: function (env) {
      var next = 1, bolt = null;
      return function (ctx, t, w, h) {
        if (t > next) { var side = env.rng() < 0.5 ? 0.06 : 0.94, pts = [[side * w, 0]]; for (var i = 1; i <= 8; i++) pts.push([side * w + (env.rng() - 0.5) * w * 0.08, h * 0.5 * i / 8]); bolt = { pts: pts, born: t }; next = t + 1.2 + env.rng() * 1.6; }
        if (!bolt || t - bolt.born > 0.22) return;
        var a = 1 - (t - bolt.born) / 0.22;
        ctx.globalAlpha = a; ctx.strokeStyle = env.c1; ctx.lineWidth = 3; glow(ctx, env.c1, 20); ctx.beginPath(); bolt.pts.forEach(function (P, i) { if (i === 0) ctx.moveTo(P[0], P[1]); else ctx.lineTo(P[0], P[1]); }); ctx.stroke(); noglow(ctx);
        ctx.fillStyle = withAlpha(env.c1, 0.12 * a); ctx.fillRect(0, 0, w, h);
      };
    },
    petals: function (env) {
      var p = arr(60, function () { return { x: env.rng(), y: env.rng(), s: 3 + env.rng() * 5, sp: 0.05 + env.rng() * 0.05, rot: env.rng() * TAU, spin: (env.rng() - 0.5) * 3, col: env.colors[Math.floor(env.rng() * env.colors.length)] }; });
      return function (ctx, t, w, h) { p.forEach(function (q) { ctx.save(); ctx.translate(((q.x + t * 0.04) % 1) * w, ((q.y + t * q.sp) % 1) * h); ctx.rotate(q.rot + t * q.spin); ctx.globalAlpha = 0.75 * fadeA(t); ctx.fillStyle = q.col; ctx.beginPath(); ctx.moveTo(0, -q.s); ctx.lineTo(q.s * 0.6, 0); ctx.lineTo(0, q.s); ctx.lineTo(-q.s * 0.6, 0); ctx.closePath(); ctx.fill(); ctx.restore(); }); };
    },
    orbit: function (env) {
      var s = arr(28, function (i) { return { a: i / 28 * TAU, r: 0.9 + env.rng() * 0.2, col: env.colors[i % env.colors.length] }; });
      return function (ctx, t, w, h) { var R = Math.min(w, h) * 0.42; ctx.globalCompositeOperation = "lighter"; s.forEach(function (q) { var a = q.a + t * 0.5, x = w / 2 + Math.cos(a) * R * q.r * 1.25, y = h / 2 + Math.sin(a) * R * q.r * 0.45; ctx.globalAlpha = (0.4 + 0.6 * (Math.sin(a) + 1) / 2) * fadeA(t); ctx.fillStyle = q.col; ctx.beginPath(); ctx.arc(x, y, 3 + 2 * (Math.sin(a) + 1) / 2, 0, TAU); ctx.fill(); }); };
    },
    glitch: function (env) {
      return function (ctx, t, w, h) {
        var burst = Math.sin(t * 2.3) > 0.85 || Math.sin(t * 3.7 + 1) > 0.92; if (!burst) return;
        for (var i = 0; i < 6; i++) { ctx.fillStyle = withAlpha([env.c1, "#00ffff", "#ff00ff"][i % 3], 0.35 * fadeA(t)); ctx.fillRect(Math.random() * w, Math.random() * h, 40 + Math.random() * 200, 3 + Math.random() * 10); }
      };
    },
    godrays: function (env) {
      var rays = arr(7, function () { return { a: 0.35 + env.rng() * 0.7, wd: 0.025 + env.rng() * 0.04, ph: env.rng() * 6 }; });
      return function (ctx, t, w, h) {
        var L = Math.hypot(w, h); ctx.globalCompositeOperation = "lighter";
        rays.forEach(function (r) { var a = r.a + Math.sin(t * 0.3 + r.ph) * 0.04, g = ctx.createLinearGradient(0, 0, Math.cos(a) * L, Math.sin(a) * L); g.addColorStop(0, "rgba(255,255,255," + 0.18 * fadeA(t) + ")"); g.addColorStop(1, "rgba(255,255,255,0)"); ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a - r.wd) * L, Math.sin(a - r.wd) * L); ctx.lineTo(Math.cos(a + r.wd) * L, Math.sin(a + r.wd) * L); ctx.closePath(); ctx.fill(); });
      };
    },
    dust: function (env) {
      var d = arr(120, function () { return { x: env.rng(), y: env.rng(), s: 0.6 + env.rng() * 1.4, ph: env.rng() * 6 }; });
      return function (ctx, t, w, h) { ctx.fillStyle = "#fff"; d.forEach(function (p) { ctx.globalAlpha = (0.2 + 0.45 * Math.abs(Math.sin(t + p.ph))) * fadeA(t); ctx.fillRect(((p.x + Math.sin(t * 0.2 + p.ph) * 0.03) % 1 + 1) % 1 * w, ((p.y + Math.cos(t * 0.15 + p.ph) * 0.03) % 1 + 1) % 1 * h, p.s, p.s); }); };
    },
    bokeh: function (env) {
      var b = arr(16, function () { return { x: env.rng(), y: env.rng(), r: 0.03 + env.rng() * 0.06, sp: 0.01 + env.rng() * 0.02, ph: env.rng() * 6, col: env.colors[Math.floor(env.rng() * env.colors.length)] }; });
      return function (ctx, t, w, h) { var U = Math.min(w, h); ctx.globalCompositeOperation = "lighter"; b.forEach(function (p) { var x = ((p.x + t * p.sp) % 1) * w, y = (p.y + Math.sin(t * 0.4 + p.ph) * 0.03) * h, r = p.r * U; var g = ctx.createRadialGradient(x, y, r * 0.6, x, y, r); g.addColorStop(0, withAlpha(p.col, 0.16 * fadeA(t))); g.addColorStop(0.9, withAlpha(p.col, 0.22 * fadeA(t))); g.addColorStop(1, withAlpha(p.col, 0)); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }); };
    },
    ribbon: function (env) {
      return function (ctx, t, w, h) {
        for (var k = 0; k < 2; k++) {
          ctx.strokeStyle = withAlpha(env.colors[k % env.colors.length], 0.5 * fadeA(t)); ctx.lineWidth = 2 + k; glow(ctx, env.colors[k % env.colors.length], 12); ctx.beginPath();
          for (var x = 0; x <= w; x += 10) { var y = h * (0.12 + k * 0.76) + Math.sin(x * 0.008 + t * 1.4 + k * 2) * h * 0.04 + Math.sin(x * 0.02 - t * 2) * h * 0.012; if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
          ctx.stroke(); noglow(ctx);
        }
      };
    }
  };
  var ACCENT_KEYS = Object.keys(ACCENTS);
  /* Pairings that would just double up on what the scene already does. */
  var SKIP_PAIRS = { "storm|rain": 1, "storm|lightning": 1, "ash|embers": 1, "sakura|petals": 1, "underwater|bubbles": 1, "jellyfish|bubbles": 1, "starfall|shooting": 1, "comet|shooting": 1, "vhs|glitch": 1, "volcano|embers": 1 };

  /* Rainbow glints and a sweeping sheen laid over the whole reveal when the roll is shiny. */
  function makeShinyLayer(env) {
    var glints = arr(36, function () { return { x: env.rng(), y: env.rng(), s: 4 + env.rng() * 10, ph: env.rng() * 6, sp: 1.5 + env.rng() * 2.5 }; });
    var rainbow = ["#ff6b6b", "#ffd93d", "#6bff95", "#6bd8ff", "#b06bff"];
    return function (ctx, t, w, h) {
      var a = fadeA(t), sweep = ((t * 0.35) % 1.6) - 0.3, L = w + h;
      ctx.globalCompositeOperation = "lighter";
      var g = ctx.createLinearGradient(0, 0, w, h);
      rainbow.forEach(function (c, i) { var pos = sweep + i * 0.025; if (pos >= 0 && pos <= 1) g.addColorStop(pos, withAlpha(c, 0.16 * a)); });
      if (sweep - 0.05 >= 0 && sweep - 0.05 <= 1) g.addColorStop(sweep - 0.05, "rgba(0,0,0,0)");
      if (sweep + 0.18 >= 0 && sweep + 0.18 <= 1) g.addColorStop(sweep + 0.18, "rgba(0,0,0,0)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      glints.forEach(function (gl, i) {
        var tw = Math.pow(Math.max(0, Math.sin(t * gl.sp + gl.ph)), 4); if (tw < 0.05) return;
        var x = gl.x * w, y = gl.y * h, s = gl.s * tw;
        ctx.strokeStyle = withAlpha(rainbow[i % rainbow.length], 0.9 * a * tw); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x - s, y); ctx.lineTo(x + s, y); ctx.moveTo(x, y - s); ctx.lineTo(x, y + s); ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255," + a * tw + ")"; ctx.beginPath(); ctx.arc(x, y, 1.5, 0, TAU); ctx.fill();
      });
      void L;
    };
  }

  var SCENE_KEYS = Object.keys(SCENES);
  var TITLE_KEYS = ["stagger", "type", "slam", "blur", "flip", "rise", "glitch", "decode"];
  var OVERLAY_KEYS = ["none", "scanlines", "vignette", "grid", "noise"];
  var FORCED = { "Beyond Axiom": { scene: "graph", accent: "dust", title: "type", overlay: "grid" } };

  /* Every Epic+ aura gets its own scene + accent pairing (no two share one); title style and
     overlay are added on top for extra variety. Below Epic there is no cutscene. */
  var assignments = null;
  function build(list) {
    var rng = mulberry32(777), pick = mulberry32(4242), pairs = [], used = {};
    SCENE_KEYS.forEach(function (sc) { ACCENT_KEYS.forEach(function (ac) { if (!SKIP_PAIRS[sc + "|" + ac]) pairs.push(sc + "|" + ac); }); });
    for (var j = pairs.length - 1; j > 0; j--) { var k = Math.floor(rng() * (j + 1)), tmp = pairs[j]; pairs[j] = pairs[k]; pairs[k] = tmp; }
    assignments = {};
    list.forEach(function (a) { var f = FORCED[a.name]; if (f) { used[f.scene + "|" + f.accent] = true; assignments[a.id] = f; } });
    var ptr = 0;
    list.forEach(function (a) {
      if (assignments[a.id] || a.rarity < 10000) return;
      while (used[pairs[ptr]]) ptr++;
      var pr = pairs[ptr++].split("|");
      used[pr[0] + "|" + pr[1]] = true;
      assignments[a.id] = { scene: pr[0], accent: pr[1], title: TITLE_KEYS[Math.floor(pick() * TITLE_KEYS.length)], overlay: OVERLAY_KEYS[Math.floor(pick() * OVERLAY_KEYS.length)] };
    });
  }

  function assign(aura) {
    if (!assignments) build(global.AURAS.list);
    return assignments[aura.id] || null;
  }

  /* Seconds one letter takes to finish animating in, per title style. */
  function titleAnim(style) { return style === "type" ? 0.05 : style === "slam" ? 0.5 : 1.1; }

  /* Title styles: letters are spans with a per-letter delay. decode runs a character scramble in JS. */
  function applyTitle(el, text, style, step) {
    el.innerHTML = "";
    el.className = el.className.replace(/\bts-\S+/g, "").trim() + " ts-" + style;
    var longest = text.split(" ").reduce(function (m, wd) { return Math.max(m, wd.length); }, 1);
    el.style.setProperty("--fitw", String(longest));
    var spans = [], word = null;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (ch === " ") { word = null; el.appendChild(document.createTextNode(" ")); continue; }
      if (!word) { word = document.createElement("span"); word.className = "word"; el.appendChild(word); }
      var sp = document.createElement("span");
      sp.className = "ltr";
      sp.textContent = ch;
      sp.style.setProperty("--d", (i * step) + "s");
      word.appendChild(sp);
      spans.push({ el: sp, ch: ch, i: i });
    }
    var anim = titleAnim(style);
    var cancel = null;
    if (style === "decode") {
      var pool = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$%&*";
      var start = performance.now();
      var iv = setInterval(function () {
        var el2 = (performance.now() - start) / 1000;
        var done = true;
        spans.forEach(function (sp) {
          if (el2 < sp.i * step + 0.5) { sp.el.textContent = pool[Math.floor(Math.random() * pool.length)]; done = false; }
          else sp.el.textContent = sp.ch;
        });
        if (done) clearInterval(iv);
      }, 45);
      cancel = function () { clearInterval(iv); };
    }
    return { done: text.length * step + anim, cancel: cancel };
  }

  global.REVEALS = { SCENES: SCENES, SCENE_KEYS: SCENE_KEYS, TITLE_KEYS: TITLE_KEYS, OVERLAY_KEYS: OVERLAY_KEYS, assign: assign, applyTitle: applyTitle, titleAnim: titleAnim, ACCENTS: ACCENTS, ACCENT_KEYS: ACCENT_KEYS, makeShinyLayer: makeShinyLayer, mulberry32: mulberry32, _build: build };
  if (typeof module !== "undefined" && module.exports) module.exports = global.REVEALS;
})(typeof window !== "undefined" ? window : globalThis);
