/* ===========================================================
   gl.js — a tiny WebGL renderer + .obj loader/exporter.
   No third-party libraries: everything here is hand rolled so
   the studio works with zero downloads.
   =========================================================== */

/* ---------------- mat4 helpers (column major) ---------------- */
export const M4 = {
  identity: () => new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]),
  multiply(a, b) {
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++)
      for (let r = 0; r < 4; r++) {
        let s = 0;
        for (let k = 0; k < 4; k++) s += a[r + k * 4] * b[k + c * 4];
        o[r + c * 4] = s;
      }
    return o;
  },
  perspective(fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    return new Float32Array([
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (far + near) * nf, -1,
      0, 0, 2 * far * near * nf, 0,
    ]);
  },
  translation(x, y, z) {
    const m = M4.identity(); m[12] = x; m[13] = y; m[14] = z; return m;
  },
  scaling(s) {
    const m = M4.identity(); m[0] = m[5] = m[10] = s; return m;
  },
  rotationX(a) {
    const c = Math.cos(a), s = Math.sin(a), m = M4.identity();
    m[5] = c; m[6] = s; m[9] = -s; m[10] = c; return m;
  },
  rotationY(a) {
    const c = Math.cos(a), s = Math.sin(a), m = M4.identity();
    m[0] = c; m[2] = -s; m[8] = s; m[10] = c; return m;
  },
  rotationZ(a) {
    const c = Math.cos(a), s = Math.sin(a), m = M4.identity();
    m[0] = c; m[1] = s; m[4] = -s; m[5] = c; return m;
  },
};

/* ---------------- mesh building ---------------- */
function mesh(positions, normals) {
  return { positions: new Float32Array(positions), normals: new Float32Array(normals) };
}

function faceNormal(a, b, c) {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const l = Math.hypot(...n) || 1;
  return [n[0] / l, n[1] / l, n[2] / l];
}

function fromTriangles(tris, smooth) {
  const pos = [], nor = [];
  for (const [a, b, c] of tris) {
    const fn = faceNormal(a, b, c);
    for (const p of [a, b, c]) {
      pos.push(p[0], p[1], p[2]);
      if (smooth) {
        const l = Math.hypot(p[0], p[1], p[2]) || 1;
        nor.push(p[0] / l, p[1] / l, p[2] / l);
      } else nor.push(fn[0], fn[1], fn[2]);
    }
  }
  return mesh(pos, nor);
}

