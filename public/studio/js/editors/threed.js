/* ===========================================================
   threed.js — 3D creation editor.
   Rotate a built-in shape, something you drew yourself, or your
   own .obj; colour it, give it motion, and export it back out.
   =========================================================== */

import { createViewer, primitives, parseOBJ, toOBJ, shapeInfo, defaultParams } from "../gl.js";
import { drawingToMesh, drawingTexture, triangleCount } from "../trace.js";
import { openDrawPad } from "../drawpad.js";

const SHAPES = Object.entries(shapeInfo).map(([key, info]) => [key, info.label]);
const COLORS = ["#6ea8fe", "#a78bfa", "#4ade80", "#fbbf24", "#f87171", "#38bdf8", "#fb923c", "#e8eef7"];
const MOTIONS = [["spin", "Spin"], ["bob", "Bob"], ["orbit", "Orbit"], ["pulse", "Pulse"], ["none", "Still"]];

export function mount(root, project, api, opts = {}) {
  const c = project.content;

  root.innerHTML = `
    <div class="tools">
      <div class="tgroup">
        <div class="tlabel">Draw your own</div>
        <button class="btn primary" id="btn-draw">✏️ Draw it and make it 3D</button>
        <div class="mini">Doodles, words and emoji all turn into a solid you can spin.</div>
        <div id="draw-panel" hidden>
          <div class="trow"><button class="btn" id="btn-use-draw">Use my drawing</button></div>
          <label class="pad-check"><input type="checkbox" id="draw-colours" checked> Keep the colours I drew</label>
          <div class="field"><label>Thickness</label>
            <input type="range" id="draw-depth" min="0.05" max="2" step="0.05">
            <span class="num-out" id="draw-depth-out"></span></div>
          <div class="trow"><button class="btn danger" id="btn-drop-draw">Throw the drawing away</button></div>
        </div>
        <div class="mini" id="draw-info"></div>
      </div>
      <div class="tgroup">
        <div class="tlabel">Or a ready-made shape</div>
        <div class="trow wrap" id="shapes"></div>
      </div>
      <div class="tgroup">
        <div class="tlabel">Change it with an equation</div>
        <div class="mini" id="eq-help"></div>
        <textarea id="eq" class="eq-box" rows="3" spellcheck="false" placeholder="r = 5"></textarea>
        <div class="trow">
          <button class="btn primary" id="eq-apply">Apply</button>
          <button class="btn" id="eq-reset">Back to normal</button>
        </div>
        <div class="mini" id="eq-msg"></div>
      </div>
      <div class="tgroup">
        <div class="tlabel">Zoom</div>
        <div class="trow">
          <button class="btn" id="zoom-in">➕ In</button>
          <button class="btn" id="zoom-out">➖ Out</button>
          <button class="btn" id="zoom-fit">⤢ Fit</button>
        </div>
      </div>
      <div class="tgroup">
        <div class="tlabel">Your own model</div>
        <button class="btn" id="btn-load">📁 Load .obj file</button>
        <button class="btn" id="btn-paste">📋 Paste .obj text</button>
        <input type="file" id="file" accept=".obj,text/plain" hidden />
        <div class="mini" id="obj-info"></div>
      </div>
      <div class="tgroup">
        <div class="tlabel">Colour</div>
        <div class="swatches" id="swatches"></div>
        <div class="trow"><button class="btn" id="btn-wire">Wireframe: off</button></div>
      </div>
      <div class="tgroup">
        <div class="tlabel">Background</div>
        <div class="swatches" id="bgs"></div>
      </div>
      <div class="tgroup">
        <div class="tlabel">Motion</div>
        <div class="trow" id="motions"></div>
        <div class="field"><label>Speed</label>
          <input type="range" id="speed" min="0" max="3" step="0.05" />
          <span class="num-out" id="speed-out"></span></div>
        <div class="trow"><button class="btn" id="btn-play">⏸ Pause</button>
          <button class="btn" id="btn-reset">Reset view</button></div>
      </div>
      <div class="tgroup">
        <div class="tlabel">Label</div>
        <input type="text" id="label" placeholder="e.g. Volume of a cube" />
      </div>
      <div class="tgroup">
        <div class="tlabel">Export</div>
        <button class="btn" id="btn-obj">⬇ Download .obj</button>
        <button class="btn" id="btn-png">⬇ Download picture</button>
      </div>
    </div>
    <div class="stage">
      <div class="gl-wrap">
        <canvas id="gl"></canvas>
        <div class="gl-hud">Drag to rotate · scroll to zoom<div id="hud-label"></div></div>
        <div class="gl-zoom">
          <button class="btn sm" id="z-in" title="Zoom in">＋</button>
          <button class="btn sm" id="z-out" title="Zoom out">－</button>
          <button class="btn sm" id="z-fit" title="Fit on screen">⤢</button>
        </div>
      </div>
    </div>`;

  const $ = (s) => root.querySelector(s);
  const canvas = $("#gl");
  let viewer;
  try {
    viewer = createViewer(canvas, { color: c.color, bg: c.bg });
  } catch (e) {
    root.innerHTML = `<div class="empty" style="margin:auto"><h2>WebGL unavailable</h2><p>${e.message}</p></div>`;
    return { destroy() {} };
  }

  /* ---------- mesh handling ---------- */
  const shapeKey = () => (shapeInfo[c.shape] ? c.shape : "cube");
  const hasDrawing = () => !!c.drawing?.items?.length;
  const usingDrawing = () => hasDrawing() && c.useDrawing !== false && !c.obj;

  function applyMesh() {
    try {
      if (c.obj) {
        viewer.setMesh(parseOBJ(c.obj));
        viewer.setTexture(null);
        $("#obj-info").textContent = `Custom .obj loaded (${(viewer.state.count / 3) | 0} triangles)`;
      } else if (usingDrawing()) {
        const m = drawingToMesh(c.drawing, { depth: c.drawDepth ?? 0.4 });
        if (!m) throw new Error("that drawing came out empty");
        viewer.setMesh(m);
        // wrap the solid in the drawing itself, so an emoji stays the colours
        // it actually is instead of coming out as one flat blob
        applyDrawColours();
        $("#obj-info").textContent = "Showing your drawing.";
        $("#draw-info").textContent = `Your drawing, ${triangleCount(m).toLocaleString()} triangles.`;
      } else {
        viewer.setMesh(primitives[shapeKey()](c.params || {}));
        viewer.setTexture(null);
        $("#obj-info").textContent = "Using a built-in shape.";
      }
    } catch (e) {
      api.toast("Could not build that: " + e.message);
      c.obj = null;
      c.useDrawing = false;
      viewer.setTexture(null);
      viewer.setMesh(primitives.cube());
    }
  }

  Object.assign(viewer.state, {
    color: c.color, bg: c.bg, wireframe: !!c.wireframe,
    autoSpin: c.autoSpin !== false, spinSpeed: c.spinSpeed ?? 0.6, motion: c.motion || "spin",
  });
  applyMesh();
  viewer.fit();
  viewer.attachControls();
  viewer.start();

  const saveSoon = debounce(() => api.save(c), 400);

  /* ---------- shapes ---------- */
  const shapesRow = $("#shapes");
  SHAPES.forEach(([key, label]) => {
    const b = document.createElement("button");
    b.className = "btn" + (!c.obj && c.shape === key ? " active" : "");
    b.textContent = label;
    b.onclick = () => {
      // keep any letter the new shape also uses, so "r = 5" survives sphere -> cone
      const kept = {};
      for (const k of Object.keys(defaultParams(key))) if (c.params && k in c.params) kept[k] = c.params[k];
      c.shape = key;
      c.params = { ...defaultParams(key), ...kept };
      c.obj = null;
      c.useDrawing = false;                 // the drawing is kept, just not shown
      applyMesh();
      viewer.fit();
      showDrawPanel();
      [...shapesRow.children].forEach((x) => x.classList.toggle("active", x === b));
      showEquations();
      saveSoon();
    };
    shapesRow.append(b);
  });
  const markShapeButtons = () => {
    const on = !c.obj && !usingDrawing();
    [...shapesRow.children].forEach((x, i) => x.classList.toggle("active", on && SHAPES[i][0] === c.shape));
  };

  /* ---------- draw your own ---------- */
  /** Paint the solid with the drawing, or leave it one flat colour. */
  function applyDrawColours() {
    const on = c.drawColours !== false;
    viewer.setTexture(on && hasDrawing() ? drawingTexture(c.drawing, c.color || "#6ea8fe") : null);
  }

  function showDrawPanel() {
    $("#draw-panel").hidden = !hasDrawing();
    $("#btn-draw").textContent = hasDrawing() ? "✏️ Change my drawing" : "✏️ Draw it and make it 3D";
    $("#draw-colours").checked = c.drawColours !== false;
    const depth = $("#draw-depth");
    depth.value = c.drawDepth ?? 0.4;
    $("#draw-depth-out").textContent = (+depth.value).toFixed(2);
    $("#btn-use-draw").classList.toggle("active", usingDrawing());
    $("#btn-use-draw").disabled = usingDrawing();
    if (!hasDrawing()) $("#draw-info").textContent = "";
    else if (!usingDrawing()) $("#draw-info").textContent = "Your drawing is saved — press “Use my drawing” to show it.";
    markShapeButtons();
  }

  $("#btn-draw").onclick = () => {
    openDrawPad({
      drawing: c.drawing,
      ink: c.color || "#6ea8fe",
      onSave: (drawing) => {
        if (!drawing.items.length) {
          c.drawing = null;
          c.useDrawing = false;
          api.toast("Nothing was drawn, so the shape stayed as it was.");
        } else {
          c.drawing = drawing;
          c.useDrawing = true;
          c.obj = null;
          c.drawDepth = c.drawDepth ?? 0.4;
        }
        applyMesh();
        viewer.fit();
        showDrawPanel();
        showEquations();
        saveSoon();
      },
    });
  };
  $("#btn-use-draw").onclick = () => {
    if (!hasDrawing()) return;
    c.useDrawing = true;
    c.obj = null;
    applyMesh();
    viewer.fit();
    showDrawPanel();
    showEquations();
    saveSoon();
  };
  $("#btn-drop-draw").onclick = () => {
    c.drawing = null;
    c.useDrawing = false;
    applyMesh();
    viewer.fit();
    showDrawPanel();
    showEquations();
    saveSoon();
    api.toast("Drawing removed.");
  };
  const coloursBox = $("#draw-colours");
  coloursBox.onchange = () => {
    c.drawColours = coloursBox.checked;
    applyDrawColours();
    viewer.draw();
    saveSoon();
  };

  const depthSlider = $("#draw-depth");
  depthSlider.oninput = () => {
    c.drawDepth = +depthSlider.value;
    $("#draw-depth-out").textContent = c.drawDepth.toFixed(2);
    if (usingDrawing()) applyMesh();
    saveSoon();
  };
  showDrawPanel();

  /* ---------- equations ---------- */
  /**
   * The student writes one line per letter, e.g. "r = 5". Each letter really is
   * the letter in the formula that builds the shape, so the picture changes.
   */
  function showEquations() {
    const key = shapeKey();
    const info = shapeInfo[key];
    const p = { ...defaultParams(key), ...(c.params || {}) };
    $("#eq-help").innerHTML =
      `<b>${info.label}</b> uses: ` +
      Object.entries(info.params).map(([k, [, what]]) => `<code>${k}</code> = ${what}`).join(" · ");
    $("#eq").value = Object.keys(info.params).map((k) => `${k} = ${round(p[k])}`).join("\n");
    const off = !!c.obj || usingDrawing();
    $("#eq").disabled = off;
    $("#eq-msg").textContent = c.obj
      ? "Equations apply to the ready-made shapes, not a loaded .obj."
      : usingDrawing()
        ? "Your drawing is showing — use the Thickness slider above to change it."
        : "";
  }

  function applyEquations() {
    const key = shapeKey();
    const allowed = Object.keys(shapeInfo[key].params);
    const next = { ...defaultParams(key), ...(c.params || {}) };
    const unknown = [];
    let changed = 0;

    for (const line of $("#eq").value.split(/[\n;]+/)) {
      const t = line.trim();
      if (!t) continue;
      const m = t.match(/^([A-Za-z]+)\s*=\s*(.+)$/);
      if (!m) { unknown.push(t); continue; }
      const name = m[1];
      const value = evalNumber(m[2]);
      if (value === null) { unknown.push(t); continue; }
      const letter = allowed.includes(name) ? name
        : allowed.find((a) => a.toLowerCase() === name.toLowerCase());
      if (!letter) { unknown.push(name); continue; }
      next[letter] = value;
      changed++;
    }

    c.params = next;
    applyMesh();
    viewer.fit();
    showEquations();
    saveSoon();
    $("#eq-msg").textContent = unknown.length
      ? `Changed ${changed}. I could not use: ${unknown.join(", ")} — try ${allowed.map((a) => a + " = 2").join(", ")}.`
      : `Done — ${Object.entries(next).map(([k, v]) => `${k} = ${round(v)}`).join(", ")}.`;
  }

  $("#eq-apply").onclick = applyEquations;
  $("#eq").addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); applyEquations(); }
  });
  $("#eq-reset").onclick = () => {
    c.params = defaultParams(shapeKey());
    applyMesh();
    viewer.fit();
    showEquations();
    saveSoon();
    $("#eq-msg").textContent = "Back to the normal size.";
  };
  showEquations();

  /* ---------- zoom ---------- */
  const zoomIn = () => viewer.zoomBy(0.8);
  const zoomOut = () => viewer.zoomBy(1.25);
  const zoomFit = () => viewer.fit();
  [["#zoom-in", zoomIn], ["#zoom-out", zoomOut], ["#zoom-fit", zoomFit],
   ["#z-in", zoomIn], ["#z-out", zoomOut], ["#z-fit", zoomFit]].forEach(([sel, fn]) => {
    const b = $(sel);
    if (b) b.onclick = fn;
  });
  const onZoomKey = (e) => {
    if (root.hidden) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || "")) return;
    if (e.key === "+" || e.key === "=") zoomIn();
    else if (e.key === "-" || e.key === "_") zoomOut();
    else if (e.key.toLowerCase() === "f") zoomFit();
    else return;
    e.preventDefault();
  };
  document.addEventListener("keydown", onZoomKey);

  /* ---------- obj loading ---------- */
  $("#btn-load").onclick = () => $("#file").click();
  $("#file").onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const text = await f.text();
    loadObjText(text, f.name);
    e.target.value = "";
  };
  $("#btn-paste").onclick = () => {
    const text = prompt("Paste the contents of an .obj file:");
    if (text) loadObjText(text, "pasted");
  };
  function loadObjText(text, name) {
    try {
      viewer.setMesh(parseOBJ(text));
      c.obj = text;
      c.objName = name;
      [...shapesRow.children].forEach((x) => x.classList.remove("active"));
      $("#obj-info").textContent = `Loaded ${name} (${(viewer.state.count / 3) | 0} triangles)`;
      viewer.fit();
      showDrawPanel();
      showEquations();
      api.toast("Model loaded — drag it around!");
      saveSoon();
    } catch (err) {
      api.toast("That .obj could not be read: " + err.message);
    }
  }
  // drag & drop straight onto the canvas
  const stage = root.querySelector(".stage");
  const onDragOver = (e) => { e.preventDefault(); stage.style.outline = "2px dashed var(--accent)"; };
  const onDragLeave = () => (stage.style.outline = "none");
  const onDrop = async (e) => {
    e.preventDefault();
    stage.style.outline = "none";
    const f = e.dataTransfer.files[0];
    if (f) loadObjText(await f.text(), f.name);
  };
  stage.addEventListener("dragover", onDragOver);
  stage.addEventListener("dragleave", onDragLeave);
  stage.addEventListener("drop", onDrop);

  /* ---------- colours ---------- */
  buildSwatches($("#swatches"), COLORS, c.color, (col) => {
    c.color = viewer.state.color = col;
    if (usingDrawing()) { applyDrawColours(); viewer.draw(); }
    saveSoon();
  });
  buildSwatches($("#bgs"), ["#0a0e14", "#111a2b", "#1e1b34", "#0f2419", "#2b1d1d", "#f8fafc"], c.bg, (col) => {
    c.bg = viewer.state.bg = col;
    saveSoon();
  });

  $("#btn-wire").onclick = (e) => {
    c.wireframe = viewer.state.wireframe = !viewer.state.wireframe;
    e.target.textContent = "Wireframe: " + (c.wireframe ? "on" : "off");
    e.target.classList.toggle("active", c.wireframe);
    saveSoon();
  };
  $("#btn-wire").textContent = "Wireframe: " + (c.wireframe ? "on" : "off");
  $("#btn-wire").classList.toggle("active", !!c.wireframe);

  /* ---------- motion ---------- */
  const motionRow = $("#motions");
  MOTIONS.forEach(([key, label]) => {
    const b = document.createElement("button");
    b.className = "btn" + (viewer.state.motion === key ? " active" : "");
    b.textContent = label;
    b.onclick = () => {
      c.motion = viewer.state.motion = key;
      viewer.state.autoSpin = c.autoSpin = key !== "none";
      [...motionRow.children].forEach((x) => x.classList.toggle("active", x === b));
      saveSoon();
    };
    motionRow.append(b);
  });

  const speed = $("#speed");
  speed.value = viewer.state.spinSpeed;
  $("#speed-out").textContent = (+speed.value).toFixed(2);
  speed.oninput = () => {
    c.spinSpeed = viewer.state.spinSpeed = +speed.value;
    $("#speed-out").textContent = (+speed.value).toFixed(2);
    saveSoon();
  };

  $("#btn-play").onclick = (e) => {
    if (viewer.state.running) { viewer.stop(); e.target.textContent = "▶ Play"; }
    else { viewer.start(); e.target.textContent = "⏸ Pause"; }
  };
  $("#btn-reset").onclick = () => {
    Object.assign(viewer.state, { rotX: -0.35, rotY: 0.6, spin: 0 });
    viewer.fit();
    viewer.draw();
  };

  /* ---------- label ---------- */
  const label = $("#label");
  label.value = c.label || "";
  $("#hud-label").textContent = c.label || "";
  label.oninput = () => {
    c.label = label.value;
    $("#hud-label").textContent = c.label;
    saveSoon();
  };

  /* ---------- export ---------- */
  $("#btn-obj").onclick = () => {
    const text = c.obj || toOBJ(viewer.state.mesh, project.name.replace(/\s+/g, "_"));
    download(text, project.name.replace(/\s+/g, "_") + ".obj", "text/plain");
  };
  $("#btn-png").onclick = () => {
    viewer.draw();
    canvas.toBlob((b) => download(b, project.name.replace(/\s+/g, "_") + ".png"));
  };

  // presenting: no toolbars (hidden by CSS), always moving, label shown big
  if (opts.present) {
    const hud = $(".gl-hud");
    hud.classList.add("big-label");
    hud.firstChild.textContent = "";           // drop the "drag to rotate" hint
    viewer.state.autoSpin = c.motion !== "none";
    viewer.start();
  }

  const onResize = () => viewer.draw();
  window.addEventListener("resize", onResize);

  return {
    destroy() {
      viewer.stop();
      window.removeEventListener("resize", onResize);
      document.removeEventListener("keydown", onZoomKey);
      stage.removeEventListener("dragover", onDragOver);
      stage.removeEventListener("dragleave", onDragLeave);
      stage.removeEventListener("drop", onDrop);
      api.save(c);
    },
  };
}

