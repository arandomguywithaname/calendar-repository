'use strict';
/* ------------------------------------------------------------------
   map.js — "de_dune": a compact bomb-defusal layout with three lanes
   (B tunnels / mid / long A) feeding two bombsites, plus collision,
   ray casting and a navigation grid for the bots.
   ------------------------------------------------------------------ */

const PLAYER_RADIUS = 0.34;
const PLAYER_HEIGHT = 1.80;
const CROUCH_HEIGHT = 1.24;
const STEP_HEIGHT = 0.46;
const EYE_OFFSET = 0.16;      // eye sits this far below the head

class Solid {
  constructor(min, max, mat, opts = {}) {
    this.min = min;
    this.max = max;
    this.mat = mat;
    this.uvScale = opts.uvScale !== undefined ? opts.uvScale : 0.4;
    this.tint = opts.tint || [1, 1, 1];
    this.noClip = !!opts.noClip;      // decoration only
    this.noDraw = !!opts.noDraw;      // clip brush only
    this.skip = opts.skip || null;
    this.penetrable = opts.penetrable !== undefined ? opts.penetrable : 0.35;
  }
}

class GameMap {
  constructor() {
    this.name = 'de_dune';
    this.solids = [];
    this.props = [];
    this.bounds = { x0: -42, z0: -42, x1: 42, z1: 42 };
    this._build();
    this._buildNav();
  }

  add(x0, z0, x1, z1, y0, y1, mat, opts) {
    const s = new Solid(
      [Math.min(x0, x1), y0, Math.min(z0, z1)],
      [Math.max(x0, x1), y1, Math.max(z0, z1)],
      mat, opts);
    this.solids.push(s);
    return s;
  }

  /** Wall segment with a doorway gap punched through the middle. */
  addWallWithGap(axis, at, from, to, gapCenter, gapWidth, y0, y1, mat, opts) {
    const half = gapWidth / 2;
    const t = opts && opts.thickness !== undefined ? opts.thickness : 0.5;
    const segments = [[from, gapCenter - half], [gapCenter + half, to]];
    for (const [a, b] of segments) {
      if (b - a <= 0.05) continue;
      if (axis === 'z') this.add(a, at - t / 2, b, at + t / 2, y0, y1, mat, opts);
      else this.add(at - t / 2, a, at + t / 2, b, y0, y1, mat, opts);
    }
    // lintel above the doorway
    if (opts && opts.lintel) {
      if (axis === 'z') this.add(gapCenter - half, at - t / 2, gapCenter + half, at + t / 2, opts.lintel, y1, mat, opts);
      else this.add(at - t / 2, gapCenter - half, at + t / 2, gapCenter + half, opts.lintel, y1, mat, opts);
    }
  }

