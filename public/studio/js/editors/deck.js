/* ===========================================================
   deck.js — "Slide project": a proper presentation deck.

   The 2D editor gives you a blank canvas and you place things
   wherever you like. A slide project is the opposite: you pick
   a layout, type into real boxes, and the theme keeps every
   slide looking the same. Nothing here has to be dragged, and
   every word on screen is typed into an ordinary text field.
   =========================================================== */

import { debounce, download } from "./threed.js";

export const THEMES = {
  midnight: { name: "Midnight", bg: "#0f172a", panel: "#1e293b", text: "#f8fafc", dim: "#94a3b8", accent: "#6ea8fe" },
  chalk:    { name: "Chalkboard", bg: "#14342b", panel: "#1c463a", text: "#f0fdf4", dim: "#a7d7c2", accent: "#facc15" },
  paper:    { name: "Paper", bg: "#faf7f0", panel: "#f0e9dc", text: "#1f2937", dim: "#6b7280", accent: "#b45309" },
  ocean:    { name: "Ocean", bg: "#082f49", panel: "#0c4a6e", text: "#f0f9ff", dim: "#a5d8f3", accent: "#38bdf8" },
  berry:    { name: "Berry", bg: "#2e1065", panel: "#4c1d95", text: "#faf5ff", dim: "#c4b5fd", accent: "#f472b6" },
  bright:   { name: "Bright", bg: "#ffffff", panel: "#eff6ff", text: "#111827", dim: "#4b5563", accent: "#2563eb" },
};

export const LAYOUTS = {
  title:   { name: "Title slide", fields: ["title", "subtitle"] },
  bullets: { name: "Title + points", fields: ["title", "bullets"] },
  two:     { name: "Two columns", fields: ["title", "left", "right"] },
  number:  { name: "Big number", fields: ["title", "number", "subtitle"] },
  image:   { name: "Picture + words", fields: ["title", "src", "bullets"] },
  quote:   { name: "Quote", fields: ["quote", "subtitle"] },
};

const theme = (c) => THEMES[c.theme] || THEMES.midnight;
const layoutOf = (s) => (LAYOUTS[s?.layout] ? s.layout : "bullets");