/* ---------------- equation helpers ---------------- */
/** Tidy number for display: 5, 2.5, 0.28 — never 0.2800000000000001. */
function round(n) {
  return Math.round(Number(n) * 1000) / 1000;
}

/**
 * Works out the right-hand side of "r = ...". Plain numbers and simple sums
 * only — anything with a letter or a symbol we don't allow is rejected rather
 * than run, so nothing typed here can turn into code.
 */
function evalNumber(src) {
  const t = String(src).trim().replace(/,/g, ".").replace(/×/g, "*").replace(/÷/g, "/");
  if (!/^[0-9+\-*/(). ]+$/.test(t)) return null;
  try {
    const v = Function(`"use strict";return (${t});`)();
    return Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

/* ---------------- shared helpers ---------------- */
export function buildSwatches(host, colors, current, onPick) {
  host.innerHTML = "";
  colors.forEach((col) => {
    const s = document.createElement("div");
    s.className = "sw" + (col === current ? " active" : "");
    s.style.background = col;
    s.onclick = () => {
      [...host.children].forEach((x) => x.classList.toggle("active", x === s));
      onPick(col);
    };
    host.append(s);
  });
}

export function debounce(fn, ms) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}

export function download(data, filename, type) {
  const blob = data instanceof Blob ? data : new Blob([data], { type: type || "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
