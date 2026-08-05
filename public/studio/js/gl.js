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

/** Glue several meshes into one so a shape can be built out of parts. */
function mergeMeshes(list) {
  const parts = list.filter(Boolean);
  const total = parts.reduce((n, m) => n + m.positions.length, 0);
  const pos = new Float32Array(total), nor = new Float32Array(total);
  let k = 0;
  for (const m of parts) { pos.set(m.positions, k); nor.set(m.normals, k); k += m.positions.length; }
  return { positions: pos, normals: nor };
}

/** Scale → rotate → move a mesh. Used to assemble figures out of primitives. */
function xform(m, { scale = [1, 1, 1], rot = [0, 0, 0], pos = [0, 0, 0] } = {}) {
  const s = Array.isArray(scale) ? scale : [scale, scale, scale];
  const [rx, ry, rz] = rot;
  const rotate = (v) => {
    let [x, y, z] = v;
    if (rz) { const c = Math.cos(rz), n = Math.sin(rz); [x, y] = [x * c - y * n, x * n + y * c]; }
    if (rx) { const c = Math.cos(rx), n = Math.sin(rx); [y, z] = [y * c - z * n, y * n + z * c]; }
    if (ry) { const c = Math.cos(ry), n = Math.sin(ry); [x, z] = [x * c + z * n, -x * n + z * c]; }
    return [x, y, z];
  };
  const P = new Float32Array(m.positions), N = new Float32Array(m.normals);
  for (let i = 0; i < P.length; i += 3) {
    const p = rotate([P[i] * s[0], P[i + 1] * s[1], P[i + 2] * s[2]]);
    P[i] = p[0] + pos[0]; P[i + 1] = p[1] + pos[1]; P[i + 2] = p[2] + pos[2];
    // normals use the inverse scale, otherwise squashing a part lights it wrongly
    const n = rotate([N[i] / (s[0] || 1), N[i + 1] / (s[1] || 1), N[i + 2] / (s[2] || 1)]);
    const l = Math.hypot(n[0], n[1], n[2]) || 1;
    N[i] = n[0] / l; N[i + 1] = n[1] / l; N[i + 2] = n[2] / l;
  }
  return { positions: P, normals: N };
}

/**
 * Spin a 2D outline (x = distance from the middle, y = height) around the
 * y-axis. Cones, capsules, domes and rings are all just different outlines.
 */
function lathe(profile, seg = 40) {
  const pos = [], nor = [];
  const ring = [];
  for (let j = 0; j <= seg; j++) {
    const a = (j / seg) * Math.PI * 2;
    ring.push([Math.cos(a), Math.sin(a)]);
  }
  for (let i = 0; i + 1 < profile.length; i++) {
    const [x0, y0] = profile[i], [x1, y1] = profile[i + 1];
    const dx = x1 - x0, dy = y1 - y0;
    const nl = Math.hypot(dx, dy) || 1;
    const n2 = [dy / nl, -dx / nl];                     // outward normal of this segment
    for (let j = 0; j < seg; j++) {
      const [c0, s0] = ring[j], [c1, s1] = ring[j + 1];
      const a = [x0 * c0, y0, x0 * s0], b = [x1 * c0, y1, x1 * s0];
      const cc = [x1 * c1, y1, x1 * s1], d = [x0 * c1, y0, x0 * s1];
      const na = [n2[0] * c0, n2[1], n2[0] * s0], nb = [n2[0] * c1, n2[1], n2[0] * s1];
      for (const [p, n] of [[a, na], [b, na], [cc, nb], [a, na], [cc, nb], [d, nb]]) {
        pos.push(p[0], p[1], p[2]);
        nor.push(n[0], n[1], n[2]);
      }
    }
  }
  return mesh(pos, nor);
}

/** A flat disc (or washer) facing up or down — the lids on lathed shapes. */
function disc(outer, inner, y, dir, seg = 40) {
  const pos = [], nor = [];
  for (let j = 0; j < seg; j++) {
    const a0 = (j / seg) * Math.PI * 2, a1 = ((j + 1) / seg) * Math.PI * 2;
    const o0 = [outer * Math.cos(a0), y, outer * Math.sin(a0)];
    const o1 = [outer * Math.cos(a1), y, outer * Math.sin(a1)];
    const i0 = [inner * Math.cos(a0), y, inner * Math.sin(a0)];
    const i1 = [inner * Math.cos(a1), y, inner * Math.sin(a1)];
    const tris = dir > 0 ? [[i0, o0, o1], [i0, o1, i1]] : [[i0, o1, o0], [i0, i1, o1]];
    for (const t of tris) for (const p of t) { pos.push(p[0], p[1], p[2]); nor.push(0, dir, 0); }
  }
  return mesh(pos, nor);
}