export function mount(root, project, api, opts = {}) {
  const c = project.content;
  if (!Array.isArray(c.slides) || !c.slides.length) c.slides = [blankSlide("title")];
  if (opts.present) return mountPresent(root, c);

  let current = 0;
  const saveSoon = debounce(() => api.save(c), 400);

  root.innerHTML = `
    <div class="tools">
      <div class="tgroup">
        <div class="tlabel">Slides</div>
        <div class="list" id="deck-list"></div>
        <div class="trow">
          <button class="btn" id="add-slide">+ Slide</button>
          <button class="btn" id="dup-slide">Copy</button>
          <button class="btn danger" id="del-slide">Delete</button>
        </div>
        <div class="trow">
          <button class="btn" id="move-up">↑ Move up</button>
          <button class="btn" id="move-down">↓ Move down</button>
        </div>
        <button class="btn primary" id="present">▶ Present</button>
      </div>
      <div class="tgroup">
        <div class="tlabel">Theme</div>
        <div class="trow wrap" id="themes"></div>
      </div>
      <div class="tgroup">
        <div class="tlabel">Export</div>
        <button class="btn" id="export-html">⬇ Save as web page</button>
      </div>
    </div>
    <div class="stage">
      <div class="deck-wrap"><div class="deck-canvas" id="deck-canvas"></div></div>
    </div>
    <div class="tools right">
      <div class="tgroup">
        <div class="tlabel">Layout</div>
        <div class="trow wrap" id="layouts"></div>
      </div>
      <div class="tgroup">
        <div class="tlabel">What this slide says</div>
        <div id="fields"></div>
      </div>
      <div class="tgroup">
        <div class="tlabel">Speaker notes</div>
        <textarea id="notes" rows="4" placeholder="Only you see these while presenting."></textarea>
      </div>
    </div>`;

  const $ = (s) => root.querySelector(s);
  const canvas = $("#deck-canvas");
  const slide = () => c.slides[current];

  /* ---------------- the picture in the middle ---------------- */
  function renderCanvas() {
    paintSlide(canvas, slide(), theme(c));
  }

  /* ---------------- slide list ---------------- */
  function renderList() {
    const list = $("#deck-list");
    list.innerHTML = "";
    c.slides.forEach((s, i) => {
      const row = document.createElement("div");
      row.className = "list-item" + (i === current ? " active" : "");
      row.innerHTML = `<span class="num-badge">${i + 1}</span><span class="grow">${escapeHtml(
        headline(s) || LAYOUTS[layoutOf(s)].name
      )}</span>`;
      row.onclick = () => { current = i; renderAll(); };
      list.append(row);
    });
  }

  /* ---------------- the form on the right ---------------- */
  const FIELD_LABELS = {
    title: ["Title", "line"],
    subtitle: ["Under the title", "line"],
    bullets: ["Points — one per line", "lines"],
    left: ["Left column — one per line", "lines"],
    right: ["Right column — one per line", "lines"],
    number: ["The big number", "line"],
    quote: ["The quote", "para"],
    src: ["Picture address (or use the button)", "image"],
  };

  function renderFields() {
    const s = slide();
    const host = $("#fields");
    host.innerHTML = "";
    for (const key of LAYOUTS[layoutOf(s)].fields) {
      const [label, kind] = FIELD_LABELS[key];
      const wrap = document.createElement("div");
      wrap.className = "field-block";
      wrap.innerHTML = `<label for="f-${key}">${label}</label>`;

      const isList = kind === "lines";
      const input = document.createElement(kind === "line" || kind === "image" ? "input" : "textarea");
      input.id = "f-" + key;
      if (input.tagName === "TEXTAREA") input.rows = isList ? 6 : 4;
      input.value = isList ? (s[key] || []).join("\n") : s[key] || "";
      input.placeholder = isList ? "One point per line" : label;
      input.addEventListener("input", () => {
        s[key] = isList ? input.value.split("\n").filter((l) => l.trim() !== "") : input.value;
        renderCanvas();
        renderList();
        saveSoon();
      });
      input.addEventListener("keydown", (e) => e.stopPropagation());
      wrap.append(input);

      if (kind === "image") {
        const row = document.createElement("div");
        row.className = "trow";
        const file = document.createElement("input");
        file.type = "file";
        file.accept = "image/*";
        file.hidden = true;
        const pick = document.createElement("button");
        pick.className = "btn";
        pick.textContent = "📁 From this computer";
        pick.onclick = () => file.click();
        file.onchange = () => {
          const f = file.files[0];
          if (!f) return;
          const r = new FileReader();
          r.onload = () => { s.src = r.result; input.value = "(picture from this computer)"; renderCanvas(); saveSoon(); };
          r.readAsDataURL(f);
          file.value = "";
        };
        row.append(pick, file);
        wrap.append(row);
      }
      host.append(wrap);
    }

    const notes = $("#notes");
    notes.value = s.notes || "";
    notes.oninput = () => { s.notes = notes.value; saveSoon(); };
    notes.onkeydown = (e) => e.stopPropagation();
  }

  /* ---------------- layout + theme pickers ---------------- */
  function renderLayouts() {
    const host = $("#layouts");
    host.innerHTML = "";
    for (const [key, info] of Object.entries(LAYOUTS)) {
      const b = document.createElement("button");
      b.className = "btn" + (layoutOf(slide()) === key ? " active" : "");
      b.textContent = info.name;
      b.onclick = () => {
        slide().layout = key;
        for (const f of info.fields) if (slide()[f] === undefined) slide()[f] = f === "bullets" || f === "left" || f === "right" ? [] : "";
        renderAll();
        saveSoon();
      };
      host.append(b);
    }
  }

  const themeRow = $("#themes");
  for (const [key, t] of Object.entries(THEMES)) {
    const b = document.createElement("button");
    b.className = "btn" + (c.theme === key ? " active" : "");
    b.textContent = t.name;
    b.style.borderLeft = `4px solid ${t.accent}`;
    b.onclick = () => {
      c.theme = key;
      [...themeRow.children].forEach((x) => x.classList.toggle("active", x === b));
      renderCanvas();
      saveSoon();
    };
    themeRow.append(b);
  }

  /* ---------------- slide operations ---------------- */
  $("#add-slide").onclick = () => {
    c.slides.splice(current + 1, 0, blankSlide("bullets"));
    current++;
    renderAll();
    saveSoon();
  };
  $("#dup-slide").onclick = () => {
    const copy = structuredClone(slide());
    copy.id = sid();
    c.slides.splice(current + 1, 0, copy);
    current++;
    renderAll();
    saveSoon();
  };
  $("#del-slide").onclick = () => {
    if (c.slides.length === 1) return api.toast("A deck needs at least one slide.");
    c.slides.splice(current, 1);
    current = Math.max(0, current - 1);
    renderAll();
    saveSoon();
  };
  const swap = (d) => {
    const j = current + d;
    if (j < 0 || j >= c.slides.length) return;
    [c.slides[current], c.slides[j]] = [c.slides[j], c.slides[current]];
    current = j;
    renderAll();
    saveSoon();
  };
  $("#move-up").onclick = () => swap(-1);
  $("#move-down").onclick = () => swap(1);

  /* ---------------- present ---------------- */
  let presenting = null;
  $("#present").onclick = () => startPresent(current);

  function startPresent(from) {
    let idx = from, showNotes = false;
    const back = document.createElement("div");
    back.className = "present-mode deck-present";
    const host = document.createElement("div");
    host.className = "deck-canvas";
    const notes = document.createElement("div");
    notes.className = "deck-notes";
    notes.hidden = true;
    back.append(host, notes);

    const hud = document.createElement("div");
    hud.className = "present-hud";
    hud.innerHTML = `<button class="btn sm" data-prev>←</button><span class="btn sm" data-count></span>
      <button class="btn sm" data-next>→</button><button class="btn sm" data-notes>Notes</button>
      <button class="btn sm" data-exit>Exit</button>`;
    back.append(hud);
    document.body.append(back);
    presenting = back;

    const paint = () => {
      paintSlide(host, c.slides[idx], theme(c));
      hud.querySelector("[data-count]").textContent = `${idx + 1} / ${c.slides.length}`;
      notes.textContent = c.slides[idx].notes || "No notes for this slide.";
      notes.hidden = !showNotes;
    };
    const go = (d) => { idx = Math.max(0, Math.min(c.slides.length - 1, idx + d)); paint(); };
    const key = (ev) => {
      if (ev.key === "ArrowRight" || ev.key === " " || ev.key === "PageDown") go(1);
      else if (ev.key === "ArrowLeft" || ev.key === "PageUp") go(-1);
      else if (ev.key.toLowerCase() === "n") { showNotes = !showNotes; paint(); }
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
    hud.querySelector("[data-notes]").onclick = () => { showNotes = !showNotes; paint(); };
    hud.querySelector("[data-exit]").onclick = exit;
    host.onclick = () => go(1);
    document.addEventListener("keydown", key);
    back.requestFullscreen?.().catch(() => {});
    paint();
  }

  /* ---------------- export ---------------- */
  $("#export-html").onclick = () => {
    download(exportHTML(c, project.name), project.name.replace(/\s+/g, "_") + ".html", "text/html");
    api.toast("Saved — open the file in any browser to present.");
  };

  /* ---------------- keyboard ---------------- */
  function onKey(ev) {
    if (root.hidden) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || "")) return;
    if (ev.key === "PageDown") { current = Math.min(c.slides.length - 1, current + 1); renderAll(); }
    else if (ev.key === "PageUp") { current = Math.max(0, current - 1); renderAll(); }
  }
  document.addEventListener("keydown", onKey);

  function renderAll() {
    renderList();
    renderLayouts();
    renderFields();
    renderCanvas();
  }

  const ro = new ResizeObserver(() => renderCanvas());
  ro.observe(canvas);
  renderAll();

  return {
    destroy() {
      document.removeEventListener("keydown", onKey);
      ro.disconnect();
      presenting?.remove();
      api.save(c);
    },
  };
}