export const primitives = {
  cube(s = 0.8) {
    const v = [
      [-s,-s,-s],[ s,-s,-s],[ s, s,-s],[-s, s,-s],
      [-s,-s, s],[ s,-s, s],[ s, s, s],[-s, s, s],
    ];
    const q = [[4,5,6,7],[1,0,3,2],[3,2,6,7],[0,1,5,4],[5,1,2,6],[0,4,7,3]];
    const tris = [];
    for (const [a,b,c,d] of q) { tris.push([v[a],v[b],v[c]]); tris.push([v[a],v[c],v[d]]); }
    return fromTriangles(tris, false);
  },
  sphere(r = 0.9, seg = 32) {
    const tris = [];
    const P = (i, j) => {
      const phi = (i / seg) * Math.PI, th = (j / seg) * Math.PI * 2;
      return [r * Math.sin(phi) * Math.cos(th), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(th)];
    };
    for (let i = 0; i < seg; i++)
      for (let j = 0; j < seg; j++) {
        const a = P(i, j), b = P(i + 1, j), c = P(i + 1, j + 1), d = P(i, j + 1);
        tris.push([a, b, c], [a, c, d]);
      }
    return fromTriangles(tris, true);
  },
  torus(R = 0.65, r = 0.28, n = 40, m = 20) {
    const pos = [], nor = [];
    const P = (i, j) => {
      const u = (i / n) * Math.PI * 2, v = (j / m) * Math.PI * 2;
      const cx = R * Math.cos(u), cz = R * Math.sin(u);
      const x = (R + r * Math.cos(v)) * Math.cos(u);
      const y = r * Math.sin(v);
      const z = (R + r * Math.cos(v)) * Math.sin(u);
      const nx = x - cx, ny = y, nz = z - cz;
      const l = Math.hypot(nx, ny, nz) || 1;
      return { p: [x, y, z], n: [nx / l, ny / l, nz / l] };
    };
    for (let i = 0; i < n; i++)
      for (let j = 0; j < m; j++) {
        const a = P(i, j), b = P(i + 1, j), c = P(i + 1, j + 1), d = P(i, j + 1);
        for (const t of [[a,b,c],[a,c,d]])
          for (const k of t) { pos.push(...k.p); nor.push(...k.n); }
      }
    return mesh(pos, nor);
  },
  pyramid(s = 0.85) {
    const apex = [0, s, 0];
    const b = [[-s,-s*0.7,-s],[s,-s*0.7,-s],[s,-s*0.7,s],[-s,-s*0.7,s]];
    const tris = [[b[0],b[2],b[1]],[b[0],b[3],b[2]],
      [b[0],b[1],apex],[b[1],b[2],apex],[b[2],b[3],apex],[b[3],b[0],apex]];
    return fromTriangles(tris, false);
  },
  cylinder(r = 0.6, h = 0.9, seg = 32) {
    const tris = [];
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      const p0 = [r * Math.cos(a0), -h, r * Math.sin(a0)];
      const p1 = [r * Math.cos(a1), -h, r * Math.sin(a1)];
      const p2 = [r * Math.cos(a1), h, r * Math.sin(a1)];
      const p3 = [r * Math.cos(a0), h, r * Math.sin(a0)];
      tris.push([p0, p1, p2], [p0, p2, p3]);
      tris.push([[0, h, 0], p3, p2], [[0, -h, 0], p1, p0]);
    }
    return fromTriangles(tris, false);
  },
  prism(s = 0.8) {
    const t = [[0, s, 0], [-s, -s, 0], [s, -s, 0]];
    const f = t.map((p) => [p[0], p[1], s * 0.7]);
    const b = t.map((p) => [p[0], p[1], -s * 0.7]);
    const tris = [[f[0], f[1], f[2]], [b[0], b[2], b[1]]];
    for (let i = 0; i < 3; i++) {
      const j = (i + 1) % 3;
      tris.push([f[i], b[i], b[j]], [f[i], b[j], f[j]]);
    }
    return fromTriangles(tris, false);
  },
  octahedron(s = 0.95) {
    const v = [[s,0,0],[-s,0,0],[0,s,0],[0,-s,0],[0,0,s],[0,0,-s]];
    const idx = [[0,2,4],[2,1,4],[1,3,4],[3,0,4],[2,0,5],[1,2,5],[3,1,5],[0,3,5]];
    return fromTriangles(idx.map(([a,b,c]) => [v[a], v[b], v[c]]), false);
  },
};

/* ---------------- .obj import / export ---------------- */
export function parseOBJ(text) {
  const V = [], VN = [], pos = [], nor = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const t = line.trim();
    if (!t || t[0] === "#") continue;
    const parts = t.split(/\s+/);
    if (parts[0] === "v") V.push([+parts[1], +parts[2], +parts[3]]);
    else if (parts[0] === "vn") VN.push([+parts[1], +parts[2], +parts[3]]);
    else if (parts[0] === "f") {
      const verts = parts.slice(1).map((tok) => {
        const [vi, , ni] = tok.split("/");
        const vIdx = +vi < 0 ? V.length + +vi : +vi - 1;
        const nIdx = ni ? (+ni < 0 ? VN.length + +ni : +ni - 1) : -1;
        return { p: V[vIdx], n: nIdx >= 0 ? VN[nIdx] : null };
      }).filter((x) => x.p);
      for (let i = 1; i + 1 < verts.length; i++) {
        const tri = [verts[0], verts[i], verts[i + 1]];
        const fn = faceNormal(tri[0].p, tri[1].p, tri[2].p);
        for (const v of tri) {
          pos.push(v.p[0], v.p[1], v.p[2]);
          const n = v.n || fn;
          nor.push(n[0], n[1], n[2]);
        }
      }
    }
  }
  if (!pos.length) throw new Error("No faces found in that .obj file.");
  return normalizeMesh(mesh(pos, nor));
}

/** Center a mesh on the origin and scale it to a friendly size. */
export function normalizeMesh(m) {
  const p = m.positions;
  let min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.length; i += 3)
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], p[i + k]);
      max[k] = Math.max(max[k], p[i + k]);
    }
  const c = [0, 1, 2].map((k) => (min[k] + max[k]) / 2);
  const size = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]) || 1;
  const s = 1.7 / size;
  for (let i = 0; i < p.length; i += 3)
    for (let k = 0; k < 3; k++) p[i + k] = (p[i + k] - c[k]) * s;
  return m;
}

