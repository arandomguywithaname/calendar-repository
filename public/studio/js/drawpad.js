/* ===========================================================
   drawpad.js — draw the thing you want to be 3D.

   White ink on a dark pad, because the ink is exactly what
   turns solid. Draw freehand, drop in boxes and circles, type
   words, stamp emoji — then "Make it 3D" and it becomes a model
   you can spin, colour and export like any other.

   The drawing is kept as a list of what you did, not as a
   picture, so you can open it again later and keep changing it.
   =========================================================== */

import { paintDrawing, PAD_W, PAD_H } from "./trace.js";

const EMOJI = ["⭐", "❤️", "🚀", "🐱", "🌳", "☀️", "🍕", "⚽", "🎈", "🔺", "😀", "🦋", "🏠", "🎵", "✔️", "❓"];
const PEN_COLOURS = ["#6ea8fe", "#f87171", "#fbbf24", "#4ade80", "#a78bfa", "#fb923c", "#38bdf8", "#e8eef7", "#111827"];
const TOOLS = [
  ["pen", "✏️ Pen"],
  ["erase", "🧽 Rubber"],
  ["line", "╱ Line"],
  ["rect", "▭ Box"],
  ["ellipse", "◯ Circle"],
  ["text", "🔤 Words"],
  ["emoji", "😀 Emoji"],
];

/**
 * Opens the pad. `drawing` is the saved list of items (or null for a fresh
 * one); `onSave` gets the new list back when they press Make it 3D.
 */
