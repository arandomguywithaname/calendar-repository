/* ===========================================================
   slides.js — 2D creation: slides you build and then present.
   =========================================================== */

import { buildSwatches, debounce, download } from "./threed.js";

const TEXT_COLORS = ["#111827", "#1d4ed8", "#b91c1c", "#047857", "#7c3aed", "#b45309", "#ffffff"];
const BG_COLORS = ["#ffffff", "#f1f5f9", "#0f172a", "#1e293b", "#fef3c7", "#dbeafe", "#dcfce7"];
const STICKERS = ["📐", "📏", "✏️", "🔢", "➗", "✖️", "➕", "➖", "🧮", "⭐", "✅", "❓", "💡", "🎯", "🍕", "🚀"];

export function mount(root, project, api, opts = {}) {
  const c = project.content;
  if (!c.slides || !c.slides.length) c.slides = [{ id: sid(), bg: "#ffffff", elements: [] }];
  if (opts.present) return mountPresent(root, c);

  let current = 0;
  let selected = null;

  root.innerHTML = `
    <div class="slide-strip" id="strip"></div>
    <div class="stage">
      <div class="slide-canvas-wrap"><div class="slide-canvas" id="canvas"></div></div>
    </div>
    <div class="tools right">
      <div class="tgroup">
        <div class="tlabel">Slides</div>
        <div class="trow">
          <button class="btn" id="add-slide">+ Slide</button>
          <button class="btn" id="dup-slide">Copy</button>
          <button class="btn danger" id="del-slide">Delete</button>
        </div>
        <button class="btn primary" id="present">▶ Present</button>
      </div>
      <div class="tgroup">
        <div class="tlabel">Add to slide</div>
        <div class="trow">
          <button class="btn" id="add-text">Text</button>
          <button class="btn" id="add-rect">Box</button>
          <button class="btn" id="add-ellipse">Circle</button>
        </div>
        <div class="trow">
          <button class="btn" id="add-image">Photo</button>
          <button class="btn" id="add-url">Web image</button>
        </div>
        <input type="file" id="img-file" accept="image/*" hidden />
        <div class="tlabel" style="margin-top:6px">Stickers</div>
        <div class="trow" id="stickers"></div>
      </div>
      <div class="tgroup">
        <div class="tlabel">Slide background</div>
        <div class="swatches" id="bgs"></div>
      </div>
      <div class="tgroup" id="sel-panel" hidden>
        <div class="tlabel">Selected item</div>
        <button class="btn primary" id="edit-text">✏️ Edit the words</button>
        <div class="swatches" id="colors"></div>
        <div class="field"><label>Size</label><input type="range" id="size" min="10" max="140" step="1"><span class="num-out" id="size-out"></span></div>
        <div class="field"><label>Width</label><input type="range" id="width" min="5" max="100" step="1"><span class="num-out" id="width-out"></span></div>
        <div class="trow">
          <button class="btn" id="bold">Bold</button>
          <button class="btn" id="align">Align</button>
        </div>
        <div class="trow">
          <button class="btn" id="front">Front</button>
          <button class="btn" id="dup-el">Copy</button>
          <button class="btn danger" id="del-el">Delete</button>
        </div>
        <div class="mini">Double-click any text to type in it, or use the button above. Arrow keys nudge, Delete removes.</div>
      </div>
      <div class="tgroup">
        <div class="tlabel">Export</div>
        <button class="btn" id="export-html">⬇ Save as web page</button>
      </div>
    </div>`;

  const $ = (s) => root.querySelector(s);
  const canvas = $("#canvas");
  const saveSoon = debounce(() => api.save(c), 400);

  /* ---------------- rendering ---------------- */
  function slide() { return c.slides[current]; }

  function renderStrip() {
    const strip = $("#strip");
    strip.innerHTML = "";
    c.slides.forEach((s, i) => {
      const t = document.createElement("div");
      t.className = "slide-thumb" + (i === current ? " active" : "");
      t.style.background = s.bg;
      const first = s.elements.find((e) => e.kind === "text");
      t.innerHTML = `<div style="padding:6px;color:${textish(s.bg)};font-weight:600;line-height:1.2">
          ${escapeHtml((first?.text || "").slice(0, 40))}</div><span class="num">${i + 1}</span>`;
      t.onclick = () => { current = i; selected = null; renderAll(); };
      strip.append(t);
    });
  }

  /** Paints the current slide, then wires up dragging, resizing and editing. */
  function renderCanvas(host = canvas) {
    const s = slide();
    paintSlide(host, s);
    s.elements.forEach((e) => {
      const n = host.querySelector(`[data-id="${cssId(e.id)}"]`);
      if (!n) return;
      n.addEventListener("mousedown", (ev) => startDrag(ev, e, host));
      n.addEventListener("dblclick", (ev) => { ev.preventDefault(); editText(e, n); });
      paintSelection(n, e);
    });
  }

  /** Selection is drawn *onto* existing nodes so double-clicks survive a click. */
  function paintSelection(node, e) {
    const on = selected === e.id;
    node.classList.toggle("selected", on);
    node.querySelector(":scope > .handle")?.remove();
    if (!on) return;
    const h = document.createElement("div");
    h.className = "handle";
    h.addEventListener("mousedown", (ev) => startResize(ev, e, canvas));
    node.append(h);
  }

  /**
   * Selecting must NOT rebuild the canvas: a mousedown that replaces the node
   * means the dblclick that follows lands on a node no longer in the page, and
   * "double-click the text to edit it" silently does nothing.
   */
  function selectEl(id) {
    selected = id;
    slide().elements.forEach((e) => {
      const n = canvas.querySelector(`[data-id="${cssId(e.id)}"]`);
      if (n) paintSelection(n, e);
    });
    renderSelPanel();
  }

  function renderAll() {
    renderStrip();
    renderCanvas();
    renderSelPanel();
  }

  /* ---------------- selection panel ---------------- */
  function selEl() { return slide().elements.find((e) => e.id === selected) || null; }

  function renderSelPanel() {
    const e = selEl();
    $("#sel-panel").hidden = !e;
    if (!e) return;
    buildSwatches($("#colors"), TEXT_COLORS.concat(["#6ea8fe", "#4ade80"]), e.color, (col) => {
      e.color = col; renderCanvas(); saveSoon();
    });
    const size = $("#size");
    size.value = e.size || 40;
    size.disabled = !(e.kind === "text" || e.kind === "sticker");
    $("#size-out").textContent = size.value;
    size.oninput = () => { e.size = +size.value; $("#size-out").textContent = size.value; renderCanvas(); saveSoon(); };
    const width = $("#width");
    width.value = e.w || 30;
    $("#width-out").textContent = width.value;
    width.oninput = () => { e.w = +width.value; $("#width-out").textContent = width.value; renderCanvas(); saveSoon(); };
  }

  $("#bold").onclick = () => { const e = selEl(); if (!e) return; e.bold = !e.bold; renderCanvas(); saveSoon(); };
  $("#align").onclick = () => {
    const e = selEl(); if (!e) return;
    e.align = e.align === "left" ? "center" : e.align === "center" ? "right" : "left";
    renderCanvas(); saveSoon(); api.toast("Align: " + e.align);
  };
  $("#front").onclick = () => {
    const e = selEl(); if (!e) return;
    const arr = slide().elements;
    arr.splice(arr.indexOf(e), 1); arr.push(e);
    renderCanvas(); saveSoon();
  };
  $("#dup-el").onclick = () => {
    const e = selEl(); if (!e) return;
    const copy = { ...structuredClone(e), id: eid(), x: Math.min(90, e.x + 4), y: Math.min(88, e.y + 5) };
    slide().elements.push(copy);
    selected = copy.id;
    renderAll(); saveSoon();
  };
  $("#del-el").onclick = () => {
    const e = selEl(); if (!e) return;
    slide().elements = slide().elements.filter((x) => x !== e);
    selected = null;
    renderAll(); saveSoon();
  };

  /* ---------------- add things ---------------- */
  function add(e) {
    slide().elements.push(e);
    selected = e.id;
    renderAll();
    saveSoon();
  }
  $("#add-text").onclick = () => add({ id: eid(), kind: "text", x: 12, y: 40, w: 60, text: "New text", size: 40, color: "#111827", align: "left" });
  $("#add-rect").onclick = () => add({ id: eid(), kind: "rect", x: 20, y: 30, w: 30, h: 22, color: "#6ea8fe", opacity: 0.9 });
  $("#add-ellipse").onclick = () => add({ id: eid(), kind: "ellipse", x: 22, y: 28, w: 26, h: 34, color: "#a78bfa", opacity: 0.9 });
  $("#add-image").onclick = () => $("#img-file").click();
  $("#img-file").onchange = (ev) => {
    const f = ev.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => add({ id: eid(), kind: "image", x: 20, y: 25, w: 40, src: r.result });
    r.readAsDataURL(f);
    ev.target.value = "";
  };
  $("#add-url").onclick = () => {
    const url = prompt("Paste the address of a picture from the internet:");
    if (url) add({ id: eid(), kind: "image", x: 20, y: 25, w: 40, src: url.trim() });
  };
  const stickerRow = $("#stickers");
  STICKERS.forEach((s) => {
    const b = document.createElement("button");
    b.className = "btn";
    b.style.flex = "0 0 auto";
    b.style.minWidth = "34px";
    b.textContent = s;
    b.onclick = () => add({ id: eid(), kind: "sticker", x: 40, y: 40, text: s, size: 70 });
    stickerRow.append(b);
  });

  buildSwatches($("#bgs"), BG_COLORS, slide().bg, (col) => { slide().bg = col; renderAll(); saveSoon(); });

  /* ---------------- slide operations ---------------- */
  $("#add-slide").onclick = () => {
    c.slides.splice(current + 1, 0, { id: sid(), bg: slide().bg, elements: [] });
    current++; selected = null; renderAll(); saveSoon();
  };
  $("#dup-slide").onclick = () => {
    const copy = structuredClone(slide());
    copy.id = sid();
    copy.elements.forEach((e) => (e.id = eid()));
    c.slides.splice(current + 1, 0, copy);
    current++; renderAll(); saveSoon();
  };
  $("#del-slide").onclick = () => {
    if (c.slides.length === 1) return api.toast("You need at least one slide.");
    c.slides.splice(current, 1);
    current = Math.max(0, current - 1);
    selected = null; renderAll(); saveSoon();
  };

  /* ---------------- dragging & resizing ---------------- */
  function startDrag(ev, e, host) {
    if (ev.target.classList.contains("handle")) return;
    if (ev.target.tagName === "TEXTAREA") return;
    ev.preventDefault();
    selectEl(e.id);
    const rect = host.getBoundingClientRect();
    const sx = ev.clientX, sy = ev.clientY, ox = e.x, oy = e.y;
    const move = (m) => {
      e.x = clamp(ox + ((m.clientX - sx) / rect.width) * 100, -10, 98);
      e.y = clamp(oy + ((m.clientY - sy) / rect.height) * 100, -10, 98);
      const node = host.querySelector(`[data-id="${e.id}"]`);
      if (node) { node.style.left = e.x + "%"; node.style.top = e.y + "%"; }
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      saveSoon();
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }

  function startResize(ev, e, host) {
    ev.preventDefault();
    ev.stopPropagation();
    const rect = host.getBoundingClientRect();
    const sx = ev.clientX, sy = ev.clientY, ow = e.w || 30, oh = e.h || 20, osize = e.size || 40;
    const move = (m) => {
      const dx = ((m.clientX - sx) / rect.width) * 100;
      const dy = ((m.clientY - sy) / rect.height) * 100;
      if (e.kind === "sticker") e.size = Math.max(12, osize + dx * 8);
      else {
        e.w = clamp(ow + dx, 4, 110);
        if (e.kind === "rect" || e.kind === "ellipse") e.h = clamp(oh + dy, 3, 110);
        if (e.kind === "text") e.size = Math.max(10, osize + dy * 4);
      }
      renderCanvas();
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      renderSelPanel();
      saveSoon();
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }

  /**
   * Typing happens in a real <textarea> laid exactly over the words. A textarea
   * takes focus and keystrokes the same way in every browser, which
   * contentEditable did not.
   */
  let editing = null;
  function editText(e, node) {
    if (e.kind !== "text" && e.kind !== "sticker") return;
    if (editing) closeEditor(true);
    selectEl(e.id);

    const box = node.getBoundingClientRect();
    const wrap = canvas.getBoundingClientRect();
    const cs = getComputedStyle(node);
    const ta = document.createElement("textarea");
    ta.className = "el-editor";
    ta.value = e.text || "";
    Object.assign(ta.style, {
      position: "absolute",
      left: box.left - wrap.left + "px",
      top: box.top - wrap.top + "px",
      width: Math.max(60, box.width) + "px",
      minHeight: Math.max(24, box.height) + "px",
      fontSize: cs.fontSize,
      fontWeight: cs.fontWeight,
      lineHeight: cs.lineHeight,
      textAlign: cs.textAlign,
      color: cs.color,
      fontFamily: cs.fontFamily,
    });
    canvas.append(ta);
    node.style.visibility = "hidden";
    editing = { el: e, node, ta };

    ta.focus();
    ta.select();
    const grow = () => { ta.style.height = "auto"; ta.style.height = ta.scrollHeight + "px"; };
    grow();

    ta.addEventListener("input", () => {
      grow();
      e.text = ta.value;
      saveSoon();
    });
    ta.addEventListener("mousedown", (m) => m.stopPropagation());
    ta.addEventListener("keydown", (k) => {
      k.stopPropagation();
      if (k.key === "Escape" || (k.key === "Enter" && (k.ctrlKey || k.metaKey))) { k.preventDefault(); closeEditor(true); }
    });
    ta.addEventListener("blur", () => closeEditor(true));
  }

  function closeEditor(commit) {
    if (!editing) return;
    const { el, node, ta } = editing;
    editing = null;
    if (commit) el.text = ta.value;
    ta.remove();
    node.style.visibility = "";
    renderAll();
    saveSoon();
  }

  $("#edit-text").onclick = () => {
    const e = selEl();
    if (!e) return;
    if (e.kind !== "text" && e.kind !== "sticker") return api.toast("Pick a text or sticker to edit its words.");
    const node = canvas.querySelector(`[data-id="${cssId(e.id)}"]`);
    if (node) editText(e, node);
  };

  canvas.addEventListener("mousedown", (e) => {
    if (e.target === canvas) { closeEditor(true); selectEl(null); }
  });

  /* ---------------- keyboard ---------------- */
  function onKey(ev) {
    if (root.hidden || document.activeElement?.isContentEditable) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || "")) return;
    const e = selEl();
    if (ev.key === "Delete" || ev.key === "Backspace") {
      if (e) { ev.preventDefault(); $("#del-el").click(); }
    } else if (ev.key.startsWith("Arrow") && e) {
      ev.preventDefault();
      const step = ev.shiftKey ? 5 : 1;
      if (ev.key === "ArrowLeft") e.x -= step;
      if (ev.key === "ArrowRight") e.x += step;
      if (ev.key === "ArrowUp") e.y -= step;
      if (ev.key === "ArrowDown") e.y += step;
      renderCanvas(); saveSoon();
    } else if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "d" && e) {
      ev.preventDefault(); $("#dup-el").click();
    } else if (ev.key === "PageDown") { current = Math.min(c.slides.length - 1, current + 1); renderAll(); }
    else if (ev.key === "PageUp") { current = Math.max(0, current - 1); renderAll(); }
  }
  document.addEventListener("keydown", onKey);

  /* ---------------- present mode ---------------- */
  let presenting = null;
  $("#present").onclick = () => startPresent(current);

  function startPresent(from) {
    let idx = from;
    const back = document.createElement("div");
    back.className = "present-mode";
    const host = document.createElement("div");
    host.className = "slide-canvas";
    back.append(host);
    const hud = document.createElement("div");
    hud.className = "present-hud";
    hud.innerHTML = `<button class="btn sm" data-prev>←</button><span class="btn sm" data-count></span><button class="btn sm" data-next>→</button><button class="btn sm" data-exit>Exit</button>`;
    back.append(hud);
    document.body.append(back);
    presenting = back;

    const paint = () => {
      paintSlide(host, c.slides[idx]);
      hud.querySelector("[data-count]").textContent = `${idx + 1} / ${c.slides.length}`;
    };
    const go = (d) => { idx = clamp(idx + d, 0, c.slides.length - 1); paint(); };
    const key = (ev) => {
      if (ev.key === "ArrowRight" || ev.key === " " || ev.key === "PageDown") go(1);
      else if (ev.key === "ArrowLeft" || ev.key === "PageUp") go(-1);
      else if (ev.key === "Escape") exit();
    };
    const exit = () => {
      document.removeEventListener("keydown", key);
      back.remove();
      presenting = null;
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
    hud.querySelector("[data-prev]").onclick = () => go(-1);
    hud.querySelector("[data-next]").onclick = () => go(1);
    hud.querySelector("[data-exit]").onclick = exit;
    host.onclick = () => go(1);
    document.addEventListener("keydown", key);
    back.requestFullscreen?.().catch(() => {});
    paint();
  }

  /* ---------------- export ---------------- */
  $("#export-html").onclick = () => {
    const html = exportHTML(c, project.name);
    download(html, project.name.replace(/\s+/g, "_") + ".html", "text/html");
    api.toast("Saved — open the file in any browser to present.");
  };

  const ro = new ResizeObserver(() => { if (!editing) renderCanvas(); });
  ro.observe(canvas);
  renderAll();

  return {
    destroy() {
      closeEditor(true);
      document.removeEventListener("keydown", onKey);
      ro.disconnect();
      presenting?.remove();
      api.save(c);
    },
  };
}