  _build() {
    const W = MAT;
    const SAND = { uvScale: 0.35 };
    const B = this.bounds;

    /* ---- ground ---- */
    this.add(B.x0, B.z0, B.x1, B.z1, -1.0, 0, W.GROUND, { uvScale: 0.28 });

    /* ---- perimeter ---- */
    const PH = 11;
    this.add(B.x0 - 2, B.z0 - 2, B.x0, B.z1 + 2, 0, PH, W.SANDSTONE, SAND);
    this.add(B.x1, B.z0 - 2, B.x1 + 2, B.z1 + 2, 0, PH, W.SANDSTONE, SAND);
    this.add(B.x0 - 2, B.z0 - 2, B.x1 + 2, B.z0, 0, PH, W.SANDSTONE, SAND);
    this.add(B.x0 - 2, B.z1, B.x1 + 2, B.z1 + 2, 0, PH, W.SANDSTONE, SAND);

    /* ---- big side fillers: define the west and east lanes ---- */
    this.add(-40, -6, -22, 38, 0, 9.5, W.SANDSTONE, SAND);   // west block
    this.add(22, -6, 40, 38, 0, 9.5, W.SANDSTONE, SAND);     // east block

    /* ---- mid buildings ---- */
    this.add(-13, -6, -5, 20, 0, 7.2, W.PLASTER, { uvScale: 0.34 });
    this.add(5, -6, 13, 20, 0, 7.2, W.PLASTER, { uvScale: 0.34 });
    // rooftop trim so the buildings read as structures, not slabs
    this.add(-13.4, -6.4, -4.6, 20.4, 7.2, 7.7, W.SANDSTONE, { uvScale: 0.5 });
    this.add(4.6, -6.4, 13.4, 20.4, 7.2, 7.7, W.SANDSTONE, { uvScale: 0.5 });

    /* ---- mid doors ---- */
    this.addWallWithGap('z', 8, -5, 5, 0, 3.4, 0, 5.2, W.SANDSTONE,
      { thickness: 0.6, lintel: 2.6, uvScale: 0.4 });
    // Both leaves stand open against the wall, so the doorway itself stays clear.
    this.add(-3.15, 7.15, -1.75, 7.45, 0, 2.55, W.DOOR, { uvScale: 0.55, tint: [0.9, 0.9, 0.92] });
    this.add(1.75, 7.15, 3.15, 7.45, 0, 2.55, W.DOOR, { uvScale: 0.55, tint: [0.9, 0.9, 0.92] });

    /* ---- long A doors ---- */
    this.addWallWithGap('z', 9, 13, 22, 17.5, 3.6, 0, 6.0, W.SANDSTONE,
      { thickness: 0.6, lintel: 2.8, uvScale: 0.4 });

    /* ---- B tunnels: pinch + ceiling ---- */
    this.addWallWithGap('z', 9, -22, -13, -17.5, 3.6, 0, 6.0, W.SANDSTONE,
      { thickness: 0.6, lintel: 2.8, uvScale: 0.4 });
    this.add(-22, -6, -13, 9, 4.6, 5.4, W.CONCRETE, { uvScale: 0.32 });   // tunnel roof
    this.add(-22, -6, -13, 9, -0.02, 0.02, W.TILE, { uvScale: 0.3, noClip: true });

    /* ---- north half: central block splits A side from B side ---- */
    this.add(-8, -30, -2, -12, 0, 7.0, W.PLASTER, { uvScale: 0.34 });
    this.add(2, -30, 8, -12, 0, 7.0, W.PLASTER, { uvScale: 0.34 });
    this.add(-8.4, -30.4, -1.6, -11.6, 7.0, 7.5, W.SANDSTONE, { uvScale: 0.5 });
    this.add(1.6, -30.4, 8.4, -11.6, 7.0, 7.5, W.SANDSTONE, { uvScale: 0.5 });

    /* ---- CT spawn shoulders ---- */
    this.add(-40, -40, -30, -32, 0, 8, W.SANDSTONE, SAND);
    this.add(30, -40, 40, -32, 0, 8, W.SANDSTONE, SAND);

    /* ================= BOMBSITE A (east) ================= */
    // One tile of the painted marker covers the whole patch — no repetition.
    this.add(18, -26, 30, -14, -0.02, 0.03, W.SITE_A, { uvScale: 1 / 12, noClip: true });
    // Raised firing platform. Kept to a single step so every route onto it
    // stays connected in the nav grid — the crates provide the real height.
    this.add(24, -30, 34, -21, 0, 0.42, W.CONCRETE, { uvScale: 0.3 });
    this.add(23.6, -30, 24.4, -21, 0, 0.5, W.SANDSTONE, { uvScale: 0.5, noClip: true });
    this.crate(17.5, -16.5, 1.15, W.CRATE);
    this.crate(17.5, -16.5, 1.15, W.CRATE, 1.15);
    this.crate(20.2, -15.4, 1.15, W.CRATE);
    this.crate(28.5, -14.5, 1.15, W.CRATE);
    this.crate(30.9, -14.5, 1.15, W.CRATE);
    this.crate(29.7, -16.9, 1.15, W.CRATE);
    this.barrel(15.6, -25.0);
    this.barrel(16.4, -26.4);
    this.add(26, -13.2, 33, -12.4, 0, 1.05, W.SANDSTONE, { uvScale: 0.4 });  // low wall
    this.add(14.5, -22.5, 15.6, -18.0, 0, 1.6, W.SANDSTONE, { uvScale: 0.4 }); // A pillar

    /* ================= BOMBSITE B (west) ================= */
    this.add(-30, -26, -18, -14, -0.02, 0.03, W.SITE_B, { uvScale: 1 / 12, noClip: true });
    this.crate(-17.5, -16.5, 1.15, W.CRATE);
    this.crate(-20.1, -16.5, 1.15, W.CRATE);
    this.crate(-18.8, -18.9, 1.15, W.CRATE);
    this.crate(-18.8, -18.9, 1.15, W.CRATE, 1.15);
    this.crate(-29.0, -15.0, 1.15, W.CRATE);
    this.crate(-31.4, -15.0, 1.15, W.CRATE);
    this.add(-33, -27, -26, -25.6, 0, 1.9, W.BRICK, { uvScale: 0.4 });   // back wall
    this.add(-26, -22, -24.4, -12.6, 0, 1.9, W.BRICK, { uvScale: 0.4 }); // divider
    this.barrel(-15.8, -27.6);
    this.barrel(-14.7, -26.2);
    this.container(-30.5, -22.5, 6.2, 2.6, 2.6, 0);

    /* ---- scattered cover in the lanes ---- */
    this.crate(-17.5, 3.0, 1.15, W.CRATE);
    this.crate(18.0, 2.0, 1.15, W.CRATE);
    this.crate(19.6, 2.0, 1.15, W.CRATE);
    this.crate(0.0, 16.0, 1.15, W.CRATE);
    this.crate(-2.4, 17.2, 0.62, W.CRATE);
    this.crate(2.6, 17.2, 0.62, W.CRATE);
    this.crate(-19.0, 26.0, 1.15, W.CRATE);
    this.crate(19.0, 26.0, 1.15, W.CRATE);
    this.container(0, -8.6, 5.4, 2.4, 2.5, Math.PI / 2 * 0);
    this.crate(11.0, -9.2, 1.15, W.CRATE);
    this.crate(-11.0, -9.2, 1.15, W.CRATE);
    // Kept clear of the CT spawn fan so nobody spawns nose-first into a crate.
    this.crate(-15.5, -34.0, 1.15, W.CRATE);
    this.crate(15.5, -34.0, 1.15, W.CRATE);

    /* ---- T spawn dressing ---- */
    this.add(-20, 34, 20, 34.8, 0, 1.1, W.SANDSTONE, { uvScale: 0.4 });
    this.container(-8, 30, 5.6, 2.4, 2.5, 0);
    this.container(8, 30, 5.6, 2.4, 2.5, 0);

    /* ---- decorative rooftops / awnings ---- */
    this.add(13, 12, 22, 13.4, 4.4, 4.8, W.WOOD, { uvScale: 0.5, noClip: true });
    this.add(-22, 12, -13, 13.4, 4.4, 4.8, W.WOOD, { uvScale: 0.5, noClip: true });

    /* ---- objective metadata ---- */
    this.sites = {
      A: { center: [24, 0, -21], radius: 9.5, min: [14, -30], max: [34, -12] },
      B: { center: [-24, 0, -21], radius: 9.5, min: [-34, -30], max: [-14, -12] },
    };
    this.spawns = {
      T: [
        [-9, 32], [-5, 33], [-1, 32.5], [3, 33], [7, 32],
        [-11, 29], [-3, 29.5], [5, 29.5], [11, 29], [0, 27],
      ].map(([x, z]) => [x, 0, z]),
      CT: [
        [-9, -35], [-5, -36], [-1, -35.5], [3, -36], [7, -35],
        [-12, -33], [-4, -33.5], [4, -33.5], [12, -33], [0, -37],
      ].map(([x, z]) => [x, 0, z]),
    };
    // yaw 0 looks down -Z: Ts (at +Z) face the map, CTs (at -Z) face back up it.
    this.spawnYaw = { T: 0, CT: Math.PI };

    /* Hand-placed tactical positions. Bots pick from these, which reads far
       better than letting them wander to arbitrary nav nodes. */
    this.holdSpots = {
      A: [
        { pos: [30, 0, -25.5], yaw: 2.5 }, { pos: [26.5, 0, -27], yaw: 2.4 },
        { pos: [16.5, 0, -14.0], yaw: 1.2 }, { pos: [21.5, 0, -13.5], yaw: 1.6 },
        { pos: [10.5, 0, -20.0], yaw: 1.57 },
      ],
      B: [
        { pos: [-30, 0, -26.5], yaw: -2.4 }, { pos: [-16.5, 0, -14.0], yaw: -1.2 },
        { pos: [-21, 0, -27], yaw: -1.9 }, { pos: [-10.5, 0, -20.0], yaw: -1.57 },
        { pos: [-27, 0, -14.5], yaw: -1.4 },
      ],
      MID: [
        { pos: [0, 0, -9.5], yaw: 0 }, { pos: [-2.5, 0, -14], yaw: 0 },
      ],
    };
    this.pushSpots = {
      A: [[17.5, 0, 4], [18.5, 0, -4], [22.5, 0, -10], [16, 0, -13], [26, 0, -14],
          [30, 0, -18], [20, 0, -20], [24, 0, -24]],
      B: [[-17.5, 0, 4], [-18.5, 0, -4], [-19, 0, -10], [-16, 0, -13], [-26, 0, -14],
          [-30, 0, -18], [-20, 0, -20], [-24, 0, -24]],
      MID: [[0, 0, 14], [0, 0, 4], [0, 0, -2], [0, 0, -9], [0, 0, -16], [0, 0, -26]],
    };
    this.rotations = {
      A: [[10.5, 0, -14], [10.5, 0, -26], [14, 0, -31]],
      B: [[-10.5, 0, -14], [-10.5, 0, -26], [-14, 0, -31]],
    };
  }