export function openDrawPad({ drawing, ink = "#6ea8fe", onSave, onCancel } = {}) {
  const items = structuredClone(drawing?.items || []);
  let tool = "pen";
  let width = 22;
  let emoji = "⭐";
  let filled = true;
  let colour = ink;

  const back = document.createElement("div");
  back.className = "pad-back";
  back.innerHTML = `
    <div class="pad-shell">
      <div class="pad-head">
        <b>Draw what you want to be 3D</b>
        <span class="mini">Everything you draw turns solid. The rubber takes it away again.</span>
      </div>
      <div class="pad-main">
        <div class="pad-tools">
          <div class="tlabel">Tool</div>
          <div class="trow wrap" id="pad-tools"></div>
          <div class="field"><label>Size</label>
            <input type="range" id="pad-size" min="4" max="150" step="1" value="${width}">
            <span class="num-out" id="pad-size-out">${width}</span></div>
          <label class="pad-check"><input type="checkbox" id="pad-fill" checked> Fill the shape in</label>
          <div class="tlabel" style="margin-top:6px">Colour</div>
          <div class="swatches" id="pad-colours"></div>
          <div class="tlabel" style="margin-top:6px">Emoji</div>
          <div class="trow wrap" id="pad-emoji"></div>
          <div class="trow" style="margin-top:6px">
            <button class="btn" id="pad-undo">↩ Undo</button>
            <button class="btn danger" id="pad-clear">Clear</button>
          </div>
          <div class="mini" id="pad-count"></div>
        </div>
        <div class="pad-stage"><canvas id="pad-canvas"></canvas></div>
      </div>
      <div class="pad-foot">
        <button class="btn ghost" id="pad-cancel">Cancel</button>
        <button class="btn primary" id="pad-ok">Make it 3D →</button>
      </div>
    </div>`;
  document.body.append(back);

  const $ = (s) => back.querySelector(s);
  const canvas = $("#pad-canvas");
  const ctx = canvas.getContext("2d");

  /* ---------------- painting ---------------- */
  let scale = 1;
  function resize() {
    const box = canvas.parentElement.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(120, box.width - 4);
    const h = (w * PAD_H) / PAD_W;
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    scale = canvas.width / PAD_W;
    paint();
  }

  let preview = null;                 // the shape being dragged out right now
  function paint() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#0f1620";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    grid();
    paintDrawing(ctx, { items: preview ? items.concat([preview]) : items }, scale, ink);
    $("#pad-count").textContent = items.length ? `${items.length} thing${items.length === 1 ? "" : "s"} drawn` : "The pad is empty.";
  }

  function grid() {
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,.05)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= PAD_W; x += 100) {
      ctx.beginPath();
      ctx.moveTo(x * scale, 0);
      ctx.lineTo(x * scale, PAD_H * scale);
      ctx.stroke();
    }
    for (let y = 0; y <= PAD_H; y += 100) {
      ctx.beginPath();
      ctx.moveTo(0, y * scale);
      ctx.lineTo(PAD_W * scale, y * scale);
      ctx.stroke();
    }
    ctx.restore();
  }

  /* ---------------- tools ---------------- */
  const toolRow = $("#pad-tools");
  TOOLS.forEach(([key, label]) => {
    const b = document.createElement("button");
    b.className = "btn" + (tool === key ? " active" : "");
    b.dataset.tool = key;
    b.textContent = label;
    b.onclick = () => {
      tool = key;
      [...toolRow.children].forEach((x) => x.classList.toggle("active", x === b));
    };
    toolRow.append(b);
  });

  const colourRow = $("#pad-colours");
  [ink, ...PEN_COLOURS.filter((x) => x !== ink)].forEach((col, i) => {
    const sw = document.createElement("div");
    sw.className = "sw" + (i === 0 ? " active" : "");
    sw.style.background = col;
    sw.onclick = () => {
      colour = col;
      [...colourRow.children].forEach((x) => x.classList.toggle("active", x === sw));
    };
    colourRow.append(sw);
  });

  const emojiRow = $("#pad-emoji");
  EMOJI.forEach((e) => {
    const b = document.createElement("button");
    b.className = "btn";
    b.style.cssText = "flex:0 0 auto;min-width:34px;font-size:16px";
    b.textContent = e;
    b.onclick = () => {
      emoji = e;
      tool = "emoji";
      [...toolRow.children].forEach((x) => x.classList.toggle("active", x.dataset.tool === "emoji"));
      [...emojiRow.children].forEach((x) => x.classList.toggle("active", x === b));
    };
    emojiRow.append(b);
  });

  $("#pad-size").oninput = (e) => {
    width = +e.target.value;
    $("#pad-size-out").textContent = width;
  };
  $("#pad-fill").onchange = (e) => (filled = e.target.checked);
  $("#pad-undo").onclick = () => { items.pop(); paint(); };
  $("#pad-clear").onclick = () => { items.length = 0; paint(); };

  /* ---------------- drawing on the pad ---------------- */
  const at = (e) => {
    const r = canvas.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return [
      ((t.clientX - r.left) / r.width) * PAD_W,
      ((t.clientY - r.top) / r.height) * PAD_H,
    ];
  };

  let drawing_ = null, start = null;

  const down = (e) => {
    e.preventDefault();
    const [x, y] = at(e);
    start = [x, y];

    if (tool === "text") {
      const said = prompt("What should it say?");
      if (said && said.trim()) {
        items.push({ kind: "text", x, y, text: said.trim(), size: Math.max(40, width * 5), color: colour });
        paint();
      }
      start = null;
      return;
    }
    if (tool === "emoji") {
      items.push({ kind: "emoji", x, y, text: emoji, size: Math.max(50, width * 7) });   // emoji bring their own
      paint();
      start = null;
      return;
    }
    if (tool === "pen" || tool === "erase") {
      drawing_ = { kind: tool === "pen" ? "stroke" : "erase", points: [[x, y]], width, color: colour };
      items.push(drawing_);
      paint();
      return;
    }
    preview = shapeItem(x, y, x, y);
    paint();
  };

  const move = (e) => {
    if (!start && !drawing_) return;
    e.preventDefault();
    const [x, y] = at(e);
    if (drawing_) {
      const last = drawing_.points[drawing_.points.length - 1];
      if (Math.hypot(x - last[0], y - last[1]) < 3) return;
      drawing_.points.push([x, y]);
    } else {
      preview = shapeItem(start[0], start[1], x, y);
    }
    paint();
  };

  const up = () => {
    if (preview) {
      const big = preview.kind === "line"
        ? Math.hypot(preview.x2 - preview.x1, preview.y2 - preview.y1) > 6
        : Math.abs(preview.w) > 6 && Math.abs(preview.h) > 6;
      if (big) items.push(preview);
      preview = null;
      paint();
    }
    drawing_ = null;
    start = null;
  };

  function shapeItem(x1, y1, x2, y2) {
    if (tool === "line") return { kind: "line", x1, y1, x2, y2, width, color: colour };
    return {
      kind: tool === "rect" ? "rect" : "ellipse",
      x: Math.min(x1, x2), y: Math.min(y1, y2),
      w: Math.abs(x2 - x1), h: Math.abs(y2 - y1),
      fill: filled, width, color: colour,
    };
  }

  canvas.addEventListener("mousedown", down);
  window.addEventListener("mousemove", move);
  window.addEventListener("mouseup", up);
  canvas.addEventListener("touchstart", down, { passive: false });
  canvas.addEventListener("touchmove", move, { passive: false });
  window.addEventListener("touchend", up);

  /* ---------------- finish ---------------- */
  const close = () => {
    window.removeEventListener("mousemove", move);
    window.removeEventListener("mouseup", up);
    window.removeEventListener("touchend", up);
    window.removeEventListener("resize", resize);
    document.removeEventListener("keydown", onKey);
    ro.disconnect();
    back.remove();
  };
  $("#pad-cancel").onclick = () => { close(); onCancel?.(); };
  $("#pad-ok").onclick = () => {
    const out = { items: structuredClone(items) };
    close();
    onSave?.(out);
  };

  const onKey = (e) => {
    e.stopPropagation();
    if (e.key === "Escape") { close(); onCancel?.(); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { items.pop(); paint(); }
    else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) $("#pad-ok").click();
  };
  document.addEventListener("keydown", onKey);

  const ro = new ResizeObserver(resize);
  ro.observe(canvas.parentElement);
  window.addEventListener("resize", resize);
  resize();

  return { close };
}