/** A rectangular block from corner to corner. */
function box(w, h, d, cx = 0, cy = 0, cz = 0) {
  const x = w / 2, y = h / 2, z = d / 2;
  const v = [
    [-x,-y,-z],[ x,-y,-z],[ x, y,-z],[-x, y,-z],
    [-x,-y, z],[ x,-y, z],[ x, y, z],[-x, y, z],
  ];
  const q = [[4,5,6,7],[1,0,3,2],[3,2,6,7],[0,1,5,4],[5,1,2,6],[0,4,7,3]];
  const tris = [];
  for (const [a,b,c,d2] of q) { tris.push([v[a],v[b],v[c]], [v[a],v[c],v[d2]]); }
  // built around the origin so the outward test works, then moved into place
  const m = fromTrianglesOutward(tris, false);
  return cx || cy || cz ? xform(m, { pos: [cx, cy, cz] }) : m;
}

/** Pull a closed 2D outline out into a slab — stars, hearts, arrows. */
function extrude(outline, depth) {
  const z = depth / 2, tris = [], pos = [], nor = [];
  const cx = outline.reduce((s, p) => s + p[0], 0) / outline.length;
  const cy = outline.reduce((s, p) => s + p[1], 0) / outline.length;
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i], b = outline[(i + 1) % outline.length];
    tris.push([[cx, cy, z], [a[0], a[1], z], [b[0], b[1], z]]);
    tris.push([[cx, cy, -z], [b[0], b[1], -z], [a[0], a[1], -z]]);
  }
  const caps = fromTriangles(tris, false);
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i], b = outline[(i + 1) % outline.length];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    const n = [dy / l, -dx / l, 0];
    const quad = [[a[0],a[1],z],[a[0],a[1],-z],[b[0],b[1],-z],[a[0],a[1],z],[b[0],b[1],-z],[b[0],b[1],z]];
    for (const p of quad) { pos.push(p[0], p[1], p[2]); nor.push(n[0], n[1], n[2]); }
  }
  return mergeMeshes([caps, mesh(pos, nor)]);
}

/** Points around a star with `n` spikes. */
function starOutline(R, r, n) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
    const rad = i % 2 ? r : R;
    pts.push([Math.cos(a) * rad, Math.sin(a) * rad]);
  }
  return pts;
}

/** The rounded-end outline used for arms, legs and pills. */
function capsuleProfile(r, h, steps = 10) {
  const straight = Math.max(0, h / 2 - r);
  const p = [[0, -straight - r]];
  for (let i = 1; i <= steps; i++) {
    const a = (i / steps) * (Math.PI / 2);
    p.push([r * Math.sin(a), -straight - r * Math.cos(a)]);
  }
  p.push([r, straight]);
  for (let i = 1; i <= steps; i++) {
    const a = (i / steps) * (Math.PI / 2);
    p.push([r * Math.cos(a), straight + r * Math.sin(a)]);
  }
  return p;
}

/* ===========================================================
   The shape library. Every shape takes a plain object of
   letters, so `r = 5` from the equation box really is the r in
   the formula that builds it.
   =========================================================== */