export function toOBJ(m, name = "model") {
  const p = m.positions;
  const out = [`# exported from Joseph's Math Studio`, `o ${name}`];
  for (let i = 0; i < p.length; i += 3) out.push(`v ${p[i].toFixed(5)} ${p[i + 1].toFixed(5)} ${p[i + 2].toFixed(5)}`);
  const n = m.normals;
  for (let i = 0; i < n.length; i += 3) out.push(`vn ${n[i].toFixed(5)} ${n[i + 1].toFixed(5)} ${n[i + 2].toFixed(5)}`);
  for (let i = 0; i < p.length / 3; i += 3) {
    const a = i + 1, b = i + 2, c = i + 3;
    out.push(`f ${a}//${a} ${b}//${b} ${c}//${c}`);
  }
  return out.join("\n");
}

/* ---------------- shaders ---------------- */
const VS = `
attribute vec3 aPos;
attribute vec3 aNor;
uniform mat4 uProj, uView, uModel;
varying vec3 vNor, vPos;
void main(){
  vec4 world = uModel * vec4(aPos, 1.0);
  vNor = mat3(uModel) * aNor;
  vPos = world.xyz;
  gl_Position = uProj * uView * world;
}`;

const FS = `
precision mediump float;
varying vec3 vNor, vPos;
uniform vec3 uColor;
uniform float uFlat;
void main(){
  vec3 n = normalize(vNor);
  vec3 lightDir = normalize(vec3(0.5, 0.85, 0.7));
  float diff = max(dot(n, lightDir), 0.0);
  vec3 viewDir = normalize(vec3(0.0, 0.0, 5.0) - vPos);
  vec3 h = normalize(lightDir + viewDir);
  float spec = pow(max(dot(n, h), 0.0), 40.0) * 0.35;
  float rim = pow(1.0 - max(dot(n, viewDir), 0.0), 3.0) * 0.25;
  vec3 col = uColor * (0.28 + 0.75 * diff) + vec3(spec + rim);
  gl_FragColor = vec4(mix(col, uColor, uFlat), 1.0);
}`;

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) || "shader error");
  return sh;
}