/* ===========================================================
   Shared slide painter — used by the editor canvas, the little
   thumbnails' big brother, and both presenting modes.
   =========================================================== */
function scaleFactor(host) {
  return (host.clientWidth || 960) / 1000;
}

function paintSlide(host, s) {
  host.innerHTML = "";
  host.style.background = s.bg;
  const k = scaleFactor(host);
  s.elements.forEach((e) => host.append(elNode(e, k)));
}

function elNode(e, k) {
  const n = document.createElement("div");
  n.className = "el";
  n.dataset.id = e.id;
  n.style.left = e.x + "%";
  n.style.top = e.y + "%";
  n.style.width = (e.w || 30) + "%";
  if (e.kind === "text") {
    n.style.fontSize = (e.size || 32) * k + "px";
    n.style.color = e.color || "#111827";
    n.style.fontWeight = e.bold ? "800" : "400";
    n.style.textAlign = e.align || "left";
    n.style.lineHeight = "1.25";
    n.style.whiteSpace = "pre-wrap";
    n.textContent = e.text;
  } else if (e.kind === "sticker") {
    n.style.fontSize = (e.size || 60) * k + "px";
    n.style.width = "auto";
    n.textContent = e.text;
  } else if (e.kind === "rect" || e.kind === "ellipse") {
    n.style.height = (e.h || 20) + "%";
    n.style.background = e.color || "#6ea8fe";
    n.style.opacity = e.opacity ?? 1;
    n.style.borderRadius = e.kind === "ellipse" ? "50%" : 8 * k + "px";
  } else if (e.kind === "image") {
    const img = document.createElement("img");
    img.src = e.src;
    img.style.width = "100%";
    img.style.display = "block";
    img.style.borderRadius = 8 * k + "px";
    img.draggable = false;
    img.onerror = () => { n.style.background = "#33415577"; n.textContent = "image failed to load"; };
    n.append(img);
  }
  return n;
}

