/* ===========================================================
   whiteboard.js — the classroom whiteboard.
   Draw, type, stickers, shapes, photos, copy/paste, code blocks
   and playable games, all on a pannable, zoomable board.
   =========================================================== */

import { buildSwatches, debounce, download } from "./threed.js";

const PEN_COLORS = ["#e8eef7", "#6ea8fe", "#4ade80", "#fbbf24", "#f87171", "#a78bfa", "#fb923c", "#111827"];
const STICKERS = ["📐", "📏", "✏️", "🔢", "➗", "✖️", "🧮", "⭐", "✅", "❌", "❓", "💡", "🎯", "🍕", "🚀", "🐢"];
const TOOLS = [
  ["select", "🖱 Select"], ["pen", "✏️ Pen"], ["eraser", "🧽 Eraser"], ["text", "🔤 Text"],
  ["rect", "▭ Box"], ["ellipse", "◯ Circle"], ["line", "／ Line"], ["arrow", "➔ Arrow"], ["pan", "✋ Pan"],
];

export function mount(root, project, api, opts = {}) {
  const c = project.content;
  c.items = c.items || [];
  c.widgets = c.widgets || [];
  c.camera = c.camera || { x: 0, y: 0, z: 1 };

  root.innerHTML = `
    <div class="tools">
      <div class="tgroup">
        <div class="tlabel">Tools</div>
        <div class="trow" id="tools"></div>
      </div>
      <div class="tgroup">
        <div class="tlabel">Colour</div>
        <div class="swatches" id="colors"></div>
        <div class="field"><label>Size</label><input type="range" id="width" min="1" max="40" step="1"><span class="num-out" id="width-out"></span></div>
      </div>
      <div class="tgroup">
        <div class="tlabel">Stickers</div>
        <div class="trow" id="stickers"></div>
      </div>
      <div class="tgroup">
        <div class="tlabel">Put on the board</div>
        <div class="trow">
          <button class="btn" id="add-photo">🖼 Photo</button>
          <button class="btn" id="add-weburl">🌐 Web image</button>
        </div>
        <div class="trow">
          <button class="btn" id="add-code">💻 Code block</button>
        </div>
        <div class="trow">
          <button class="btn" id="add-tetris">🎮 Tetris</button>
          <button class="btn" id="add-blockoff">🧱 Blockoff</button>
        </div>
        <input type="file" id="photo-file" accept="image/*" hidden />
      </div>
      <div class="tgroup">
        <div class="tlabel">Board</div>
        <div class="trow">
          <button class="btn" id="zoom-out">–</button>
          <button class="btn" id="zoom-fit">Fit</button>
          <button class="btn" id="zoom-in">+</button>
        </div>
        <div class="trow">
          <button class="btn" id="undo">↶ Undo</button>
          <button class="btn danger" id="clear">Clear all</button>
        </div>
        <button class="btn" id="export-png">⬇ Download picture</button>
        <div class="mini">Ctrl+C / Ctrl+V copy &amp; paste · Ctrl+Z undo · Delete removes · space-drag or middle-drag pans · scroll zooms.</div>
      </div>
    </div>
    <div class="stage">
      <div class="wb-stage" id="wb">
        <canvas id="board"></canvas>
        <div class="wb-widgets" id="widgets"></div>
        <div class="wb-hud"><span id="hud-zoom">100%</span> · <span id="hud-tool">Pen</span> · <span id="hud-count"></span></div>
      </div>
    </div>`;

  const $ = (s) => root.querySelector(s);
  const stage = $("#wb");
  const canvas = $("#board");
  const ctx = canvas.getContext("2d");
  const widgetLayer = $("#widgets");

  let tool = "pen";
  let color = PEN_COLORS[0];
  let width = 4;
  let selection = new Set();
  let clipboard = [];
  const undoStack = [];
  const imgCache = new Map();
  const liveWidgets = new Map();      // widget id -> { el, game }

  const cam = c.camera;
  const saveSoon = debounce(() => api.save(c), 500);

  /* ---------------- coordinate helpers ---------------- */
  const toWorld = (sx, sy) => ({ x: (sx - cam.x) / cam.z, y: (sy - cam.y) / cam.z });
  const stagePoint = (e) => {
    const r = stage.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  /* ---------------- drawing ---------------- */
  let dirty = true;
  const scheduleDraw = () => { dirty = true; };

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = stage.clientWidth, h = stage.clientHeight;
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
    }
    scheduleDraw();
  }

  function draw() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const W = canvas.width / dpr, H = canvas.height / dpr;
    ctx.fillStyle = "#101722";
    ctx.fillRect(0, 0, W, H);

    // dot grid
    const step = 40 * cam.z;
    if (step > 10) {
      ctx.fillStyle = "rgba(255,255,255,.05)";
      const sx = cam.x % step, sy = cam.y % step;
      for (let x = sx; x < W; x += step)
        for (let y = sy; y < H; y += step) ctx.fillRect(x, y, 1.6, 1.6);
    }

    ctx.save();
    ctx.translate(cam.x, cam.y);
    ctx.scale(cam.z, cam.z);
    for (const it of c.items) drawItem(ctx, it);
    if (draft) drawItem(ctx, draft);
    // selection outlines
    ctx.lineWidth = 1.5 / cam.z;
    ctx.strokeStyle = "#6ea8fe";
    ctx.setLineDash([6 / cam.z, 4 / cam.z]);
    for (const id of selection) {
      const it = c.items.find((i) => i.id === id);
      if (!it) continue;
      const b = bbox(it);
      ctx.strokeRect(b.x - 6, b.y - 6, b.w + 12, b.h + 12);
    }
    if (band) {
      ctx.strokeStyle = "#a78bfa";
      ctx.strokeRect(band.x, band.y, band.w, band.h);
    }
    ctx.setLineDash([]);
    ctx.restore();

    $("#hud-zoom").textContent = Math.round(cam.z * 100) + "%";
    $("#hud-count").textContent = `${c.items.length + c.widgets.length} things`;
  }

  /** Draws one item onto any 2d context (screen canvas or the export canvas). */
  function drawItem(g, it) {
    g.lineCap = "round";
    g.lineJoin = "round";
    g.strokeStyle = it.color || "#e8eef7";
    g.fillStyle = it.color || "#e8eef7";
    g.lineWidth = it.width || 4;

    switch (it.kind) {
      case "stroke": {
        const p = it.points;
        if (!p || p.length < 1) return;
        g.beginPath();
        g.moveTo(p[0].x, p[0].y);
        for (let i = 1; i < p.length; i++) {
          const m = { x: (p[i - 1].x + p[i].x) / 2, y: (p[i - 1].y + p[i].y) / 2 };
          g.quadraticCurveTo(p[i - 1].x, p[i - 1].y, m.x, m.y);
        }
        g.lineTo(p[p.length - 1].x, p[p.length - 1].y);
        g.stroke();
        break;
      }
      case "rect":
        if (it.fill) g.fillRect(it.x, it.y, it.w, it.h);
        else g.strokeRect(it.x, it.y, it.w, it.h);
        break;
      case "ellipse":
        g.beginPath();
        g.ellipse(it.x + it.w / 2, it.y + it.h / 2, Math.abs(it.w / 2), Math.abs(it.h / 2), 0, 0, Math.PI * 2);
        it.fill ? g.fill() : g.stroke();
        break;
      case "line":
      case "arrow": {
        g.beginPath();
        g.moveTo(it.x, it.y);
        g.lineTo(it.x + it.w, it.y + it.h);
        g.stroke();
        if (it.kind === "arrow") {
          const a = Math.atan2(it.h, it.w), L = 10 + (it.width || 4) * 2;
          const tipX = it.x + it.w, tipY = it.y + it.h;
          g.beginPath();
          g.moveTo(tipX, tipY);
          g.lineTo(tipX - L * Math.cos(a - 0.4), tipY - L * Math.sin(a - 0.4));
          g.moveTo(tipX, tipY);
          g.lineTo(tipX - L * Math.cos(a + 0.4), tipY - L * Math.sin(a + 0.4));
          g.stroke();
        }
        break;
      }
      case "text": {
        g.font = `${it.bold ? "700 " : ""}${it.size || 28}px -apple-system, Segoe UI, sans-serif`;
        g.textBaseline = "top";
        (it.text || "").split("\n").forEach((ln, i) => g.fillText(ln, it.x, it.y + i * (it.size || 28) * 1.25));
        break;
      }
      case "sticker":
        g.font = `${it.size || 60}px serif`;
        g.textBaseline = "top";
        g.fillText(it.text, it.x, it.y);
        break;
      case "image": {
        const img = getImage(it.src);
        if (img && img.complete && img.naturalWidth) {
          if (!it.w) { it.w = 320; it.h = (img.naturalHeight / img.naturalWidth) * 320; }
          g.drawImage(img, it.x, it.y, it.w, it.h);
        } else {
          g.strokeStyle = "#64748b";
          g.strokeRect(it.x, it.y, it.w || 320, it.h || 200);
        }
        break;
      }
    }
  }

  function getImage(src) {
    if (!src) return null;
    if (imgCache.has(src)) return imgCache.get(src);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = scheduleDraw;
    img.onerror = scheduleDraw;
    img.src = src;
    imgCache.set(src, img);
    return img;
  }

  function bbox(it) {
    if (it.kind === "stroke") {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const p of it.points) {
        x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y);
        x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
      }
      return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    }
    if (it.kind === "text") {
      const lines = (it.text || "").split("\n");
      const size = it.size || 28;
      return { x: it.x, y: it.y, w: Math.max(...lines.map((l) => l.length)) * size * 0.55, h: lines.length * size * 1.25 };
    }
    if (it.kind === "sticker") return { x: it.x, y: it.y, w: it.size || 60, h: (it.size || 60) * 1.15 };
    const x = Math.min(it.x, it.x + (it.w || 0)), y = Math.min(it.y, it.y + (it.h || 0));
    return { x, y, w: Math.abs(it.w || 0), h: Math.abs(it.h || 0) };
  }

  const hit = (it, p) => {
    const b = bbox(it);
    const pad = it.kind === "line" || it.kind === "arrow" ? 12 : 8;
    return p.x >= b.x - pad && p.x <= b.x + b.w + pad && p.y >= b.y - pad && p.y <= b.y + b.h + pad;
  };

  function topItemAt(p) {
    for (let i = c.items.length - 1; i >= 0; i--) if (hit(c.items[i], p)) return c.items[i];
    return null;
  }

  /* ---------------- pointer interaction ---------------- */
  let draft = null, band = null, dragging = null, panning = null, spaceDown = false;

  stage.addEventListener("mousedown", (e) => {
    if (e.target.closest(".widget")) return;          // widgets handle themselves
    const sp = stagePoint(e);
    const p = toWorld(sp.x, sp.y);

    if (e.button === 1 || spaceDown || tool === "pan") {
      panning = { sx: sp.x, sy: sp.y, cx: cam.x, cy: cam.y };
      e.preventDefault();
      return;
    }

    if (tool === "select") {
      const it = topItemAt(p);
      if (it) {
        if (!e.shiftKey && !selection.has(it.id)) selection = new Set([it.id]);
        else selection.add(it.id);
        pushUndo();
        dragging = { start: p, items: [...selection].map((id) => c.items.find((i) => i.id === id)).filter(Boolean).map((i) => ({ it: i, snap: structuredClone(i) })) };
      } else {
        if (!e.shiftKey) selection = new Set();
        band = { x: p.x, y: p.y, w: 0, h: 0, ox: p.x, oy: p.y };
      }
      scheduleDraw();
      return;
    }

    if (tool === "eraser") {
      pushUndo();
      eraseAt(p);
      dragging = { erase: true };
      return;
    }

    if (tool === "text") {
      const it = { id: uid(), kind: "text", x: p.x, y: p.y, text: "", size: Math.max(16, width * 6), color, bold: false };
      pushUndo();
      c.items.push(it);
      editText(it);
      return;
    }

    if (tool === "pen") {
      pushUndo();
      draft = { id: uid(), kind: "stroke", points: [p], color, width };
      return;
    }

    // shapes
    pushUndo();
    draft = { id: uid(), kind: tool, x: p.x, y: p.y, w: 0, h: 0, color, width, fill: false };
  });

  window.addEventListener("mousemove", onMove);
  function onMove(e) {
    const sp = stagePoint(e);
    const p = toWorld(sp.x, sp.y);

    if (panning) {
      cam.x = panning.cx + (sp.x - panning.sx);
      cam.y = panning.cy + (sp.y - panning.sy);
      syncWidgets();
      scheduleDraw();
      return;
    }
    if (draft) {
      if (draft.kind === "stroke") draft.points.push(p);
      else { draft.w = p.x - draft.x; draft.h = p.y - draft.y; }
      scheduleDraw();
      return;
    }
    if (band) {
      band.x = Math.min(band.ox, p.x);
      band.y = Math.min(band.oy, p.y);
      band.w = Math.abs(p.x - band.ox);
      band.h = Math.abs(p.y - band.oy);
      scheduleDraw();
      return;
    }
    if (dragging?.erase) { eraseAt(p); return; }
    if (dragging) {
      const dx = p.x - dragging.start.x, dy = p.y - dragging.start.y;
      for (const { it, snap } of dragging.items) moveItem(it, snap, dx, dy);
      scheduleDraw();
    }
  }

  window.addEventListener("mouseup", () => {
    if (draft) {
      if (draft.kind !== "stroke" && Math.abs(draft.w) < 3 && Math.abs(draft.h) < 3) { /* ignore taps */ }
      else c.items.push(draft);
      draft = null;
      saveSoon();
      scheduleDraw();
    }
    if (band) {
      const sel = c.items.filter((it) => {
        const b = bbox(it);
        return b.x + b.w >= band.x && b.x <= band.x + band.w && b.y + b.h >= band.y && b.y <= band.y + band.h;
      });
      if (sel.length) selection = new Set(sel.map((i) => i.id));
      band = null;
      scheduleDraw();
    }
    if (dragging) { dragging = null; saveSoon(); }
    if (panning) { panning = null; saveSoon(); }
  });

  function moveItem(it, snap, dx, dy) {
    if (it.kind === "stroke") it.points = snap.points.map((q) => ({ x: q.x + dx, y: q.y + dy }));
    else { it.x = snap.x + dx; it.y = snap.y + dy; }
  }

  function eraseAt(p) {
    const before = c.items.length;
    c.items = c.items.filter((it) => !hit(it, p));
    if (c.items.length !== before) { scheduleDraw(); saveSoon(); }
  }

  stage.addEventListener("wheel", (e) => {
    e.preventDefault();
    const sp = stagePoint(e);
    const before = toWorld(sp.x, sp.y);
    const factor = Math.exp(-e.deltaY * 0.0015);
    cam.z = Math.max(0.15, Math.min(5, cam.z * factor));
    const after = toWorld(sp.x, sp.y);
    cam.x += (after.x - before.x) * cam.z;
    cam.y += (after.y - before.y) * cam.z;
    syncWidgets();
    scheduleDraw();
    saveSoon();
  }, { passive: false });

  /* ---------------- text editing ---------------- */
  function editText(it) {
    const ta = document.createElement("textarea");
    ta.value = it.text || "";
    Object.assign(ta.style, {
      position: "absolute",
      left: it.x * cam.z + cam.x + "px",
      top: it.y * cam.z + cam.y + "px",
      minWidth: "220px",
      minHeight: (it.size || 28) * 1.6 * cam.z + "px",
      fontSize: (it.size || 28) * cam.z + "px",
      color: it.color,
      background: "rgba(10,14,20,.92)",
      border: "1.5px solid var(--accent)",
      borderRadius: "8px",
      zIndex: 20,
      padding: "4px 6px",
      lineHeight: "1.25",
    });
    stage.append(ta);
    ta.focus();
    ta.select();
    const finish = () => {
      it.text = ta.value;
      ta.remove();
      if (!it.text.trim()) c.items = c.items.filter((x) => x !== it);
      scheduleDraw();
      saveSoon();
    };
    ta.addEventListener("blur", finish, { once: true });
    ta.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Escape") ta.blur();
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) ta.blur();
    });
  }

  stage.addEventListener("dblclick", (e) => {
    if (e.target.closest(".widget")) return;
    const sp = stagePoint(e);
    const it = topItemAt(toWorld(sp.x, sp.y));
    if (it && it.kind === "text") editText(it);
  });

  /* ---------------- widgets (code + games) ---------------- */
  function syncWidgets() {
    widgetLayer.style.transform = `translate(${cam.x}px, ${cam.y}px) scale(${cam.z})`;
  }

  function renderWidgets() {
    for (const [, w] of liveWidgets) { w.game?.destroy?.(); w.el.remove(); }
    liveWidgets.clear();
    c.widgets.forEach(mountWidget);
    syncWidgets();
  }

  function mountWidget(w) {
    const box = document.createElement("div");
    box.className = "widget";
    box.style.left = w.x + "px";
    box.style.top = w.y + "px";
    box.style.width = w.w + "px";
    const title = w.kind === "code" ? "💻 " + (w.lang || "code") : w.game === "tetris" ? "🎮 Tetris" : "🧱 Blockoff";
    box.innerHTML = `<div class="wbar"><span>${title}</span><span class="x" title="Remove">✕</span></div>`;
    const bar = box.querySelector(".wbar");

    let game = null;
    if (w.kind === "code") {
      const ta = document.createElement("textarea");
      ta.value = w.text || "";
      ta.style.height = w.h - 28 + "px";
      ta.spellcheck = false;
      ta.addEventListener("input", () => { w.text = ta.value; saveSoon(); });
      ta.addEventListener("keydown", (e) => {
        e.stopPropagation();
        if (e.key === "Tab") {
          e.preventDefault();
          const s = ta.selectionStart;
          ta.value = ta.value.slice(0, s) + "  " + ta.value.slice(ta.selectionEnd);
          ta.selectionStart = ta.selectionEnd = s + 2;
        }
      });
      box.append(ta);
    } else {
      const cv = document.createElement("canvas");
      cv.width = w.w;
      cv.height = w.h - 28;
      box.append(cv);
      import(w.game === "tetris" ? "../games/tetris.js" : "../games/blockoff.js").then((mod) => {
        game = mod.start(cv);
        liveWidgets.get(w.id).game = game;
      });
    }

    box.querySelector(".x").onclick = () => {
      pushUndo();
      c.widgets = c.widgets.filter((x) => x !== w);
      liveWidgets.get(w.id)?.game?.destroy?.();
      box.remove();
      liveWidgets.delete(w.id);
      saveSoon();
    };

    // drag by title bar
    bar.addEventListener("mousedown", (e) => {
      if (e.target.classList.contains("x")) return;
      e.preventDefault();
      e.stopPropagation();
      const sx = e.clientX, sy = e.clientY, ox = w.x, oy = w.y;
      const mv = (m) => {
        w.x = ox + (m.clientX - sx) / cam.z;
        w.y = oy + (m.clientY - sy) / cam.z;
        box.style.left = w.x + "px";
        box.style.top = w.y + "px";
      };
      const up = () => {
        window.removeEventListener("mousemove", mv);
        window.removeEventListener("mouseup", up);
        saveSoon();
      };
      window.addEventListener("mousemove", mv);
      window.addEventListener("mouseup", up);
    });

    // clicking a widget brings it to the front of the pile
    box.addEventListener("mousedown", () => {
      widgetLayer.append(box);
      c.widgets = c.widgets.filter((x) => x !== w).concat(w);
      saveSoon();
    }, true);

    widgetLayer.append(box);
    liveWidgets.set(w.id, { el: box, game });
  }

  function addWidget(w) {
    pushUndo();
    // cascade new widgets so they never land exactly on top of each other
    const step = (c.widgets.length % 6) * 34;
    const centre = toWorld(stage.clientWidth / 2 - w.w / 2 + step, stage.clientHeight / 2 - w.h / 2 + step);
    w.x = centre.x;
    w.y = centre.y;
    w.id = uid();
    c.widgets.push(w);
    mountWidget(w);
    saveSoon();
  }

  /* ---------------- toolbar wiring ---------------- */
  const toolRow = $("#tools");
  TOOLS.forEach(([key, label]) => {
    const b = document.createElement("button");
    b.className = "btn" + (key === tool ? " active" : "");
    b.textContent = label;
    b.onclick = () => {
      tool = key;
      [...toolRow.children].forEach((x) => x.classList.toggle("active", x === b));
      $("#hud-tool").textContent = label.replace(/^\S+\s/, "");
      stage.style.cursor = key === "pan" ? "grab" : key === "select" ? "default" : "crosshair";
    };
    toolRow.append(b);
  });

  buildSwatches($("#colors"), PEN_COLORS, color, (col) => {
    color = col;
    for (const id of selection) {
      const it = c.items.find((i) => i.id === id);
      if (it) it.color = col;
    }
    scheduleDraw();
    saveSoon();
  });

  const widthEl = $("#width");
  widthEl.value = width;
  $("#width-out").textContent = width;
  widthEl.oninput = () => {
    width = +widthEl.value;
    $("#width-out").textContent = width;
  };

  const stickerRow = $("#stickers");
  STICKERS.forEach((s) => {
    const b = document.createElement("button");
    b.className = "btn";
    b.style.flex = "0 0 auto";
    b.style.minWidth = "34px";
    b.textContent = s;
    b.onclick = () => {
      pushUndo();
      const p = toWorld(stage.clientWidth / 2, stage.clientHeight / 2);
      c.items.push({ id: uid(), kind: "sticker", x: p.x, y: p.y, text: s, size: 80 });
      scheduleDraw();
      saveSoon();
      api.toast("Sticker added — use Select to move it.");
    };
    stickerRow.append(b);
  });

  $("#add-photo").onclick = () => $("#photo-file").click();
  $("#photo-file").onchange = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => addImage(r.result);
    r.readAsDataURL(f);
    e.target.value = "";
  };
  $("#add-weburl").onclick = () => {
    const url = prompt("Paste the address of a picture from the internet:");
    if (url) addImage(url.trim());
  };
  function addImage(src) {
    pushUndo();
    const p = toWorld(stage.clientWidth / 2 - 160, stage.clientHeight / 2 - 100);
    c.items.push({ id: uid(), kind: "image", x: p.x, y: p.y, w: 320, h: 200, src });
    getImage(src);
    scheduleDraw();
    saveSoon();
  }

  $("#add-code").onclick = () => addWidget({ kind: "code", lang: "javascript", w: 420, h: 240, text: "// write code here\nlet sum = 0;\nfor (let i = 1; i <= 10; i++) sum += i;\nconsole.log(sum);" });
  $("#add-tetris").onclick = () => addWidget({ kind: "game", game: "tetris", w: 260, h: 440 });
  $("#add-blockoff").onclick = () => addWidget({ kind: "game", game: "blockoff", w: 440, h: 330 });

  $("#zoom-in").onclick = () => zoomBy(1.2);
  $("#zoom-out").onclick = () => zoomBy(1 / 1.2);
  function zoomBy(f) {
    const cx = stage.clientWidth / 2, cy = stage.clientHeight / 2;
    const before = toWorld(cx, cy);
    cam.z = Math.max(0.15, Math.min(5, cam.z * f));
    const after = toWorld(cx, cy);
    cam.x += (after.x - before.x) * cam.z;
    cam.y += (after.y - before.y) * cam.z;
    syncWidgets();
    scheduleDraw();
    saveSoon();
  }
  $("#zoom-fit").onclick = fit;
  function fit() {
    const all = [...c.items.map(bbox), ...c.widgets.map((w) => ({ x: w.x, y: w.y, w: w.w, h: w.h }))];
    if (!all.length) { cam.x = 0; cam.y = 0; cam.z = 1; syncWidgets(); scheduleDraw(); return; }
    const x0 = Math.min(...all.map((b) => b.x)), y0 = Math.min(...all.map((b) => b.y));
    const x1 = Math.max(...all.map((b) => b.x + b.w)), y1 = Math.max(...all.map((b) => b.y + b.h));
    const pad = 60;
    cam.z = Math.max(0.15, Math.min(2, Math.min(stage.clientWidth / (x1 - x0 + pad * 2), stage.clientHeight / (y1 - y0 + pad * 2))));
    cam.x = -x0 * cam.z + pad;
    cam.y = -y0 * cam.z + pad;
    syncWidgets();
    scheduleDraw();
    saveSoon();
  }

  $("#undo").onclick = undo;
  $("#clear").onclick = () => {
    if (!confirm("Clear the whole board?")) return;
    pushUndo();
    c.items = [];
    c.widgets = [];
    renderWidgets();
    scheduleDraw();
    saveSoon();
  };

  $("#export-png").onclick = () => {
    const all = c.items.map(bbox);
    if (!all.length) return api.toast("Nothing to save yet.");
    const pad = 40;
    const x0 = Math.min(...all.map((b) => b.x)) - pad, y0 = Math.min(...all.map((b) => b.y)) - pad;
    const x1 = Math.max(...all.map((b) => b.x + b.w)) + pad, y1 = Math.max(...all.map((b) => b.y + b.h)) + pad;
    const out = document.createElement("canvas");
    out.width = Math.max(1, Math.min(4000, x1 - x0));
    out.height = Math.max(1, Math.min(4000, y1 - y0));
    const octx = out.getContext("2d");
    octx.fillStyle = "#101722";
    octx.fillRect(0, 0, out.width, out.height);
    octx.translate(-x0, -y0);
    for (const it of c.items) drawItem(octx, it);
    out.toBlob((b) => download(b, project.name.replace(/\s+/g, "_") + ".png"));
    if (c.widgets.length) api.toast("Saved (games and code blocks aren't part of the picture).");
  };

  /* ---------------- copy / paste / undo ---------------- */
  function pushUndo() {
    undoStack.push(JSON.stringify({ items: c.items, widgets: c.widgets }));
    if (undoStack.length > 40) undoStack.shift();
  }
  function undo() {
    const s = undoStack.pop();
    if (!s) return api.toast("Nothing to undo.");
    const prev = JSON.parse(s);
    c.items = prev.items;
    c.widgets = prev.widgets;
    selection = new Set();
    renderWidgets();
    scheduleDraw();
    saveSoon();
  }

  function onKey(e) {
    if (root.hidden) return;
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || "");
    if (e.code === "Space" && !typing) { spaceDown = true; stage.style.cursor = "grab"; }
    if (typing) return;
    const meta = e.ctrlKey || e.metaKey;

    if (meta && e.key.toLowerCase() === "z") { e.preventDefault(); undo(); }
    else if (meta && e.key.toLowerCase() === "c") {
      clipboard = [...selection].map((id) => structuredClone(c.items.find((i) => i.id === id))).filter(Boolean);
      if (clipboard.length) api.toast(`Copied ${clipboard.length} item${clipboard.length > 1 ? "s" : ""}`);
    } else if (meta && e.key.toLowerCase() === "x") {
      clipboard = [...selection].map((id) => structuredClone(c.items.find((i) => i.id === id))).filter(Boolean);
      pushUndo();
      c.items = c.items.filter((i) => !selection.has(i.id));
      selection = new Set();
      scheduleDraw();
      saveSoon();
    } else if (meta && e.key.toLowerCase() === "v") {
      if (!clipboard.length) return;
      pushUndo();
      const fresh = clipboard.map((it) => {
        const copy = structuredClone(it);
        copy.id = uid();
        if (copy.kind === "stroke") copy.points = copy.points.map((p) => ({ x: p.x + 30, y: p.y + 30 }));
        else { copy.x += 30; copy.y += 30; }
        return copy;
      });
      c.items.push(...fresh);
      selection = new Set(fresh.map((f) => f.id));
      scheduleDraw();
      saveSoon();
      api.toast("Pasted");
    } else if (meta && e.key.toLowerCase() === "a") {
      e.preventDefault();
      selection = new Set(c.items.map((i) => i.id));
      scheduleDraw();
    } else if (e.key === "Delete" || e.key === "Backspace") {
      if (!selection.size) return;
      e.preventDefault();
      pushUndo();
      c.items = c.items.filter((i) => !selection.has(i.id));
      selection = new Set();
      scheduleDraw();
      saveSoon();
    } else if (e.key === "Escape") {
      selection = new Set();
      scheduleDraw();
    }
  }
  function onKeyUp(e) {
    if (e.code === "Space") { spaceDown = false; stage.style.cursor = tool === "pan" ? "grab" : tool === "select" ? "default" : "crosshair"; }
  }
  // while presenting, the board is for showing and playing — not for editing
  if (!opts.present) {
    document.addEventListener("keydown", onKey);
    document.addEventListener("keyup", onKeyUp);
  }

  // paste an image straight from the system clipboard
  function onPaste(e) {
    if (root.hidden) return;
    const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith("image/"));
    if (!item) return;
    const f = item.getAsFile();
    const r = new FileReader();
    r.onload = () => addImage(r.result);
    r.readAsDataURL(f);
  }
  if (!opts.present) document.addEventListener("paste", onPaste);

  /* ---------------- boot ---------------- */
  const ro = new ResizeObserver(resize);
  ro.observe(stage);
  resize();
  renderWidgets();
  $("#hud-tool").textContent = "Pen";
  stage.style.cursor = "crosshair";

  if (opts.present) {
    // show the whole board, and let dragging move it around instead of drawing
    tool = "pan";
    stage.style.cursor = "grab";
    setTimeout(fit, 60);
    // hand the keyboard to the first game so it can be played straight away —
    // otherwise nothing is focused and the arrow keys do nothing at all
    setTimeout(() => {
      for (const [, w] of liveWidgets) {
        if (w.game?.focus) { w.game.focus(); break; }
      }
    }, 400);
  }

  let raf = 0;
  (function tick() {
    if (dirty) { dirty = false; draw(); }
    raf = requestAnimationFrame(tick);
  })();

  return {
    destroy() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("keyup", onKeyUp);
      document.removeEventListener("paste", onPaste);
      window.removeEventListener("mousemove", onMove);
      for (const [, w] of liveWidgets) w.game?.destroy?.();
      api.save(c);
    },
  };
}

const uid = () => "i" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
