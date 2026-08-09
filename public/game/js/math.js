'use strict';
/* ------------------------------------------------------------------
   math.js — vectors, matrices, random helpers.
   Vectors are plain 3-element arrays. Matrices are column-major
   Float32Array(16), matching what WebGL expects.
   ------------------------------------------------------------------ */

const DEG = Math.PI / 180;
const TAU = Math.PI * 2;

function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function lerp(a, b, t) { return a + (b - a) * t; }
function smoothstep(t) { return t * t * (3 - 2 * t); }
function sign(v) { return v < 0 ? -1 : (v > 0 ? 1 : 0); }
function rand(a = 0, b = 1) { return a + Math.random() * (b - a); }
function randi(a, b) { return Math.floor(a + Math.random() * (b - a + 1)); }
function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }
function approach(cur, target, delta) {
  if (cur < target) return Math.min(cur + delta, target);
  if (cur > target) return Math.max(cur - delta, target);
  return target;
}
/** Shortest signed angular difference a->b, in radians. */
function angleDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/** Small deterministic PRNG (mulberry32) — used for stable spray patterns. */
function makeRng(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ----------------------------- vec3 ----------------------------- */

const V = {
  set(o, x, y, z) { o[0] = x; o[1] = y; o[2] = z; return o; },
  copy(a) { return [a[0], a[1], a[2]]; },
  add(a, b, o = [0, 0, 0]) { o[0] = a[0] + b[0]; o[1] = a[1] + b[1]; o[2] = a[2] + b[2]; return o; },
  sub(a, b, o = [0, 0, 0]) { o[0] = a[0] - b[0]; o[1] = a[1] - b[1]; o[2] = a[2] - b[2]; return o; },
  mul(a, s, o = [0, 0, 0]) { o[0] = a[0] * s; o[1] = a[1] * s; o[2] = a[2] * s; return o; },
  mad(a, b, s, o = [0, 0, 0]) { o[0] = a[0] + b[0] * s; o[1] = a[1] + b[1] * s; o[2] = a[2] + b[2] * s; return o; },
  dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; },
  cross(a, b, o = [0, 0, 0]) {
    const x = a[1] * b[2] - a[2] * b[1];
    const y = a[2] * b[0] - a[0] * b[2];
    const z = a[0] * b[1] - a[1] * b[0];
    o[0] = x; o[1] = y; o[2] = z; return o;
  },
  len(a) { return Math.hypot(a[0], a[1], a[2]); },
  len2(a) { return a[0] * a[0] + a[1] * a[1] + a[2] * a[2]; },
  dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); },
  dist2(a, b) { const x = a[0] - b[0], y = a[1] - b[1], z = a[2] - b[2]; return x * x + y * y + z * z; },
  distXZ(a, b) { return Math.hypot(a[0] - b[0], a[2] - b[2]); },
  norm(a, o = [0, 0, 0]) {
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    o[0] = a[0] / l; o[1] = a[1] / l; o[2] = a[2] / l; return o;
  },
  lerp(a, b, t, o = [0, 0, 0]) {
    o[0] = a[0] + (b[0] - a[0]) * t;
    o[1] = a[1] + (b[1] - a[1]) * t;
    o[2] = a[2] + (b[2] - a[2]) * t;
    return o;
  },
};

/** Direction vector from yaw/pitch (yaw 0 looks down -Z, +yaw turns left). */
function angleVector(yaw, pitch, o = [0, 0, 0]) {
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  o[0] = -Math.sin(yaw) * cp;
  o[1] = sp;
  o[2] = -Math.cos(yaw) * cp;
  return o;
}

/* ----------------------------- mat4 ----------------------------- */