export function hexToRgb(hex) {
  const h = String(hex ?? "").replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  if (!Number.isFinite(n)) return [0.43, 0.66, 1];      // fall back to the studio blue
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/* ---------------- viewer ---------------- */
export function createViewer(canvas, opts = {}) {
  const transparent = !!opts.transparent;
  const gl = canvas.getContext("webgl", { antialias: true, alpha: transparent, preserveDrawingBuffer: true });
  if (!gl) throw new Error("WebGL is not available in this browser.");

  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VS));
  gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog);
  gl.useProgram(prog);

  const loc = {
    pos: gl.getAttribLocation(prog, "aPos"),
    nor: gl.getAttribLocation(prog, "aNor"),
    proj: gl.getUniformLocation(prog, "uProj"),
    view: gl.getUniformLocation(prog, "uView"),
    model: gl.getUniformLocation(prog, "uModel"),
    color: gl.getUniformLocation(prog, "uColor"),
    flat: gl.getUniformLocation(prog, "uFlat"),
  };
  const bufPos = gl.createBuffer(), bufNor = gl.createBuffer(), bufLine = gl.createBuffer();

  gl.enable(gl.DEPTH_TEST);

  const state = {
    mesh: null, count: 0, lineCount: 0,
    color: opts.color || "#6ea8fe",
    bg: opts.bg || "#0a0e14",
    wireframe: false,
    rotX: -0.35, rotY: 0.6, dist: 4.2,
    spin: 0, autoSpin: true, spinSpeed: 0.6, motion: "spin",
    time: 0, running: false, raf: 0, extraModel: null,
  };

  function setMesh(m) {
    state.mesh = m;
    state.count = m.positions.length / 3;
    gl.bindBuffer(gl.ARRAY_BUFFER, bufPos);
    gl.bufferData(gl.ARRAY_BUFFER, m.positions, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, bufNor);
    gl.bufferData(gl.ARRAY_BUFFER, m.normals, gl.STATIC_DRAW);
    // wireframe edges
    const lines = new Float32Array(state.count * 6);
    let k = 0;
    for (let i = 0; i < state.count; i += 3) {
      const idx = [i, i + 1, i + 1, i + 2, i + 2, i];
      for (const j of idx) {
        lines[k++] = m.positions[j * 3];
        lines[k++] = m.positions[j * 3 + 1];
        lines[k++] = m.positions[j * 3 + 2];
      }
    }
    state.lineCount = k / 3;
    gl.bindBuffer(gl.ARRAY_BUFFER, bufLine);
    gl.bufferData(gl.ARRAY_BUFFER, lines.subarray(0, k), gl.STATIC_DRAW);
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, canvas.clientWidth || canvas.width);
    const h = Math.max(1, canvas.clientHeight || canvas.height);
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    }
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  function modelMatrix(t) {
    let m = M4.multiply(M4.rotationY(state.rotY + state.spin), M4.rotationX(state.rotX));
    if (state.motion === "bob") m = M4.multiply(M4.translation(0, Math.sin(t * 2) * 0.35, 0), m);
    if (state.motion === "orbit") m = M4.multiply(M4.translation(Math.cos(t) * 0.9, 0, Math.sin(t) * 0.9), m);
    if (state.motion === "pulse") m = M4.multiply(m, M4.scaling(1 + Math.sin(t * 2.4) * 0.16));
    return m;
  }

  function draw(t = state.time) {
    if (!state.mesh) return;
    resize();
    const [r, g, b] = hexToRgb(state.bg);
    if (transparent) gl.clearColor(0, 0, 0, 0);
    else gl.clearColor(r, g, b, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const proj = M4.perspective(Math.PI / 4, canvas.width / canvas.height, 0.1, 100);
    const view = M4.translation(0, 0, -state.dist);
    const model = state.extraModel ? M4.multiply(state.extraModel, modelMatrix(t)) : modelMatrix(t);

    gl.useProgram(prog);
    gl.uniformMatrix4fv(loc.proj, false, proj);
    gl.uniformMatrix4fv(loc.view, false, view);
    gl.uniformMatrix4fv(loc.model, false, model);
    gl.uniform3fv(loc.color, hexToRgb(state.color));

    if (state.wireframe) {
      gl.uniform1f(loc.flat, 1);
      gl.bindBuffer(gl.ARRAY_BUFFER, bufLine);
      gl.enableVertexAttribArray(loc.pos);
      gl.vertexAttribPointer(loc.pos, 3, gl.FLOAT, false, 0, 0);
      gl.disableVertexAttribArray(loc.nor);
      gl.vertexAttrib3f(loc.nor, 0, 0, 1);
      gl.drawArrays(gl.LINES, 0, state.lineCount);
    } else {
      gl.uniform1f(loc.flat, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, bufPos);
      gl.enableVertexAttribArray(loc.pos);
      gl.vertexAttribPointer(loc.pos, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, bufNor);
      gl.enableVertexAttribArray(loc.nor);
      gl.vertexAttribPointer(loc.nor, 3, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, state.count);
    }
  }

  let last = performance.now();
  function loop(now) {
    if (!state.running) return;
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    state.time += dt;
    if (state.autoSpin && state.motion !== "none") state.spin += dt * state.spinSpeed;
    draw(state.time);
    state.raf = requestAnimationFrame(loop);
  }

  function start() {
    if (state.running) return;
    state.running = true;
    last = performance.now();
    state.raf = requestAnimationFrame(loop);
  }
  function stop() {
    state.running = false;
    cancelAnimationFrame(state.raf);
  }

  /* mouse / touch orbit */
  function attachControls(target = canvas) {
    let dragging = false, px = 0, py = 0;
    const down = (e) => {
      dragging = true;
      const p = point(e);
      px = p.x; py = p.y;
      target.style.cursor = "grabbing";
    };
    const move = (e) => {
      if (!dragging) return;
      const p = point(e);
      state.rotY += (p.x - px) * 0.01;
      state.rotX += (p.y - py) * 0.01;
      state.rotX = Math.max(-1.55, Math.min(1.55, state.rotX));
      px = p.x; py = p.y;
      if (!state.running) draw();
      e.preventDefault();
    };
    const up = () => { dragging = false; target.style.cursor = "grab"; };
    const wheel = (e) => {
      state.dist = Math.max(1.6, Math.min(14, state.dist + e.deltaY * 0.004));
      if (!state.running) draw();
      e.preventDefault();
    };
    const point = (e) => (e.touches ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : { x: e.clientX, y: e.clientY });

    target.style.cursor = "grab";
    target.addEventListener("mousedown", down);
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    target.addEventListener("touchstart", down, { passive: true });
    target.addEventListener("touchmove", move, { passive: false });
    target.addEventListener("touchend", up);
    target.addEventListener("wheel", wheel, { passive: false });

    return () => {
      target.removeEventListener("mousedown", down);
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      target.removeEventListener("wheel", wheel);
    };
  }

  return { gl, canvas, state, setMesh, draw, start, stop, resize, attachControls };
}