  crate(x, z, size, mat, yBase = 0) {
    const h = size;
    this.add(x - size / 2, z - size / 2, x + size / 2, z + size / 2, yBase, yBase + h, mat,
      { uvScale: 1 / size, tint: [rand(0.92, 1.06), rand(0.92, 1.04), rand(0.9, 1.02)] });
  }

  barrel(x, z) {
    // octagonal-ish barrel from two rotated-ish boxes reads fine at distance
    this.add(x - 0.28, z - 0.28, x + 0.28, z + 0.28, 0, 0.92, MAT.METAL, { uvScale: 1.4, tint: [0.8, 0.45, 0.3] });
    this.add(x - 0.31, z - 0.2, x + 0.31, z + 0.2, 0.06, 0.86, MAT.METAL, { uvScale: 1.4, tint: [0.75, 0.42, 0.28], noClip: true });
  }

  container(x, z, len, wid, h, rot) {
    const a = rot ? wid : len, b = rot ? len : wid;
    this.add(x - a / 2, z - b / 2, x + a / 2, z + b / 2, 0, h, MAT.METAL,
      { uvScale: 0.5, tint: pick([[0.55, 0.72, 0.62], [0.75, 0.55, 0.42], [0.5, 0.6, 0.75]]) });
    this.add(x - a / 2 - 0.06, z - b / 2 - 0.06, x + a / 2 + 0.06, z + b / 2 + 0.06, h, h + 0.12, MAT.METAL,
      { uvScale: 0.5, tint: [0.42, 0.44, 0.46], noClip: true });
  }

