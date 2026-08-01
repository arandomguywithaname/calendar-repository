/* ===========================================================
   animation.js — timeline animation.
   Layers can be photos, web images, videos, stickers, text or a
   spinning 3D model. Every layer has keyframes for position,
   size, spin and fade, and the whole thing exports to video.
   =========================================================== */

import { debounce, download, buildSwatches } from "./threed.js";
import { createViewer, primitives, parseOBJ } from "../gl.js";

const STICKERS = ["🚀", "⭐", "📐", "🔢", "🍕", "🎯", "🐢", "💡", "🧮", "➗", "✖️", "🎈", "🪐", "🔺", "⭕", "✅"];
const BG_COLORS = ["#0b1220", "#05060f", "#111827", "#ffffff", "#f1f5f9", "#1e1b34", "#0f2419"];
const W = 1280, H = 720;

export function mount(root, project, api) {
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
          <div class="tlabel">Selected layer at this moment</div>
          <div class="field"><label>Across</label><input type="range" id="p-x" min="-20" max="120" step="0.5"><span class="num-out" id="o-x"></span></div>
          <div class="field"><label>Down</label><input type="range" id="p-y" min="-20" max="120" step="0.5"><span class="num-out" id="o-y"></span></div>
          <div class="field"><label>Size</label><input type="range" id="p-s" min="0.05" max="4" step="0.01"><span class="num-out" id="o-s"></span></div>
          <div class="field"><label>Turn</label><input type="range" id="p-r" min="-720" max="720" step="1"><span class="num-out" id="o-r"></span></div>
          <div class="field"><label>Fade</label><input type="range" id="p-o" min="0" max="1" step="0.01"><span class="num-out" id="o-o"></span></div>
          <div class="trow">
            <button class="btn sm" id="preset-fly">Fly in</button>
            <button class="btn sm" id="preset-spin">Spin</button>
            <button class="btn sm" id="preset-bounce">Bounce</button>
            <button class="btn sm" id="preset-fade">Fade in</button>
            <button class="btn sm" id="preset-clear">Clear keys</button>
          </div>
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
    // stagger new layers a little so they don't all land on the same spot
    const n = c.layers.length;
    layer.keys = layer.keys || [
      { t: 0, x: 50 + ((n % 3) - 1) * 16, y: 50 + (Math.floor(n / 3) % 3 - 1) * 16, scale: 1, rot: 0, opacity: 1 },
    ];
    c.layers.push(layer);
    selectedId = layer.id;
    prepareLayer(layer);
    renderLayers();
    renderTracks();
    saveSoon();
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

  /* ---------------- keyframes ---------------- */
  function sample(l, t) {
    const keys = (l.keys || []).slice().sort((a, b) => a.t - b.t);
    if (!keys.length) return { x: 50, y: 50, scale: 1, rot: 0, opacity: 1 };
    if (t <= keys[0].t) return { ...keys[0] };
    if (t >= keys[keys.length - 1].t) return { ...keys[keys.length - 1] };
    for (let i = 0; i < keys.length - 1; i++) {
      const a = keys[i], b = keys[i + 1];
      if (t >= a.t && t <= b.t) {
        const u = (t - a.t) / (b.t - a.t || 1);
        const e = u * u * (3 - 2 * u);            // smooth in/out
        return {
          x: lerp(a.x, b.x, e), y: lerp(a.y, b.y, e),
          scale: lerp(a.scale, b.scale, e), rot: lerp(a.rot, b.rot, e),
          opacity: lerp(a.opacity ?? 1, b.opacity ?? 1, e),
        };
      }
    }
    return { ...keys[keys.length - 1] };
  }
  const lerp = (a, b, u) => a + (b - a) * u;

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
    ctx.fillStyle = c.bg;
    ctx.fillRect(0, 0, W, H);

    for (const l of c.layers) {
      if (l.hidden) continue;
      const s = sample(l, t);
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, s.opacity ?? 1));
      ctx.translate((s.x / 100) * W, (s.y / 100) * H);
      ctx.rotate((s.rot * Math.PI) / 180);
      ctx.scale(s.scale, s.scale);

      if (l.kind === "sticker") {
        ctx.font = `${l.size || 160}px serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(l.text, 0, 0);
      } else if (l.kind === "text") {
        ctx.font = `700 ${l.size || 64}px -apple-system, Segoe UI, sans-serif`;
        ctx.fillStyle = l.color || "#ffffff";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(l.text || "", 0, 0);
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

  /* ---------------- layer list + tracks ---------------- */
  function renderLayers() {
    const host = $("#layers");
    host.innerHTML = "";
    c.layers.forEach((l) => {
      const row = document.createElement("div");
      row.className = "list-item" + (l.id === selectedId ? " active" : "");
      row.innerHTML = `<span>${icon(l)}</span><span style="flex:1;overflow:hidden;text-overflow:ellipsis">${escapeHtml(l.name || l.kind)}</span>
        <span class="x" data-eye title="Show/hide">${l.hidden ? "🚫" : "👁"}</span><span class="x" data-del title="Delete">✕</span>`;
      row.onclick = (e) => {
        if (e.target.dataset.del !== undefined) {
          c.layers = c.layers.filter((x) => x !== l);
          media.delete(l.id);
          viewers.delete(l.id);
          if (selectedId === l.id) selectedId = null;
        } else if (e.target.dataset.eye !== undefined) {
          l.hidden = !l.hidden;
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
  }
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
  function setKeys(keys) {
    const l = selected();
    if (!l) return api.toast("Pick a layer first.");
    l.keys = keys;
    renderTracks();
    saveSoon();
  }
  $("#preset-fly").onclick = () => setKeys([
    { t: 0, x: -15, y: 50, scale: 1, rot: 0, opacity: 1 },
    { t: c.duration / 2, x: 50, y: 50, scale: 1.2, rot: 0, opacity: 1 },
    { t: c.duration, x: 115, y: 50, scale: 1, rot: 0, opacity: 1 },
  ]);
  $("#preset-spin").onclick = () => setKeys([
    { t: 0, x: 50, y: 50, scale: 1, rot: 0, opacity: 1 },
    { t: c.duration, x: 50, y: 50, scale: 1, rot: 360, opacity: 1 },
  ]);
  $("#preset-bounce").onclick = () => setKeys([
    { t: 0, x: 50, y: 20, scale: 1, rot: 0, opacity: 1 },
    { t: c.duration * 0.33, x: 50, y: 70, scale: 1.1, rot: 0, opacity: 1 },
    { t: c.duration * 0.66, x: 50, y: 30, scale: 1, rot: 0, opacity: 1 },
    { t: c.duration, x: 50, y: 70, scale: 1.1, rot: 0, opacity: 1 },
  ]);
  $("#preset-fade").onclick = () => setKeys([
    { t: 0, x: 50, y: 50, scale: 0.8, rot: 0, opacity: 0 },
    { t: Math.min(1.5, c.duration), x: 50, y: 50, scale: 1, rot: 0, opacity: 1 },
    { t: c.duration, x: 50, y: 50, scale: 1, rot: 0, opacity: 1 },
  ]);
  $("#preset-clear").onclick = () => setKeys([{ t: 0, x: 50, y: 50, scale: 1, rot: 0, opacity: 1 }]);

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
  if (!c.layers.length) api.toast("Add a photo, sticker, video or 3D model to get started.");

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