/* ===========================================================
   One painter, used by the editor, present mode and the
   full-screen viewer, so what you type is what they see.
   =========================================================== */
function paintSlide(host, s, t) {
  const k = (host.clientWidth || 960) / 1000;          // everything scales with the box
  host.style.background = t.bg;
  host.style.color = t.text;
  host.innerHTML = renderLayout(s, t, k);
}

function renderLayout(s, t, k) {
  const px = (n) => n * k + "px";
  const kind = layoutOf(s);
  const title = (size = 62, color = t.text) =>
    s.title ? `<div class="d-title" style="font-size:${px(size)};color:${color}">${escapeHtml(s.title)}</div>` : "";
  const list = (items, size = 34) =>
    `<ul class="d-list" style="font-size:${px(size)}">${(items || [])
      .map((b) => `<li><span class="d-dot" style="background:${t.accent}"></span>${escapeHtml(b)}</li>`)
      .join("")}</ul>`;

  if (kind === "title")
    return `<div class="d-pad d-center" style="padding:${px(70)}">
      ${title(84)}
      <div class="d-rule" style="background:${t.accent};height:${px(6)};width:${px(160)}"></div>
      <div class="d-sub" style="font-size:${px(34)};color:${t.dim}">${escapeHtml(s.subtitle || "")}</div>
    </div>`;

  if (kind === "number")
    return `<div class="d-pad d-center" style="padding:${px(60)}">
      ${title(46, t.dim)}
      <div class="d-big" style="font-size:${px(190)};color:${t.accent}">${escapeHtml(s.number || "")}</div>
      <div class="d-sub" style="font-size:${px(34)}">${escapeHtml(s.subtitle || "")}</div>
    </div>`;

  if (kind === "quote")
    return `<div class="d-pad d-center" style="padding:${px(80)}">
      <div class="d-quote" style="font-size:${px(52)}">“${escapeHtml(s.quote || "")}”</div>
      <div class="d-sub" style="font-size:${px(30)};color:${t.dim}">${escapeHtml(s.subtitle || "")}</div>
    </div>`;

  if (kind === "two")
    return `<div class="d-pad" style="padding:${px(56)}">
      ${title()}
      <div class="d-cols" style="gap:${px(40)};margin-top:${px(24)}">
        <div class="d-col" style="background:${t.panel};border-radius:${px(16)};padding:${px(26)}">${list(s.left, 30)}</div>
        <div class="d-col" style="background:${t.panel};border-radius:${px(16)};padding:${px(26)}">${list(s.right, 30)}</div>
      </div>
    </div>`;

  if (kind === "image")
    return `<div class="d-pad" style="padding:${px(56)}">
      ${title(54)}
      <div class="d-cols" style="gap:${px(36)};margin-top:${px(20)}">
        <div class="d-col">${
          s.src
            ? `<img class="d-img" src="${escapeHtml(s.src)}" style="border-radius:${px(14)}" alt="" />`
            : `<div class="d-imgless" style="background:${t.panel};border-radius:${px(14)};font-size:${px(24)};color:${t.dim}">Add a picture on the right →</div>`
        }</div>
        <div class="d-col">${list(s.bullets, 30)}</div>
      </div>
    </div>`;

  return `<div class="d-pad" style="padding:${px(60)}">
    ${title()}
    <div class="d-rule" style="background:${t.accent};height:${px(5)};width:${px(110)};margin:${px(14)} 0 ${px(26)}"></div>
    ${list(s.bullets)}
  </div>`;
}