  /* --------------------------- geometry queries --------------------------- */

  buildMesh(builder) {
    for (const s of this.solids) {
      if (s.noDraw) continue;
      builder.box(s.min, s.max, s.mat, { tint: s.tint, uvScale: s.uvScale, skip: s.skip });
    }
    return builder;
  }

  /** Highest solid surface under (x,z) at or below `maxY`. */
  floorAt(x, z, maxY = 1e9) {
    let best = -1e9;
    for (const s of this.solids) {
      if (s.noClip) continue;
      if (x < s.min[0] || x > s.max[0] || z < s.min[2] || z > s.max[2]) continue;
      if (s.max[1] <= maxY + 0.001 && s.max[1] > best) best = s.max[1];
    }
    return best === -1e9 ? 0 : best;
  }

  /** True when an axis-aligned player box at `pos` overlaps world geometry. */
  overlaps(pos, radius, height) {
    const minX = pos[0] - radius, maxX = pos[0] + radius;
    const minZ = pos[2] - radius, maxZ = pos[2] + radius;
    const minY = pos[1] + 0.02, maxY = pos[1] + height;
    for (const s of this.solids) {
      if (s.noClip) continue;
      if (maxX <= s.min[0] || minX >= s.max[0]) continue;
      if (maxZ <= s.min[2] || minZ >= s.max[2]) continue;
      if (maxY <= s.min[1] || minY >= s.max[1]) continue;
      return true;
    }
    return false;
  }