/* ===========================================================
   Present mode — just the deck, no editing furniture.
   =========================================================== */
function mountPresent(root, c) {
  let idx = 0;

  root.innerHTML = `
    <div class="present-stage">
      <div class="slide-canvas" id="pslide"></div>
      <div class="present-count">
        <button class="btn sm" data-prev>←</button>
        <span data-count></span>
        <button class="btn sm" data-next>→</button>
      </div>
    </div>`;

  const host = root.querySelector("#pslide");
  const counter = root.querySelector("[data-count]");

  const paint = () => {
    paintSlide(host, c.slides[idx]);
    counter.textContent = `${idx + 1} / ${c.slides.length}`;
  };
  const go = (d) => { idx = clamp(idx + d, 0, c.slides.length - 1); paint(); };

  root.querySelector("[data-prev]").onclick = (e) => { e.stopPropagation(); go(-1); };
  root.querySelector("[data-next]").onclick = (e) => { e.stopPropagation(); go(1); };
  host.onclick = () => go(1);

  const onKey = (e) => {
    if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") { e.preventDefault(); go(1); }
    else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); go(-1); }
    else if (e.key === "Home") go(-c.slides.length);
    else if (e.key === "End") go(c.slides.length);
  };
  document.addEventListener("keydown", onKey);

  const ro = new ResizeObserver(paint);
  ro.observe(host);
  paint();

  return {
    destroy() {
      document.removeEventListener("keydown", onKey);
      ro.disconnect();
    },
  };
}