/* ---------------- present-only mount (the Present button on a card) ---------------- */
function mountPresent(root, c) {
  let idx = 0, showNotes = false;
  root.innerHTML = `
    <div class="present-stage deck-present-stage">
      <div class="deck-canvas" id="pdeck"></div>
      <div class="deck-notes" id="pnotes" hidden></div>
      <div class="present-count">
        <button class="btn sm" data-prev>←</button>
        <span data-count></span>
        <button class="btn sm" data-next>→</button>
        <button class="btn sm" data-notes>Notes</button>
      </div>
    </div>`;

  const host = root.querySelector("#pdeck");
  const notes = root.querySelector("#pnotes");
  const counter = root.querySelector("[data-count]");

  const paint = () => {
    paintSlide(host, c.slides[idx], theme(c));
    counter.textContent = `${idx + 1} / ${c.slides.length}`;
    notes.textContent = c.slides[idx].notes || "No notes for this slide.";
    notes.hidden = !showNotes;
  };
  const go = (d) => { idx = Math.max(0, Math.min(c.slides.length - 1, idx + d)); paint(); };

  root.querySelector("[data-prev]").onclick = (e) => { e.stopPropagation(); go(-1); };
  root.querySelector("[data-next]").onclick = (e) => { e.stopPropagation(); go(1); };
  root.querySelector("[data-notes]").onclick = (e) => { e.stopPropagation(); showNotes = !showNotes; paint(); };
  host.onclick = () => go(1);

  const onKey = (e) => {
    if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") { e.preventDefault(); go(1); }
    else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); go(-1); }
    else if (e.key.toLowerCase() === "n") { showNotes = !showNotes; paint(); }
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
function exportHTML(c, name) {
  const t = theme(c);
  const sections = c.slides
    .map((s) => `<section>${renderLayout(s, t, 1.6)}</section>`)
    .join("");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(name)}</title>
<style>
  *{box-sizing:border-box;margin:0}
  body{background:#000;font-family:-apple-system,Segoe UI,Roboto,sans-serif;overflow:hidden;color:${t.text}}
  section{position:absolute;inset:0;display:none;background:${t.bg}}
  section.on{display:block}
  .d-pad{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center}
  .d-center{align-items:center;text-align:center}
  .d-title{font-weight:800;line-height:1.15}
  .d-sub{margin-top:14px;line-height:1.4}
  .d-rule{border-radius:99px;margin:18px 0}
  .d-big{font-weight:900;line-height:1}
  .d-quote{font-style:italic;line-height:1.35;font-weight:600}
  .d-list{list-style:none;display:flex;flex-direction:column;gap:.6em}
  .d-list li{display:flex;align-items:baseline;gap:.6em;line-height:1.35}
  .d-dot{width:.42em;height:.42em;border-radius:50%;flex:0 0 auto}
  .d-cols{display:flex;flex:1;min-height:0}
  .d-col{flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center}
  .d-img{width:100%;display:block}
  .d-imgless{flex:1;display:grid;place-items:center}
  .hud{position:fixed;bottom:14px;left:50%;transform:translateX(-50%);font-size:13px;opacity:.55;z-index:9}
</style></head><body>${sections}
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
const sid = () => "d" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

export function blankSlide(layout = "bullets") {
  return { id: sid(), layout, title: "", subtitle: "", bullets: [], left: [], right: [], number: "", quote: "", src: "", notes: "" };
}

function headline(s) {
  return (s.title || s.quote || s.number || "").slice(0, 34);
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}