export const shapeInfo = {
  cube:        { label: "Cube",     params: { s: [1.6, "side length"] } },
  sphere:      { label: "Sphere",   params: { r: [0.9, "radius"] } },
  cylinder:    { label: "Cylinder", params: { r: [0.6, "radius"], h: [1.8, "height"] } },
  cone:        { label: "Cone",     params: { r: [0.8, "radius"], h: [1.8, "height"] } },
  pyramid:     { label: "Pyramid",  params: { s: [1.7, "base side"], h: [1.7, "height"] } },
  torus:       { label: "Donut",    params: { R: [0.65, "ring radius"], r: [0.28, "tube radius"] } },
  prism:       { label: "Prism",    params: { s: [1.6, "triangle side"], d: [1.1, "depth"] } },
  octahedron:  { label: "Octa",     params: { s: [0.95, "point distance"] } },
  tetrahedron: { label: "Tetra",    params: { s: [1.7, "edge length"] } },
  icosahedron: { label: "Icosa",    params: { r: [0.95, "radius"] } },
  hemisphere:  { label: "Dome",     params: { r: [1, "radius"] } },
  capsule:     { label: "Capsule",  params: { r: [0.45, "radius"], h: [1.9, "height"] } },
  ring:        { label: "Ring",     params: { R: [0.95, "outer radius"], r: [0.55, "inner radius"], d: [0.3, "thickness"] } },
  star:        { label: "Star",     params: { R: [1, "outer radius"], r: [0.42, "inner radius"], n: [5, "points"], d: [0.3, "thickness"] } },
  heart:       { label: "Heart",    params: { s: [1, "size"], d: [0.4, "thickness"] } },
  arrow:       { label: "Arrow",    params: { h: [2, "length"], r: [0.22, "thickness"] } },
  human:       { label: "Human",    params: { h: [2, "height"] } },
  house:       { label: "House",    params: { w: [1.5, "width"], h: [1.9, "height"] } },
  tree:        { label: "Tree",     params: { h: [2.2, "height"], r: [0.85, "leaf radius"] } },
};

/** The defaults for a shape, e.g. defaultParams("sphere") -> { r: 0.9 }. */
export function defaultParams(key) {
  const info = shapeInfo[key];
  if (!info) return {};
  return Object.fromEntries(Object.entries(info.params).map(([k, [v]]) => [k, v]));
}

/** Fill in anything the caller left out, and refuse silly values. */
function withDefaults(key, given) {
  const out = defaultParams(key);
  for (const [k, v] of Object.entries(given || {})) {
    const n = Number(v);
    if (k in out && Number.isFinite(n)) out[k] = n;
  }
  for (const k of Object.keys(out)) out[k] = Math.max(0.01, Math.min(60, out[k]));
  return out;
}

/**
 * Same as fromTriangles, but any triangle facing the middle of the shape is
 * turned around first. A face wound the wrong way gets its light from inside
 * and comes out black, which is what used to happen to the pyramid.
 * Only correct for shapes that bulge outwards from their centre — which is
 * every solid that uses it here.
 */
function fromTrianglesOutward(tris, smooth) {
  const fixed = tris.map(([a, b, c]) => {
    const n = faceNormal(a, b, c);
    const mid = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
    return n[0] * mid[0] + n[1] * mid[1] + n[2] * mid[2] < 0 ? [a, c, b] : [a, b, c];
  });
  return fromTriangles(fixed, smooth);
}