const M4 = {
  create() {
    const m = new Float32Array(16);
    m[0] = m[5] = m[10] = m[15] = 1;
    return m;
  },
  identity(m) {
    m.fill(0); m[0] = m[5] = m[10] = m[15] = 1; return m;
  },
  perspective(fovy, aspect, near, far, out = M4.create()) {
    const f = 1 / Math.tan(fovy / 2);
    out.fill(0);
    out[0] = f / aspect; out[5] = f;
    out[10] = (far + near) / (near - far); out[11] = -1;
    out[14] = (2 * far * near) / (near - far);
    return out;
  },
  ortho(l, r, b, t, n, f, out = M4.create()) {
    out.fill(0);
    out[0] = 2 / (r - l); out[5] = 2 / (t - b); out[10] = -2 / (f - n);
    out[12] = -(r + l) / (r - l); out[13] = -(t + b) / (t - b); out[14] = -(f + n) / (f - n);
    out[15] = 1;
    return out;
  },
  lookAt(eye, center, up, out = M4.create()) {
    const z = V.norm(V.sub(eye, center));
    let x = V.cross(up, z);
    if (V.len2(x) < 1e-8) { x = V.cross([up[1], up[2], up[0]], z); }
    V.norm(x, x);
    const y = V.cross(z, x);
    out[0] = x[0]; out[1] = y[0]; out[2] = z[0]; out[3] = 0;
    out[4] = x[1]; out[5] = y[1]; out[6] = z[1]; out[7] = 0;
    out[8] = x[2]; out[9] = y[2]; out[10] = z[2]; out[11] = 0;
    out[12] = -V.dot(x, eye); out[13] = -V.dot(y, eye); out[14] = -V.dot(z, eye); out[15] = 1;
    return out;
  },
  mul(a, b, out = M4.create()) {
    // out = a * b
    for (let c = 0; c < 4; c++) {
      const b0 = b[c * 4], b1 = b[c * 4 + 1], b2 = b[c * 4 + 2], b3 = b[c * 4 + 3];
      out[c * 4 + 0] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3;
      out[c * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3;
      out[c * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
      out[c * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
    }
    return out;
  },
  translation(x, y, z, out = M4.create()) {
    M4.identity(out); out[12] = x; out[13] = y; out[14] = z; return out;
  },
  scaling(x, y, z, out = M4.create()) {
    M4.identity(out); out[0] = x; out[5] = y; out[10] = z; return out;
  },
  rotY(a, out = M4.create()) {
    const c = Math.cos(a), s = Math.sin(a);
    M4.identity(out); out[0] = c; out[2] = -s; out[8] = s; out[10] = c; return out;
  },
  rotX(a, out = M4.create()) {
    const c = Math.cos(a), s = Math.sin(a);
    M4.identity(out); out[5] = c; out[6] = s; out[9] = -s; out[10] = c; return out;
  },
  rotZ(a, out = M4.create()) {
    const c = Math.cos(a), s = Math.sin(a);
    M4.identity(out); out[0] = c; out[1] = s; out[4] = -s; out[5] = c; return out;
  },
  /** Translate * RotY * RotX * RotZ * Scale — the transform every model uses. */
  compose(pos, yaw, pitch, roll, scale, out = M4.create()) {
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const cx = Math.cos(pitch), sx = Math.sin(pitch);
    const cz = Math.cos(roll), sz = Math.sin(roll);
    const sxArr = Array.isArray(scale) ? scale : [scale, scale, scale];
    // R = Ry * Rx * Rz
    const m00 = cy * cz + sy * sx * sz, m01 = cx * sz, m02 = -sy * cz + cy * sx * sz;
    const m10 = -cy * sz + sy * sx * cz, m11 = cx * cz, m12 = sy * sz + cy * sx * cz;
    const m20 = sy * cx, m21 = -sx, m22 = cy * cx;
    out[0] = m00 * sxArr[0]; out[1] = m10 * sxArr[0]; out[2] = m20 * sxArr[0]; out[3] = 0;
    out[4] = m01 * sxArr[1]; out[5] = m11 * sxArr[1]; out[6] = m21 * sxArr[1]; out[7] = 0;
    out[8] = m02 * sxArr[2]; out[9] = m12 * sxArr[2]; out[10] = m22 * sxArr[2]; out[11] = 0;
    out[12] = pos[0]; out[13] = pos[1]; out[14] = pos[2]; out[15] = 1;
    return out;
  },
  transformPoint(m, p, o = [0, 0, 0]) {
    const x = p[0], y = p[1], z = p[2];
    o[0] = m[0] * x + m[4] * y + m[8] * z + m[12];
    o[1] = m[1] * x + m[5] * y + m[9] * z + m[13];
    o[2] = m[2] * x + m[6] * y + m[10] * z + m[14];
    return o;
  },
  transformDir(m, p, o = [0, 0, 0]) {
    const x = p[0], y = p[1], z = p[2];
    o[0] = m[0] * x + m[4] * y + m[8] * z;
    o[1] = m[1] * x + m[5] * y + m[9] * z;
    o[2] = m[2] * x + m[6] * y + m[10] * z;
    return o;
  },
};

/* --------------------------- geometry --------------------------- */

/**
 * Slab test: ray (origin, dir) against AABB [min,max].
 * Returns entry distance, or -1 when there is no hit within maxT.
 */
function rayAABB(ro, rd, min, max, maxT) {
  let tmin = 0, tmax = maxT;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(rd[i]) < 1e-8) {
      if (ro[i] < min[i] || ro[i] > max[i]) return -1;
    } else {
      const inv = 1 / rd[i];
      let t1 = (min[i] - ro[i]) * inv;
      let t2 = (max[i] - ro[i]) * inv;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return -1;
    }
  }
  return tmin;
}

/** Face normal of an AABB at a hit point (for decals / impact sparks). */
function aabbNormalAt(p, min, max) {
  const eps = 1e-3;
  if (Math.abs(p[0] - min[0]) < eps) return [-1, 0, 0];
  if (Math.abs(p[0] - max[0]) < eps) return [1, 0, 0];
  if (Math.abs(p[1] - min[1]) < eps) return [0, -1, 0];
  if (Math.abs(p[1] - max[1]) < eps) return [0, 1, 0];
  if (Math.abs(p[2] - min[2]) < eps) return [0, 0, -1];
  return [0, 0, 1];
}