/* ---------------- standalone export ---------------- */
function exportHTML(content, name) {
  const slides = content.slides
    .map((s) => {
      const els = s.elements
        .map((e) => {
          const base = `left:${e.x}%;top:${e.y}%;width:${e.w || 30}%;position:absolute;`;
          if (e.kind === "text")
            return `<div style="${base}font-size:${(e.size || 32) / 10}vw;color:${e.color};font-weight:${e.bold ? 800 : 400};text-align:${e.align || "left"};white-space:pre-wrap;line-height:1.25">${escapeHtml(e.text)}</div>`;
          if (e.kind === "sticker")
            return `<div style="${base}width:auto;font-size:${(e.size || 60) / 10}vw">${e.text}</div>`;
          if (e.kind === "image")
            return `<img src="${escapeHtml(e.src)}" style="${base}display:block"/>`;
          return `<div style="${base}height:${e.h || 20}%;background:${e.color};opacity:${e.opacity ?? 1};border-radius:${e.kind === "ellipse" ? "50%" : "8px"}"></div>`;
        })
        .join("");
      return `<section style="background:${s.bg}">${els}</section>`;
    })
    .join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(name)}</title>
<style>
  *{box-sizing:border-box;margin:0}body{background:#000;font-family:-apple-system,Segoe UI,sans-serif;overflow:hidden}
  section{position:absolute;inset:0;display:none}section.on{display:block}
  .hud{position:fixed;bottom:14px;left:50%;transform:translateX(-50%);color:#fff;font-size:13px;opacity:.6;z-index:9}
</style></head><body>${slides}
<div class="hud">← → to move · ${escapeHtml(name)}</div>
<script>
  var i=0,s=document.querySelectorAll('section');
  function show(n){i=Math.max(0,Math.min(s.length-1,n));s.forEach(function(x,j){x.classList.toggle('on',j===i)})}
  document.addEventListener('keydown',function(e){
    if(e.key==='ArrowRight'||e.key===' ')show(i+1);
    if(e.key==='ArrowLeft')show(i-1);
  });
  document.body.addEventListener('click',function(){show(i+1)});
  show(0);
<\/script></body></html>`;
}

/* ---------------- utils ---------------- */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const cssId = (id) => (window.CSS && CSS.escape ? CSS.escape(id) : id);
const sid = () => "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const eid = () => "e" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
function textish(bg) {
  const n = parseInt(bg.replace("#", ""), 16);
  const lum = ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114;
  return lum > 140 ? "#111" : "#eee";
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