export const primitives = {
  cube(p) {
    const { s } = withDefaults("cube", p);
    return box(s, s, s);
  },
  sphere(p, seg = 32) {
    const { r } = withDefaults("sphere", p);
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
  torus(p, n = 44, m = 22) {
    const { R, r } = withDefaults("torus", p);
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
  pyramid(p) {
    const { s, h } = withDefaults("pyramid", p);
    const half = s / 2, y = h / 2;
    const apex = [0, y, 0];
    const b = [[-half,-y,-half],[half,-y,-half],[half,-y,half],[-half,-y,half]];
    const tris = [[b[0],b[2],b[1]],[b[0],b[3],b[2]],
      [b[0],b[1],apex],[b[1],b[2],apex],[b[2],b[3],apex],[b[3],b[0],apex]];
    return fromTrianglesOutward(tris, false);
  },
  cylinder(p) {
    const { r, h } = withDefaults("cylinder", p);
    return mergeMeshes([
      lathe([[r, -h / 2], [r, h / 2]]),
      disc(r, 0, h / 2, 1),
      disc(r, 0, -h / 2, -1),
    ]);
  },
  cone(p) {
    const { r, h } = withDefaults("cone", p);
    return mergeMeshes([lathe([[r, -h / 2], [0, h / 2]]), disc(r, 0, -h / 2, -1)]);
  },
  prism(p) {
    const { s, d } = withDefaults("prism", p);
    const half = s / 2, y = (s * Math.sqrt(3)) / 4;
    const t = [[0, y, 0], [-half, -y, 0], [half, -y, 0]];
    const f = t.map((q) => [q[0], q[1], d / 2]);
    const b = t.map((q) => [q[0], q[1], -d / 2]);
    const tris = [[f[0], f[1], f[2]], [b[0], b[2], b[1]]];
    for (let i = 0; i < 3; i++) {
      const j = (i + 1) % 3;
      tris.push([f[i], b[i], b[j]], [f[i], b[j], f[j]]);
    }
    return fromTrianglesOutward(tris, false);
  },
  octahedron(p) {
    const { s } = withDefaults("octahedron", p);
    const v = [[s,0,0],[-s,0,0],[0,s,0],[0,-s,0],[0,0,s],[0,0,-s]];
    const idx = [[0,2,4],[2,1,4],[1,3,4],[3,0,4],[2,0,5],[1,2,5],[3,1,5],[0,3,5]];
    return fromTrianglesOutward(idx.map(([a,b,c]) => [v[a], v[b], v[c]]), false);
  },
  tetrahedron(p) {
    const { s } = withDefaults("tetrahedron", p);
    const H = s * Math.sqrt(2 / 3);          // height of a regular tetrahedron
    const R = s / Math.sqrt(3);              // how far each base corner sits from the middle
    const base = [90, 210, 330].map((deg) => {
      const a = (deg * Math.PI) / 180;
      return [R * Math.cos(a), -H / 2, R * Math.sin(a)];
    });
    const apex = [0, H / 2, 0];
    const tris = [
      base,
      [base[0], base[1], apex], [base[1], base[2], apex], [base[2], base[0], apex],
    ];
    return fromTrianglesOutward(tris, false);
  },
  icosahedron(p) {
    const { r } = withDefaults("icosahedron", p);
    const t = (1 + Math.sqrt(5)) / 2;
    const raw = [
      [-1,t,0],[1,t,0],[-1,-t,0],[1,-t,0],
      [0,-1,t],[0,1,t],[0,-1,-t],[0,1,-t],
      [t,0,-1],[t,0,1],[-t,0,-1],[-t,0,1],
    ];
    const k = r / Math.hypot(1, t);
    const v = raw.map((q) => q.map((n) => n * k));
    const idx = [
      [0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],
      [1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],
      [3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],
      [4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1],
    ];
    return fromTrianglesOutward(idx.map(([a,b,c]) => [v[a], v[b], v[c]]), false);
  },
  hemisphere(p, steps = 20) {
    const { r } = withDefaults("hemisphere", p);
    const prof = [];
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * (Math.PI / 2);
      prof.push([r * Math.cos(a), -r / 2 + r * Math.sin(a)]);
    }
    return mergeMeshes([lathe(prof), disc(r, 0, -r / 2, -1)]);
  },
  capsule(p) {
    const { r, h } = withDefaults("capsule", p);
    return lathe(capsuleProfile(r, Math.max(h, r * 2)));
  },
  ring(p) {
    const { R, r, d } = withDefaults("ring", p);
    const inner = Math.min(r, R * 0.95);
    return mergeMeshes([
      lathe([[R, -d / 2], [R, d / 2]]),
      lathe([[inner, d / 2], [inner, -d / 2]]),
      disc(R, inner, d / 2, 1),
      disc(R, inner, -d / 2, -1),
    ]);
  },
  star(p) {
    const { R, r, n, d } = withDefaults("star", p);
    return extrude(starOutline(R, Math.min(r, R * 0.9), Math.max(3, Math.round(n))), d);
  },
  heart(p, steps = 60) {
    const { s, d } = withDefaults("heart", p);
    const k = s / 17;
    const pts = [];
    for (let i = 0; i < steps; i++) {
      const t = (i / steps) * Math.PI * 2;
      pts.push([
        16 * Math.sin(t) ** 3 * k,
        (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) * k,
      ]);
    }
    return extrude(pts.reverse(), d);
  },
  arrow(p) {
    const { h, r } = withDefaults("arrow", p);
    const headH = Math.min(h * 0.4, h - 0.05);
    const shaftH = h - headH;
    return mergeMeshes([
      xform(primitives.cylinder({ r, h: shaftH }), { pos: [0, -h / 2 + shaftH / 2, 0] }),
      xform(primitives.cone({ r: r * 2.2, h: headH }), { pos: [0, h / 2 - headH / 2, 0] }),
    ]);
  },
  /* A figure: head, neck, body, two arms, two legs, two feet. `h` is how tall
     it stands — measured, not guessed, so "h = 3" really is three units tall. */
  human(p) {
    const { h } = withDefaults("human", p);
    const u = 1;                                        // build at a natural size, then fit to h
    const headR = u * 0.17;
    const armR = u * 0.072, legR = u * 0.095;
    const torso = xform(primitives.capsule({ r: u * 0.21, h: u * 0.8 }), {
      scale: [1, 1, 0.6], pos: [0, u * 0.2, 0],
    });
    const neck = xform(primitives.cylinder({ r: u * 0.06, h: u * 0.1 }), { pos: [0, u * 0.63, 0] });
    const head = xform(primitives.sphere({ r: headR }), { scale: [0.92, 1, 0.92], pos: [0, u * 0.78, 0] });
    const arm = (side) =>
      xform(primitives.capsule({ r: armR, h: u * 0.72 }), {
        rot: [0, 0, side * 0.16],
        pos: [side * u * 0.29, u * 0.2, 0],
      });
    const leg = (side) =>
      xform(primitives.capsule({ r: legR, h: u * 0.86 }), {
        rot: [0, 0, side * 0.06],
        pos: [side * u * 0.12, -u * 0.63, 0],
      });
    const foot = (side) => box(u * 0.17, u * 0.08, u * 0.3, side * u * 0.14, -u * 1.04, u * 0.07);
    return fitHeight(
      mergeMeshes([torso, neck, head, arm(1), arm(-1), leg(1), leg(-1), foot(1), foot(-1)]),
      h
    );
  },
  house(p) {
    const { w, h } = withDefaults("house", p);
    const wallH = h * 0.58, roofH = h * 0.42;
    return fitHeight(mergeMeshes([
      box(w, wallH, w * 0.85, 0, wallH / 2, 0),
      xform(primitives.pyramid({ s: w * 1.2, h: roofH }), { scale: [1, 1, 0.85], pos: [0, wallH + roofH / 2, 0] }),
      box(w * 0.26, wallH * 0.55, w * 0.04, 0, wallH * 0.275, w * 0.435),
      box(w * 0.2, wallH * 0.2, w * 0.04, -w * 0.28, wallH * 0.66, w * 0.435),
      box(w * 0.2, wallH * 0.2, w * 0.04, w * 0.28, wallH * 0.66, w * 0.435),
    ]), h);
  },
  tree(p) {
    const { h, r } = withDefaults("tree", p);
    const trunkH = h * 0.34;
    return fitHeight(mergeMeshes([
      xform(primitives.cylinder({ r: r * 0.2, h: trunkH * 1.2 }), { pos: [0, trunkH * 0.6, 0] }),
      xform(primitives.sphere({ r }), { scale: [1, 1.1, 1], pos: [0, trunkH + r * 0.72, 0] }),
      xform(primitives.sphere({ r: r * 0.72 }), { pos: [-r * 0.68, trunkH + r * 0.3, r * 0.28] }),
      xform(primitives.sphere({ r: r * 0.64 }), { pos: [r * 0.7, trunkH + r * 0.42, -r * 0.24] }),
    ]), h);
  },
};

/** Scale a built-up figure to exactly `h` tall and stand it on the origin. */
function fitHeight(m, h) {
  const p = m.positions;
  let lo = Infinity, hi = -Infinity;
  for (let i = 1; i < p.length; i += 3) { lo = Math.min(lo, p[i]); hi = Math.max(hi, p[i]); }
  const span = hi - lo || 1;
  return xform(m, { scale: h / span, pos: [0, -((lo + hi) / 2) * (h / span), 0] });
}

/** How far the shape reaches from the middle — used to frame the camera. */
export function meshRadius(m) {
  const p = m.positions;
  let max = 0;
  for (let i = 0; i < p.length; i += 3) max = Math.max(max, Math.hypot(p[i], p[i + 1], p[i + 2]));
  return max || 1;
}

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

  const MIN_DIST = 0.6, MAX_DIST = 120;
  /** Multiply the camera distance — 0.8 steps in, 1.25 steps out. */
  function zoomBy(f) {
    state.dist = Math.max(MIN_DIST, Math.min(MAX_DIST, state.dist * f));
    if (!state.running) draw();
    return state.dist;
  }
  /**
   * Pull back just far enough that the whole shape is on screen. The camera
   * sees an angle of 45°, so it has to sit at radius / tan(22.5°) — about
   * 2.4 radii — and a little further again so nothing touches the edges.
   */
  function fit(pad = 3) {
    if (!state.mesh) return state.dist;
    state.dist = Math.max(MIN_DIST, Math.min(MAX_DIST, meshRadius(state.mesh) * pad));
    if (!state.running) draw();
    return state.dist;
  }

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
      zoomBy(Math.exp(e.deltaY * 0.0012));
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

  return { gl, canvas, state, setMesh, draw, start, stop, resize, attachControls, zoomBy, fit };
}