  /**
   * Move a player box, sliding along walls and stepping up small ledges.
   * Mutates `pos`. Returns { hitWall, onGround }.
   */
  moveBox(pos, delta, radius, height) {
    let hitWall = false;
    const tryAxis = (axis, amount) => {
      if (amount === 0) return;
      const old = pos[axis];
      pos[axis] += amount;
      if (!this.overlaps(pos, radius, height)) return;
      // Try stepping up onto a ledge before giving up on the move.
      const oldY = pos[1];
      for (let step = 0.12; step <= STEP_HEIGHT; step += 0.12) {
        pos[1] = oldY + step;
        if (!this.overlaps(pos, radius, height)) return;
      }
      pos[1] = oldY;
      pos[axis] = old;
      hitWall = true;
    };
    tryAxis(0, delta[0]);
    tryAxis(2, delta[2]);

    // vertical
    pos[1] += delta[1];
    let onGround = false;
    if (this.overlaps(pos, radius, height)) {
      if (delta[1] <= 0) {
        // settle on top of whatever we landed on
        const floor = this.floorAt2(pos, radius, pos[1] + height * 0.5);
        pos[1] = floor;
        onGround = true;
      } else {
        pos[1] -= delta[1];   // bonked a ceiling
      }
    }
    return { hitWall, onGround };
  }

  /** Highest supporting surface for a box of `radius` around pos, below `maxY`. */
  floorAt2(pos, radius, maxY) {
    let best = -1e9;
    const minX = pos[0] - radius, maxX = pos[0] + radius;
    const minZ = pos[2] - radius, maxZ = pos[2] + radius;
    for (const s of this.solids) {
      if (s.noClip) continue;
      if (maxX <= s.min[0] || minX >= s.max[0]) continue;
      if (maxZ <= s.min[2] || minZ >= s.max[2]) continue;
      if (s.max[1] <= maxY && s.max[1] > best) best = s.max[1];
    }
    return best === -1e9 ? 0 : best;
  }

  /** Nearest solid hit along a ray. Returns null or {t, point, normal, solid}. */
  raycast(origin, dir, maxDist) {
    let bestT = maxDist, best = null;
    for (const s of this.solids) {
      if (s.noClip) continue;
      const t = rayAABB(origin, dir, s.min, s.max, bestT);
      if (t >= 0 && t < bestT) { bestT = t; best = s; }
    }
    if (!best) return null;
    const point = V.mad(origin, dir, bestT);
    return { t: bestT, point, normal: aabbNormalAt(point, best.min, best.max), solid: best };
  }

  /** Cheap boolean visibility test between two points. */
  visible(a, b) {
    const d = V.sub(b, a);
    const dist = V.len(d);
    if (dist < 0.001) return true;
    V.mul(d, 1 / dist, d);
    const hit = this.raycast(a, d, dist - 0.05);
    return !hit;
  }

  /* ------------------------------ navigation ------------------------------ */

