/* ===========================================================
   animation.js — timeline animation.
   Layers can be photos, web images, videos, stickers, text or a
   spinning 3D model. Every layer has keyframes for position,
   size, spin and fade, and the whole thing exports to video.
   =========================================================== */

import { debounce, download, buildSwatches } from "./threed.js";
import { createViewer, primitives, parseOBJ } from "../gl.js";

const STICKERS = ["🚀", "⭐", "📐", "🔢", "🍕", "🎯", "🐢", "💡", "🧮", "➗", "✖️", "🎈", "🌟", "🔺", "⭕", "✅"];
const BG_COLORS = ["#0b1220", "#05060f", "#111827", "#ffffff", "#f1f5f9", "#1e1b34", "#0f2419"];
const W = 1280, H = 720;

/* Easing curves. "smooth" is the safe default; the others are what make a
   movement feel snappy, springy or heavy instead of flat. */
function bounceOut(u) {
  const n = 7.5625, d = 2.75;
  if (u < 1 / d) return n * u * u;
  if (u < 2 / d) return n * (u -= 1.5 / d) * u + 0.75;
  if (u < 2.5 / d) return n * (u -= 2.25 / d) * u + 0.9375;
  return n * (u -= 2.625 / d) * u + 0.984375;
}

const EASES = {
  smooth: (u) => u * u * (3 - 2 * u),
  linear: (u) => u,
  snap: (u) => 1 - Math.pow(1 - u, 4),                      // fast out, gentle landing
  pop: (u) => 1 + 2.70158 * Math.pow(u - 1, 3) + 1.70158 * Math.pow(u - 1, 2), // overshoots
  bounce: bounceOut,
  elastic: (u) =>
    u === 0 || u === 1 ? u : Math.pow(2, -10 * u) * Math.sin((u * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1,
};

const EASE_NAMES = [
  ["smooth", "Smooth"], ["snap", "Snappy"], ["pop", "Pop"],
  ["bounce", "Bouncy"], ["elastic", "Springy"], ["linear", "Steady"],
];

const EFFECT_NAMES = [
  ["none", "None"], ["float", "Float"], ["spin", "Spin"],
  ["wiggle", "Wiggle"], ["pulse", "Pulse"], ["sway", "Sway"],
];

const K = (t, x, y, scale = 1, rot = 0, opacity = 1, squash = 1) => ({ t, x, y, scale, rot, opacity, squash });

/* Each preset returns a whole movement: the keyframes plus the easing,
   path and effect that make it read the way its name suggests. */
const PRESETS = {
  "Pop in": (d, p) => ({
    ease: "pop",
    keys: [
      K(0, p.x, p.y, 0.2, -12, 0),
      K(Math.min(0.7, d * 0.25), p.x, p.y, 1, 0, 1),
      K(d, p.x, p.y, 1, 0, 1),
    ],
  }),
  "Fly across": (d) => ({
    ease: "smooth",
    keys: [K(0, -18, 50, 0.9, -8), K(d * 0.5, 50, 44, 1.15, 0), K(d, 118, 50, 0.9, 8)],
  }),
  Bounce: (d, p) => ({
    ease: "bounce",
    keys: [
      K(0, p.x, 14, 1, 0, 1, 1.12),
      K(d * 0.3, p.x, 74, 1, 0, 1, 0.8),
      K(d * 0.36, p.x, 70, 1, 0, 1, 1.06),
      K(d * 0.65, p.x, 34, 1, 0, 1, 1.06),
      K(d * 0.9, p.x, 74, 1, 0, 1, 0.85),
      K(d, p.x, 70, 1, 0, 1, 1),
    ],
  }),
  Orbit: (d, p) => ({
    ease: "linear",
    path: "curve",
    keys: [
      K(0, p.x + 26, p.y, 1),
      K(d * 0.25, p.x, p.y - 26, 1.1),
      K(d * 0.5, p.x - 26, p.y, 1),
      K(d * 0.75, p.x, p.y + 26, 0.9),
      K(d, p.x + 26, p.y, 1),
    ],
  }),
  "Zoom punch": (d, p) => ({
    ease: "snap",
    keys: [
      K(0, p.x, p.y, 0.1, -20, 0),
      K(d * 0.18, p.x, p.y, 1.45, 4, 1),
      K(d * 0.3, p.x, p.y, 1, 0, 1),
      K(d, p.x, p.y, 1, 0, 1),
    ],
  }),
  Wobble: (d, p) => ({
    ease: "elastic",
    keys: [
      K(0, p.x, p.y, 1, -14),
      K(d * 0.35, p.x, p.y, 1, 14),
      K(d * 0.7, p.x, p.y, 1, -8),
      K(d, p.x, p.y, 1, 0),
    ],
  }),
  Drift: (d, p) => ({
    ease: "smooth",
    path: "curve",
    effect: "float",
    keys: [
      K(0, 16, p.y + 12, 0.85, -6),
      K(d * 0.4, 42, p.y - 14, 1.05, 3),
      K(d * 0.75, 68, p.y + 8, 1, -3),
      K(d, 86, p.y - 6, 0.9, 5),
    ],
  }),
  "Fade in": (d, p) => ({
    ease: "smooth",
    keys: [
      K(0, p.x, p.y + 6, 0.86, 0, 0),
      K(Math.min(1.4, d * 0.35), p.x, p.y, 1, 0, 1),
      K(d, p.x, p.y, 1, 0, 1),
    ],
  }),
  "Stand still": (d, p) => ({ ease: "smooth", path: "straight", effect: "none", keys: [K(0, p.x, p.y)] }),
};

export function mount(root, project, api, opts = {}) {
  const c = project.content;
  c.duration = c.duration || 6;
  c.fps = c.fps || 30;
  c.bg = c.bg || "#0b1220";
  c.layers = c.layers || [];

  root.innerHTML = `
    <div class="tools">
      <div class="tgroup">
        <div class="tlabel">Add a layer</div>
        <div class="trow">
          <button class="btn" id="add-photo">🖼 Photo</button>
          <button class="btn" id="add-web">🌐 Web image</button>
        </div>
        <div class="trow">
          <button class="btn" id="add-video">🎥 Video</button>
          <button class="btn" id="add-text">🔤 Text</button>
        </div>
        <div class="trow">
          <button class="btn" id="add-obj">🧊 3D model</button>
          <button class="btn" id="add-objfile">📁 .obj file</button>
        </div>
        <input type="file" id="photo-file" accept="image/*" hidden />
        <input type="file" id="video-file" accept="video/*" hidden />
        <input type="file" id="obj-file" accept=".obj,text/plain" hidden />
        <div class="tlabel" style="margin-top:6px">Stickers</div>
        <div class="trow" id="stickers"></div>
      </div>
      <div class="tgroup">
        <div class="tlabel">Layers</div>
        <div class="list" id="layers"></div>
      </div>
      <div class="tgroup">
        <div class="tlabel">Background</div>
        <div class="swatches" id="bgs"></div>
      </div>
      <div class="tgroup">
        <div class="tlabel">Movie</div>
        <div class="field"><label>Seconds</label><input type="number" id="dur" min="1" max="60" step="1"></div>
        <div class="field"><label>FPS</label><input type="number" id="fps" min="5" max="60" step="1"></div>
        <button class="btn" id="export-video">⬇ Export video</button>
        <button class="btn" id="export-frame">⬇ Save this frame</button>
      </div>
    </div>

    <div class="stage">
      <div style="flex:1;display:grid;place-items:center;padding:16px;min-height:0">
        <canvas id="anim" style="max-width:100%;max-height:100%;border-radius:10px;box-shadow:var(--shadow)"></canvas>
      </div>
      <div class="timeline">
        <div class="tl-controls">
          <button class="btn sm" id="play">▶ Play</button>
          <button class="btn sm" id="stop">⏹ Stop</button>
          <input type="range" id="scrub" min="0" step="0.01" style="flex:1;min-width:160px">
          <span class="num-out" id="time-out">0.0s</span>
          <button class="btn sm" id="add-key">◆ Add keyframe</button>
          <button class="btn sm" id="del-key">Remove keyframe</button>
          <button class="btn sm" id="loop">🔁 Loop: on</button>
        </div>
        <div id="tracks"></div>
        <div class="tgroup" id="layer-props" hidden>
          <div class="tlabel">Ready-made movements</div>
          <div class="trow presets">
            ${Object.keys(PRESETS).map((n) => `<button class="btn sm" data-preset="${n}">${n}</button>`).join("")}
          </div>
          <div class="tlabel">How it moves</div>
          <div class="trow">
            <label class="pick-field">Style
              <select id="p-ease">${EASE_NAMES.map(([v, n]) => `<option value="${v}">${n}</option>`).join("")}</select>
            </label>
            <label class="pick-field">Always
              <select id="p-effect">${EFFECT_NAMES.map(([v, n]) => `<option value="${v}">${n}</option>`).join("")}</select>
            </label>
            <label class="pick-field">Path
              <select id="p-path"><option value="straight">Straight</option><option value="curve">Curved</option></select>
            </label>
            <button class="btn sm" id="p-trail">✨ Trail: off</button>
          </div>
          <div class="tlabel">Selected layer at this moment</div>
          <div class="field"><label>Across</label><input type="range" id="p-x" min="-20" max="120" step="0.5"><span class="num-out" id="o-x"></span></div>
          <div class="field"><label>Down</label><input type="range" id="p-y" min="-20" max="120" step="0.5"><span class="num-out" id="o-y"></span></div>
          <div class="field"><label>Size</label><input type="range" id="p-s" min="0.05" max="4" step="0.01"><span class="num-out" id="o-s"></span></div>
          <div class="field"><label>Turn</label><input type="range" id="p-r" min="-720" max="720" step="1"><span class="num-out" id="o-r"></span></div>
          <div class="field"><label>Fade</label><input type="range" id="p-o" min="0" max="1" step="0.01"><span class="num-out" id="o-o"></span></div>
        </div>
      </div>
    </div>`;

  const $ = (s) => root.querySelector(s);
  const canvas = $("#anim");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  const saveSoon = debounce(() => api.save(c), 500);

  let time = 0, playing = false, looping = true, selectedId = null, raf = 0, last = performance.now();
  const media = new Map();      // layer id -> HTMLImageElement | HTMLVideoElement
  const viewers = new Map();    // layer id -> { canvas, viewer }

  /* ---------------- layer helpers ---------------- */
  const uid = () => "l" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const selected = () => c.layers.find((l) => l.id === selectedId) || null;

  function addLayer(layer) {
    layer.id = uid();
    // stagger new layers so they don't land on the same spot, and give them a
    // pop-in straight away — adding something should never sit there doing nothing
    const n = c.layers.length;
    const spot = { x: 50 + ((n % 3) - 1) * 16, y: 50 + ((Math.floor(n / 3) % 3) - 1) * 16 };
    if (!layer.keys) {
      const preset = PRESETS["Pop in"](c.duration, spot);
      layer.keys = preset.keys.map((k) => ({ ...k, t: Math.min(c.duration, k.t + n * 0.18) }));
      layer.keys[0].t = Math.max(0, n * 0.18);
      if (n) layer.keys.unshift({ ...preset.keys[0], t: 0, opacity: 0 });
      layer.ease = layer.ease || preset.ease;
    }
    c.layers.push(layer);
    selectedId = layer.id;
    prepareLayer(layer);
    // Every layer starts its pop-in from nothing, so at t = 0 it is invisible.
    // Land the playhead on the moment it has finished arriving, otherwise you
    // add a sticker and the stage just sits there looking empty.
    goTo(arrivalTime(layer));
    renderLayers();
    renderTracks();
    saveSoon();
  }

  /** The first moment a layer is fully visible. */
  function arrivalTime(layer) {
    const shown = (layer.keys || []).find((k) => (k.opacity ?? 1) >= 0.99);
    return Math.min(c.duration, shown ? shown.t : 0);
  }

  function prepareLayer(l) {
    if (l.kind === "image" && l.src && !media.has(l.id)) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = l.src;
      media.set(l.id, img);
    }
    if (l.kind === "video" && l.src && !media.has(l.id)) {
      const v = document.createElement("video");
      v.src = l.src;
      v.crossOrigin = "anonymous";
      v.muted = true;
      v.loop = true;
      v.playsInline = true;
      media.set(l.id, v);
    }
    if (l.kind === "obj" && !viewers.has(l.id)) {
      const cv = document.createElement("canvas");
      cv.width = 512;
      cv.height = 512;
      try {
        const viewer = createViewer(cv, { color: l.color || "#6ea8fe", transparent: true });
        viewer.setMesh(l.obj ? parseOBJ(l.obj) : (primitives[l.shape] || primitives.cube)());
        viewer.state.autoSpin = false;
        viewers.set(l.id, { canvas: cv, viewer });
      } catch (e) {
        api.toast("3D layer unavailable: " + e.message);
      }
    }
  }

  c.layers.forEach(prepareLayer);

  /* ---------------- keyframes ----------------
     Movement quality comes from three things stacked on top of each other:
       1. the easing curve used between two keyframes
       2. an optional curved (spline) path through three or more keyframes
       3. a continuous effect layered on top of the whole thing
  ------------------------------------------------------------------- */
  function sample(l, t) {
    const keys = (l.keys || []).slice().sort((a, b) => a.t - b.t);
    if (!keys.length) return withEffect(l, { x: 50, y: 50, scale: 1, rot: 0, opacity: 1 }, t);
    if (keys.length === 1 || t <= keys[0].t) return withEffect(l, { ...keys[0] }, t);
    if (t >= keys[keys.length - 1].t) return withEffect(l, { ...keys[keys.length - 1] }, t);

    const ease = EASES[l.ease] || EASES.smooth;

    for (let i = 0; i < keys.length - 1; i++) {
      const a = keys[i], b = keys[i + 1];
      if (t < a.t || t > b.t) continue;
      const u = (t - a.t) / (b.t - a.t || 1);
      const e = ease(u);

      // curved path: run the position through a Catmull-Rom spline so a layer
      // sweeps through its keyframes instead of turning hard corners
      let x, y;
      if (l.path === "curve" && keys.length > 2) {
        const p0 = keys[Math.max(0, i - 1)], p3 = keys[Math.min(keys.length - 1, i + 2)];
        x = catmull(p0.x, a.x, b.x, p3.x, e);
        y = catmull(p0.y, a.y, b.y, p3.y, e);
      } else {
        x = lerp(a.x, b.x, e);
        y = lerp(a.y, b.y, e);
      }

      return withEffect(l, {
        x, y,
        scale: lerp(a.scale, b.scale, e),
        rot: lerp(a.rot, b.rot, e),
        opacity: lerp(a.opacity ?? 1, b.opacity ?? 1, e),
        squash: lerp(a.squash ?? 1, b.squash ?? 1, e),
      }, t);
    }
    return withEffect(l, { ...keys[keys.length - 1] }, t);
  }

  /** Continuous motion added on top of the keyframes — free life for any layer. */
  function withEffect(l, s, t) {
    s.squash = s.squash ?? 1;
    switch (l.effect) {
      case "spin": s.rot += t * 90; break;
      case "float": s.y += Math.sin(t * 2.2) * 3; s.rot += Math.sin(t * 1.1) * 3; break;
      case "wiggle": s.rot += Math.sin(t * 9) * 7; break;
      case "pulse": s.scale *= 1 + Math.sin(t * 3.4) * 0.09; break;
      case "sway": s.x += Math.sin(t * 1.6) * 4; s.rot += Math.sin(t * 1.6) * 5; break;
    }
    return s;
  }

  const lerp = (a, b, u) => a + (b - a) * u;
  const catmull = (p0, p1, p2, p3, u) => {
    const u2 = u * u, u3 = u2 * u;
    return 0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3);
  };

  function keyAt(l, t) {
    return (l.keys || []).find((k) => Math.abs(k.t - t) < 0.06) || null;
  }

  $("#add-key").onclick = () => {
    const l = selected();
    if (!l) return api.toast("Pick a layer first.");
    const cur = sample(l, time);
    const existing = keyAt(l, time);
    if (existing) Object.assign(existing, cur, { t: time });
    else l.keys.push({ ...cur, t: +time.toFixed(2) });
    l.keys.sort((a, b) => a.t - b.t);
    renderTracks();
    saveSoon();
    api.toast("Keyframe added at " + time.toFixed(1) + "s");
  };
  $("#del-key").onclick = () => {
    const l = selected();
    if (!l) return;
    const k = keyAt(l, time);
    if (!k) return api.toast("No keyframe at this moment.");
    if (l.keys.length === 1) return api.toast("A layer needs at least one keyframe.");
    l.keys = l.keys.filter((x) => x !== k);
    renderTracks();
    saveSoon();
  };

  /* ---------------- drawing ---------------- */
  function drawFrame(t) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.fillStyle = c.bg;
    ctx.fillRect(0, 0, W, H);

    for (const l of c.layers) {
      if (l.hidden) continue;
      // motion trail: a few faded copies from just before now
      if (l.trail) {
        for (let g = 4; g >= 1; g--) {
          const gt = t - g * 0.055;
          if (gt < 0) continue;
          paintLayer(l, sample(l, gt), gt, 0.13 * (1 - g / 5.5));
        }
      }
      paintLayer(l, sample(l, t), t, 1);
    }
  }

  /** Draws one layer for one moment. `fade` scales opacity (used by trails). */
  function paintLayer(l, s, t, fade) {
    const alpha = Math.max(0, Math.min(1, (s.opacity ?? 1) * fade));
    if (alpha <= 0.002 || s.scale <= 0) return;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate((s.x / 100) * W, (s.y / 100) * H);
    ctx.rotate((s.rot * Math.PI) / 180);
    // squash & stretch — wider when squashed, taller when stretched
    const q = s.squash ?? 1;
    ctx.scale(s.scale * (2 - q), s.scale * q);

    if (l.kind === "sticker") {
      ctx.font = `${l.size || 160}px serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = "rgba(0,0,0,.35)";
      ctx.shadowBlur = 18;
      ctx.shadowOffsetY = 6;
      ctx.fillText(l.text, 0, 0);
    } else if (l.kind === "text") {
      const size = l.size || 64;
      ctx.font = `800 ${size}px -apple-system, Segoe UI, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const lines = String(l.text || "").split("\n");
      lines.forEach((line, i) => {
        const y = (i - (lines.length - 1) / 2) * size * 1.15;
        if (l.outline !== false) {
          // dark halo so light text still reads on a light background, and vice versa
          ctx.lineJoin = "round";
          ctx.lineWidth = Math.max(4, size * 0.11);
          ctx.strokeStyle = isLight(l.color || "#ffffff") ? "rgba(8,12,20,.55)" : "rgba(255,255,255,.5)";
          ctx.strokeText(line, 0, y);
        }
        ctx.fillStyle = l.color || "#ffffff";
        ctx.fillText(line, 0, y);
      });
    } else if (l.kind === "image" || l.kind === "video") {
      const m = media.get(l.id);
      const ready = l.kind === "image" ? m?.complete && m.naturalWidth : m?.readyState >= 2;
      if (ready) {
        const nw = l.kind === "image" ? m.naturalWidth : m.videoWidth;
        const nh = l.kind === "image" ? m.naturalHeight : m.videoHeight;
        const fit = Math.min((W * 0.6) / nw, (H * 0.6) / nh);
        ctx.drawImage(m, (-nw * fit) / 2, (-nh * fit) / 2, nw * fit, nh * fit);
      }
    } else if (l.kind === "obj") {
      const v = viewers.get(l.id);
      if (v) {
        v.viewer.state.rotY = (l.spin === false ? 0 : t * 1.2) + (s.rot * Math.PI) / 180;
        v.viewer.state.color = l.color || "#6ea8fe";
        v.viewer.draw(t);
        const size = 460;
        ctx.drawImage(v.canvas, -size / 2, -size / 2, size, size);
      }
    }
    ctx.restore();
  }

  /* ---------------- playback ---------------- */
  function tick(now) {
    const dt = Math.min((now - last) / 1000, 0.06);
    last = now;
    if (playing) {
      time += dt;
      if (time >= c.duration) {
        if (looping) { time = 0; syncVideos(true); }
        else { time = c.duration; setPlaying(false); }
      }
      $("#scrub").value = time;
      $("#time-out").textContent = time.toFixed(1) + "s";
      renderPlayhead();
    }
    drawFrame(time);
    raf = requestAnimationFrame(tick);
  }
  raf = requestAnimationFrame(tick);

  function setPlaying(on) {
    playing = on;
    $("#play").textContent = on ? "⏸ Pause" : "▶ Play";
    for (const l of c.layers) {
      if (l.kind !== "video") continue;
      const v = media.get(l.id);
      if (!v) continue;
      on ? v.play().catch(() => {}) : v.pause();
    }
  }
  function syncVideos(reset) {
    for (const l of c.layers) {
      if (l.kind !== "video") continue;
      const v = media.get(l.id);
      if (v && v.readyState >= 1) v.currentTime = reset ? 0 : Math.min(time, v.duration || time);
    }
  }

  $("#play").onclick = () => setPlaying(!playing);
  $("#stop").onclick = () => { setPlaying(false); time = 0; $("#scrub").value = 0; syncVideos(true); renderPlayhead(); };
  $("#loop").onclick = (e) => { looping = !looping; e.target.textContent = "🔁 Loop: " + (looping ? "on" : "off"); };

  const scrub = $("#scrub");
  scrub.max = c.duration;
  scrub.oninput = () => {
    time = +scrub.value;
    $("#time-out").textContent = time.toFixed(1) + "s";
    syncVideos(false);
    renderPlayhead();
    renderProps();
  };

  /** Moves the playhead and everything that follows it. */
  function goTo(t) {
    time = Math.max(0, Math.min(c.duration, t));
    scrub.value = time;
    $("#time-out").textContent = time.toFixed(1) + "s";
    syncVideos(false);
    renderPlayhead();
  }

  /* ---------------- layer list + tracks ---------------- */
  function renderLayers() {
    const host = $("#layers");
    host.innerHTML = "";
    c.layers.forEach((l) => {
      const row = document.createElement("div");
      row.className = "list-item" + (l.id === selectedId ? " active" : "");
      row.innerHTML = `<span>${icon(l)}</span><span style="flex:1;overflow:hidden;text-overflow:ellipsis">${escapeHtml(l.name || l.kind)}</span>
        <span class="x" data-up title="Bring forward">▲</span><span class="x" data-down title="Send back">▼</span>
        <span class="x" data-eye title="Show/hide">${l.hidden ? "🚫" : "👁"}</span><span class="x" data-del title="Delete">✕</span>`;
      row.onclick = (e) => {
        const i = c.layers.indexOf(l);
        // touching any part of a row selects it, so the controls below always
        // belong to the layer you just poked
        if (e.target.dataset.del === undefined) selectedId = l.id;
        if (e.target.dataset.del !== undefined) {
          c.layers = c.layers.filter((x) => x !== l);
          media.delete(l.id);
          viewers.delete(l.id);
          if (selectedId === l.id) selectedId = null;
        } else if (e.target.dataset.eye !== undefined) {
          l.hidden = !l.hidden;
        } else if (e.target.dataset.up !== undefined) {
          if (i < c.layers.length - 1) c.layers.splice(i + 1, 0, c.layers.splice(i, 1)[0]);
        } else if (e.target.dataset.down !== undefined) {
          if (i > 0) c.layers.splice(i - 1, 0, c.layers.splice(i, 1)[0]);
        } else selectedId = l.id;
        renderLayers();
        renderTracks();
        renderProps();
        saveSoon();
      };
      host.append(row);
    });
    renderProps();
  }

  const icon = (l) => ({ image: "🖼", video: "🎥", sticker: "😀", text: "🔤", obj: "🧊" }[l.kind] || "◆");

  function renderTracks() {
    const host = $("#tracks");
    host.innerHTML = "";
    c.layers.forEach((l) => {
      const row = document.createElement("div");
      row.className = "tl-track";
      const name = document.createElement("div");
      name.className = "tl-name" + (l.id === selectedId ? " active" : "");
      name.textContent = `${icon(l)} ${l.name || l.kind}`;
      name.onclick = () => { selectedId = l.id; renderLayers(); renderTracks(); };
      const bar = document.createElement("div");
      bar.className = "tl-bar";
      (l.keys || []).forEach((k) => {
        const d = document.createElement("div");
        d.className = "kf" + (Math.abs(k.t - time) < 0.06 ? " sel" : "");
        d.style.left = (k.t / c.duration) * 100 + "%";
        d.title = k.t.toFixed(2) + "s — drag me";
        d.onmousedown = (e) => {
          e.preventDefault();
          e.stopPropagation();
          selectedId = l.id;
          const rect = bar.getBoundingClientRect();
          const mv = (m) => {
            k.t = Math.max(0, Math.min(c.duration, ((m.clientX - rect.left) / rect.width) * c.duration));
            d.style.left = (k.t / c.duration) * 100 + "%";
          };
          const up = () => {
            window.removeEventListener("mousemove", mv);
            window.removeEventListener("mouseup", up);
            l.keys.sort((a, b) => a.t - b.t);
            renderTracks();
            saveSoon();
          };
          window.addEventListener("mousemove", mv);
          window.addEventListener("mouseup", up);
        };
        bar.append(d);
      });
      bar.onclick = (e) => {
        if (e.target !== bar) return;
        const rect = bar.getBoundingClientRect();
        time = ((e.clientX - rect.left) / rect.width) * c.duration;
        scrub.value = time;
        $("#time-out").textContent = time.toFixed(1) + "s";
        syncVideos(false);
        renderPlayhead();
        renderProps();
      };
      const head = document.createElement("div");
      head.className = "playhead";
      head.dataset.head = "1";
      bar.append(head);
      row.append(name, bar);
      host.append(row);
    });
    renderPlayhead();
  }

  function renderPlayhead() {
    root.querySelectorAll("[data-head]").forEach((h) => (h.style.left = (time / c.duration) * 100 + "%"));
  }

  /* ---------------- per-layer property sliders ---------------- */
  function renderProps() {
    const l = selected();
    $("#layer-props").hidden = !l;
    if (!l) return;
    const s = sample(l, time);
    setSlider("#p-x", "#o-x", s.x, 1);
    setSlider("#p-y", "#o-y", s.y, 1);
    setSlider("#p-s", "#o-s", s.scale, 2);
    setSlider("#p-r", "#o-r", s.rot, 0);
    setSlider("#p-o", "#o-o", s.opacity ?? 1, 2);
    $("#p-ease").value = l.ease || "smooth";
    $("#p-effect").value = l.effect || "none";
    $("#p-path").value = l.path || "straight";
    $("#p-trail").textContent = "✨ Trail: " + (l.trail ? "on" : "off");
    $("#p-trail").classList.toggle("active", !!l.trail);
  }

  const onLayerField = (sel, prop) => {
    $(sel).onchange = () => {
      const l = selected();
      if (!l) return;
      l[prop] = $(sel).value;
      saveSoon();
    };
  };
  onLayerField("#p-ease", "ease");
  onLayerField("#p-effect", "effect");
  onLayerField("#p-path", "path");

  $("#p-trail").onclick = () => {
    const l = selected();
    if (!l) return;
    l.trail = !l.trail;
    renderProps();
    saveSoon();
  };
  function setSlider(sel, out, val, dp) {
    const el = $(sel);
    el.value = val;
    $(out).textContent = (+val).toFixed(dp);
  }

  [["#p-x", "x", "#o-x", 1], ["#p-y", "y", "#o-y", 1], ["#p-s", "scale", "#o-s", 2],
   ["#p-r", "rot", "#o-r", 0], ["#p-o", "opacity", "#o-o", 2]].forEach(([sel, prop, out, dp]) => {
    $(sel).oninput = () => {
      const l = selected();
      if (!l) return;
      const v = +$(sel).value;
      $(out).textContent = v.toFixed(dp);
      let k = keyAt(l, time);
      if (!k) {
        k = { ...sample(l, time), t: +time.toFixed(2) };
        l.keys.push(k);
        l.keys.sort((a, b) => a.t - b.t);
        renderTracks();
      }
      k[prop] = v;
      saveSoon();
    };
  });

  /* ---------------- presets ---------------- */
  function applyPreset(name) {
    const l = selected();
    if (!l) return api.toast("Pick a layer first.");
    const here = sample(l, 0);
    const built = PRESETS[name](c.duration, { x: here.x, y: here.y });
    l.keys = built.keys;
    if (built.ease) l.ease = built.ease;
    if (built.path) l.path = built.path;
    if (built.effect !== undefined) l.effect = built.effect;
    renderTracks();
    renderProps();
    saveSoon();
    api.toast(name + " applied");
  }

  root.querySelectorAll("[data-preset]").forEach((b) => (b.onclick = () => applyPreset(b.dataset.preset)));

  /* ---------------- adding layers ---------------- */
  $("#add-photo").onclick = () => $("#photo-file").click();
  $("#photo-file").onchange = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => addLayer({ kind: "image", name: f.name.slice(0, 22), src: r.result });
    r.readAsDataURL(f);
    e.target.value = "";
  };
  $("#add-web").onclick = () => {
    const url = prompt("Paste the address of a picture from the internet:");
    if (url) addLayer({ kind: "image", name: "web image", src: url.trim() });
  };
  $("#add-video").onclick = () => $("#video-file").click();
  $("#video-file").onchange = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    if (f.size < 3_000_000) {
      const r = new FileReader();
      r.onload = () => addLayer({ kind: "video", name: f.name.slice(0, 22), src: r.result });
      r.readAsDataURL(f);
    } else {
      addLayer({ kind: "video", name: f.name.slice(0, 22), src: URL.createObjectURL(f), temp: true });
      api.toast("Big video: it plays now, but won't be saved for next time.");
    }
    e.target.value = "";
  };
  $("#add-text").onclick = () => {
    const t = prompt("What should it say?", "Hello class!");
    if (t) addLayer({ kind: "text", name: t.slice(0, 18), text: t, size: 72, color: "#ffffff" });
  };
  $("#add-obj").onclick = () => {
    const shape = prompt("Which shape? cube, sphere, torus, pyramid, cylinder, prism or octahedron", "torus");
    if (!shape) return;
    const key = primitives[shape.trim().toLowerCase()] ? shape.trim().toLowerCase() : "cube";
    addLayer({ kind: "obj", name: key, shape: key, color: "#6ea8fe", spin: true });
  };
  $("#add-objfile").onclick = () => $("#obj-file").click();
  $("#obj-file").onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const text = await f.text();
    try {
      parseOBJ(text);
      addLayer({ kind: "obj", name: f.name.slice(0, 20), obj: text, color: "#6ea8fe", spin: true });
    } catch (err) {
      api.toast("Could not read that .obj: " + err.message);
    }
    e.target.value = "";
  };
  const stickerRow = $("#stickers");
  STICKERS.forEach((s) => {
    const b = document.createElement("button");
    b.className = "btn";
    b.style.flex = "0 0 auto";
    b.style.minWidth = "34px";
    b.textContent = s;
    b.onclick = () => addLayer({ kind: "sticker", name: s + " sticker", text: s, size: 170 });
    stickerRow.append(b);
  });

  buildSwatches($("#bgs"), BG_COLORS, c.bg, (col) => { c.bg = col; saveSoon(); });

  const dur = $("#dur");
  dur.value = c.duration;
  dur.onchange = () => {
    c.duration = Math.max(1, Math.min(60, +dur.value || 6));
    dur.value = c.duration;
    scrub.max = c.duration;
    renderTracks();
    saveSoon();
  };
  const fps = $("#fps");
  fps.value = c.fps;
  fps.onchange = () => { c.fps = Math.max(5, Math.min(60, +fps.value || 30)); fps.value = c.fps; saveSoon(); };

  /* ---------------- export ---------------- */
  $("#export-frame").onclick = () => {
    drawFrame(time);
    canvas.toBlob((b) => download(b, `${project.name.replace(/\s+/g, "_")}_${time.toFixed(1)}s.png`));
  };

  $("#export-video").onclick = async () => {
    if (!canvas.captureStream || typeof MediaRecorder === "undefined")
      return api.toast("This browser can't record video — use 'Save this frame' instead.");
    const btn = $("#export-video");
    btn.disabled = true;
    btn.textContent = "● Recording…";
    setPlaying(false);
    time = 0;
    syncVideos(true);

    const stream = canvas.captureStream(c.fps);
    const mime = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find((m) => MediaRecorder.isTypeSupported(m));
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const chunks = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      download(new Blob(chunks, { type: "video/webm" }), project.name.replace(/\s+/g, "_") + ".webm");
      btn.disabled = false;
      btn.textContent = "⬇ Export video";
      api.toast("Video saved 🎬");
    };
    rec.start();
    setPlaying(true);
    const wasLooping = looping;
    looping = false;
    await new Promise((r) => setTimeout(r, (c.duration + 0.3) * 1000));
    setPlaying(false);
    looping = wasLooping;
    rec.stop();
  };

  /* ---------------- boot ---------------- */
  renderLayers();
  renderTracks();
  drawFrame(0);

  if (opts.present) {
    // play it on a loop; clicking the picture pauses and resumes
    looping = true;
    canvas.style.cursor = "pointer";
    canvas.onclick = () => setPlaying(!playing);
    setPlaying(true);
  } else if (!c.layers.length) {
    api.toast("Add a photo, sticker, video or 3D model to get started.");
  }

  return {
    destroy() {
      cancelAnimationFrame(raf);
      setPlaying(false);
      for (const [, v] of viewers) v.viewer.stop();
      api.save(c);
    },
  };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

/** Used to pick a contrasting halo colour for text. */
function isLight(hex) {
  const h = String(hex).replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((x) => x + x).join("") : h, 16);
  if (Number.isNaN(n)) return true;
  return ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114 > 140;
}
