/* ===========================================================
   threed.js — 3D creation editor.
   Rotate a built-in shape or your own .obj, colour it, give it
   motion, and export the result back out as .obj.
   =========================================================== */

import { createViewer, primitives, parseOBJ, toOBJ } from "../gl.js";

const SHAPES = [
  ["cube", "Cube"], ["sphere", "Sphere"], ["torus", "Torus"], ["pyramid", "Pyramid"],
  ["cylinder", "Cylinder"], ["prism", "Prism"], ["octahedron", "Octa"],
];
const COLORS = ["#6ea8fe", "#a78bfa", "#4ade80", "#fbbf24", "#f87171", "#38bdf8", "#fb923c", "#e8eef7"];
const MOTIONS = [["spin", "Spin"], ["bob", "Bob"], ["orbit", "Orbit"], ["pulse", "Pulse"], ["none", "Still"]];

export function mount(root, project, api) {
  const c = project.content;

  root.innerHTML = `
    <div class="tools">
      <div class="tgroup">
        <div class="tlabel">Shape</div>
        <div class="trow" id="shapes"></div>
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
  function applyMesh() {
    try {
      if (c.obj) viewer.setMesh(parseOBJ(c.obj));
      else viewer.setMesh(primitives[c.shape] ? primitives[c.shape]() : primitives.cube());
      $("#obj-info").textContent = c.obj ? `Custom .obj loaded (${(viewer.state.count / 3) | 0} triangles)` : "Using a built-in shape.";
    } catch (e) {
      api.toast("Could not read that model: " + e.message);
      c.obj = null;
      viewer.setMesh(primitives.cube());
    }
  }

  Object.assign(viewer.state, {
    color: c.color, bg: c.bg, wireframe: !!c.wireframe,
    autoSpin: c.autoSpin !== false, spinSpeed: c.spinSpeed ?? 0.6, motion: c.motion || "spin",
  });
  applyMesh();
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
      c.shape = key;
      c.obj = null;
      applyMesh();
      [...shapesRow.children].forEach((x) => x.classList.toggle("active", x === b));
      saveSoon();
    };
    shapesRow.append(b);
  });

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
    Object.assign(viewer.state, { rotX: -0.35, rotY: 0.6, dist: 4.2, spin: 0 });
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

  const onResize = () => viewer.draw();
  window.addEventListener("resize", onResize);

  return {
    destroy() {
      viewer.stop();
      window.removeEventListener("resize", onResize);
      stage.removeEventListener("dragover", onDragOver);
      stage.removeEventListener("dragleave", onDragLeave);
      stage.removeEventListener("drop", onDrop);
      api.save(c);
    },
  };
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