  _buildNav() {
    const step = 1.5;
    const b = this.bounds;
    const cols = Math.floor((b.x1 - b.x0) / step);
    const rows = Math.floor((b.z1 - b.z0) / step);
    const nodes = [];
    const index = new Int32Array(cols * rows).fill(-1);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = b.x0 + (c + 0.5) * step;
        const z = b.z0 + (r + 0.5) * step;
        const y = this.floorAt(x, z, 2.0);
        if (y > 1.6) continue;
        if (this.overlaps([x, y, z], PLAYER_RADIUS + 0.08, PLAYER_HEIGHT)) continue;
        index[r * cols + c] = nodes.length;
        nodes.push({ x, y, z, c, r, links: [] });
      }
    }
    // 8-way links, but only where a player-sized box can actually pass.
    const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    for (const n of nodes) {
      for (const [dc, dr] of DIRS) {
        const nc = n.c + dc, nr = n.r + dr;
        if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
        const ni = index[nr * cols + nc];
        if (ni < 0) continue;
        const m = nodes[ni];
        if (Math.abs(m.y - n.y) > STEP_HEIGHT) continue;
        const mid = [(n.x + m.x) / 2, Math.max(n.y, m.y), (n.z + m.z) / 2];
        if (this.overlaps(mid, PLAYER_RADIUS + 0.06, PLAYER_HEIGHT)) continue;
        n.links.push({ i: ni, cost: Math.hypot(m.x - n.x, m.z - n.z) });
      }
    }
    this.nav = { nodes, index, cols, rows, step, x0: b.x0, z0: b.z0 };
  }

  nearestNode(pos) {
    const nav = this.nav;
    let c = Math.floor((pos[0] - nav.x0) / nav.step);
    let r = Math.floor((pos[2] - nav.z0) / nav.step);
    c = clamp(c, 0, nav.cols - 1); r = clamp(r, 0, nav.rows - 1);
    // spiral outward until we find a valid node
    for (let ring = 0; ring < 12; ring++) {
      let best = -1, bestD = 1e9;
      for (let dr = -ring; dr <= ring; dr++) {
        for (let dc = -ring; dc <= ring; dc++) {
          if (ring > 0 && Math.abs(dr) !== ring && Math.abs(dc) !== ring) continue;
          const rr = r + dr, cc = c + dc;
          if (rr < 0 || cc < 0 || rr >= nav.rows || cc >= nav.cols) continue;
          const i = nav.index[rr * nav.cols + cc];
          if (i < 0) continue;
          const n = nav.nodes[i];
          const d = (n.x - pos[0]) ** 2 + (n.z - pos[2]) ** 2 + (n.y - pos[1]) ** 2 * 4;
          if (d < bestD) { bestD = d; best = i; }
        }
      }
      if (best >= 0) return best;
    }
    return -1;
  }

  /** A* over the nav grid. Returns an array of world positions, or null. */
  findPath(from, to) {
    const start = this.nearestNode(from);
    const goal = this.nearestNode(to);
    if (start < 0 || goal < 0) return null;
    if (start === goal) return [[to[0], to[1], to[2]]];
    const nodes = this.nav.nodes;
    const n = nodes.length;
    if (!this._navScratch || this._navScratch.g.length !== n) {
      this._navScratch = {
        g: new Float32Array(n), f: new Float32Array(n),
        came: new Int32Array(n), state: new Uint8Array(n), stamp: new Int32Array(n),
        epoch: 0,
      };
    }
    const S = this._navScratch;
    S.epoch++;
    const gx = nodes[goal].x, gz = nodes[goal].z;
    const h = (i) => Math.hypot(nodes[i].x - gx, nodes[i].z - gz);
    const open = [start];
    S.g[start] = 0; S.f[start] = h(start); S.came[start] = -1;
    S.stamp[start] = S.epoch; S.state[start] = 1;
    let guard = 0;
    while (open.length && guard++ < 20000) {
      // linear scan for the cheapest open node — the grid is small enough
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (S.f[open[i]] < S.f[open[bi]]) bi = i;
      const cur = open.splice(bi, 1)[0];
      if (cur === goal) {
        const path = [];
        let p = cur;
        while (p !== -1) { path.push([nodes[p].x, nodes[p].y, nodes[p].z]); p = S.came[p]; }
        path.reverse();
        path.push([to[0], nodes[goal].y, to[2]]);
        return this._smooth(path);
      }
      S.state[cur] = 2;
      for (const link of nodes[cur].links) {
        const ni = link.i;
        if (S.stamp[ni] !== S.epoch) { S.stamp[ni] = S.epoch; S.state[ni] = 0; S.g[ni] = Infinity; }
        if (S.state[ni] === 2) continue;
        const tentative = S.g[cur] + link.cost;
        if (tentative < S.g[ni]) {
          S.g[ni] = tentative;
          S.f[ni] = tentative + h(ni);
          S.came[ni] = cur;
          if (S.state[ni] !== 1) { S.state[ni] = 1; open.push(ni); }
        }
      }
    }
    return null;
  }

  /** Drop waypoints that a straight walk can skip, so bots stop zig-zagging. */
  _smooth(path) {
    if (path.length < 3) return path;
    const out = [path[0]];
    let i = 0;
    while (i < path.length - 1) {
      let j = path.length - 1;
      for (; j > i + 1; j--) {
        if (this._walkable(path[i], path[j])) break;
      }
      out.push(path[j]);
      i = j;
    }
    return out;
  }

  _walkable(a, b) {
    const dx = b[0] - a[0], dz = b[2] - a[2];
    const dist = Math.hypot(dx, dz);
    if (dist > 24) return false;
    const steps = Math.ceil(dist / 0.5);
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      const x = a[0] + dx * t, z = a[2] + dz * t;
      const y = this.floorAt(x, z, Math.max(a[1], b[1]) + STEP_HEIGHT);
      if (Math.abs(y - lerp(a[1], b[1], t)) > STEP_HEIGHT + 0.1) return false;
      if (this.overlaps([x, y, z], PLAYER_RADIUS + 0.05, PLAYER_HEIGHT)) return false;
    }
    return true;
  }

  inSite(pos, site) {
    const s = this.sites[site];
    return pos[0] >= s.min[0] && pos[0] <= s.max[0] && pos[2] >= s.min[1] && pos[2] <= s.max[1];
  }

  whichSite(pos) {
    if (this.inSite(pos, 'A')) return 'A';
    if (this.inSite(pos, 'B')) return 'B';
    return null;
  }
}
