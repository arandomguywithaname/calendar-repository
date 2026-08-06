/* ===========================================================
   trace.js — turns a drawing into a solid you can spin.

   One pipeline does everything: whatever you put on the pad —
   pen strokes, a box, a circle, words, an emoji — is painted
   onto a hidden canvas, and the shape of the ink is pulled out
   into 3D. That is why text, emoji and doodles all work the
   same way, and why anything you can draw becomes a model.

   How the shape is found:
     1. paint the drawing much larger than needed, then shrink
        it down. Shrinking averages the pixels, so each square
        of the grid ends up with "how covered am I", 0 to 1 —
        that is what makes the edges come out smooth instead of
        looking like stairs.
     2. walk the grid a square at a time and work out which part
        of each square is inked (marching squares), meeting the
        edge exactly where the coverage crosses a half.
     3. give the flat shape a front, a back, and walls joining
        them. The walls are built from the very same edge points
        as the front and back, so there are never any cracks.
   =========================================================== */

/** How many grid squares across. Higher = finer, and more triangles. */
const GRID = 190;
/** Painted this many times bigger first, then averaged down. */
const SUPER = 3;

export const PAD_W = 1000;
export const PAD_H = 620;

/* ---------------- painting the drawing ---------------- */

/**
 * Draws the items onto a 2D context. The pad shows the same picture the
 * shape is made from, so what you see really is what you get.
 */
export function paintDrawing(ctx, drawing, scale, ink = "#e8eef7") {
  const items = drawing?.items || [];
  ctx.save();
  ctx.scale(scale, scale);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (const it of items) {
    ctx.globalCompositeOperation = it.kind === "erase" ? "destination-out" : "source-over";
    ctx.strokeStyle = ink;
    ctx.fillStyle = ink;
    ctx.lineWidth = it.width || 18;

    if (it.kind === "stroke" || it.kind === "erase") {
      const p = it.points || [];
      if (!p.length) continue;
      if (p.length === 1) {
        ctx.beginPath();
        ctx.arc(p[0][0], p[0][1], (it.width || 18) / 2, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      ctx.beginPath();
      ctx.moveTo(p[0][0], p[0][1]);
      for (let i = 1; i < p.length; i++) ctx.lineTo(p[i][0], p[i][1]);
      ctx.stroke();
    } else if (it.kind === "line") {
      ctx.beginPath();
      ctx.moveTo(it.x1, it.y1);
      ctx.lineTo(it.x2, it.y2);
      ctx.stroke();
    } else if (it.kind === "rect") {
      if (it.fill) ctx.fillRect(it.x, it.y, it.w, it.h);
      else ctx.strokeRect(it.x, it.y, it.w, it.h);
    } else if (it.kind === "ellipse") {
      ctx.beginPath();
      ctx.ellipse(it.x + it.w / 2, it.y + it.h / 2, Math.abs(it.w / 2), Math.abs(it.h / 2), 0, 0, Math.PI * 2);
      it.fill ? ctx.fill() : ctx.stroke();
    } else if (it.kind === "text") {
      ctx.font = `800 ${it.size || 120}px -apple-system, "Segoe UI", Roboto, sans-serif`;
      ctx.fillText(it.text || "", it.x, it.y);
    } else if (it.kind === "emoji") {
      ctx.font = `${it.size || 190}px -apple-system, "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
      ctx.fillText(it.text || "", it.x, it.y);
    }
  }
  ctx.restore();
  ctx.globalCompositeOperation = "source-over";
}

/**
 * Paints the drawing big, shrinks it down, and reports how covered each
 * grid point is (0 = nothing there, 1 = solid ink).
 */
function coverage(drawing, gw, gh) {
  const bigW = gw * SUPER, bigH = gh * SUPER;
  const cv = document.createElement("canvas");
  cv.width = bigW;
  cv.height = bigH;
  const ctx = cv.getContext("2d", { willReadFrequently: true });
  paintDrawing(ctx, drawing, bigW / PAD_W, "#ffffff");

  const px = ctx.getImageData(0, 0, bigW, bigH).data;
  const field = new Float32Array(gw * gh);
  for (let j = 0; j < gh; j++)
    for (let i = 0; i < gw; i++) {
      let sum = 0;
      for (let dy = 0; dy < SUPER; dy++)
        for (let dx = 0; dx < SUPER; dx++) {
          const y = j * SUPER + dy, x = i * SUPER + dx;
          sum += px[(y * bigW + x) * 4 + 3];               // the alpha channel is the ink
        }
      field[j * gw + i] = sum / (SUPER * SUPER * 255);
    }
  return field;
}

/* ---------------- flat shape -> solid ---------------- */

const HALF = 0.5;                                          // ink covers half a square = the edge

/**
 * Builds the solid. Returns { positions, normals } ready for the viewer, or
 * null when the pad is empty.
 */
export function drawingToMesh(drawing, { depth = 0.4, grid = GRID } = {}) {
  const gw = grid;
  const gh = Math.max(8, Math.round((grid * PAD_H) / PAD_W));
  const field = coverage(drawing, gw, gh);
  if (!field.some((v) => v > HALF)) return null;

  const d = Math.max(0.04, depth) / 2;
  const spanX = 2, spanY = (2 * PAD_H) / PAD_W;
  // grid point -> where it sits in the model (canvas y points down, the world's points up)
  const X = (i) => (i / (gw - 1) - 0.5) * spanX;
  const Y = (j) => (0.5 - j / (gh - 1)) * spanY;

  const pos = [], nor = [];
  const tri = (a, b, c, n) => {
    for (const p of [a, b, c]) pos.push(p[0], p[1], p[2]);
    for (let k = 0; k < 3; k++) nor.push(n[0], n[1], n[2]);
  };

  for (let j = 0; j + 1 < gh; j++) {
    for (let i = 0; i + 1 < gw; i++) {
      const v = [
        field[j * gw + i],
        field[j * gw + i + 1],
        field[(j + 1) * gw + i + 1],
        field[(j + 1) * gw + i],
      ];
      const inside = v.map((x) => x > HALF);
      const n = inside.filter(Boolean).length;
      if (n === 0) continue;

      const corner = [
        [X(i), Y(j)],
        [X(i + 1), Y(j)],
        [X(i + 1), Y(j + 1)],
        [X(i), Y(j + 1)],
      ];
      // where the edge of the shape cuts each side of this square
      const cross = (k) => {
        const a = k, b = (k + 1) % 4;
        const t = (HALF - v[a]) / (v[b] - v[a] || 1);
        return [
          corner[a][0] + (corner[b][0] - corner[a][0]) * t,
          corner[a][1] + (corner[b][1] - corner[a][1]) * t,
        ];
      };

      // a square with two opposite corners inked could join up two ways;
      // keep the two bits apart, which is always safe and never crosses over
      const saddleA = inside[0] && inside[2] && !inside[1] && !inside[3];
      const saddleB = inside[1] && inside[3] && !inside[0] && !inside[2];
      let polys;
      if (saddleA) {
        polys = [
          [[corner[0], 0], [cross(0), 1], [cross(3), 1]],
          [[corner[2], 0], [cross(2), 1], [cross(1), 1]],
        ];
      } else if (saddleB) {
        polys = [
          [[corner[1], 0], [cross(1), 1], [cross(0), 1]],
          [[corner[3], 0], [cross(3), 1], [cross(2), 1]],
        ];
      } else {
        const walk = [];
        for (let k = 0; k < 4; k++) {
          if (inside[k]) walk.push([corner[k], 0]);
          if (inside[k] !== inside[(k + 1) % 4]) walk.push([cross(k), 1]);
        }
        polys = [walk];
      }

      for (let poly of polys) {
        if (poly.length < 3) continue;
        // keep every piece turning the same way, so the front always faces front
        let area = 0;
        for (let k = 0; k < poly.length; k++) {
          const a = poly[k][0], b = poly[(k + 1) % poly.length][0];
          area += a[0] * b[1] - b[0] * a[1];
        }
        if (area < 0) poly = poly.slice().reverse();

        const p0 = poly[0][0];
        for (let k = 1; k + 1 < poly.length; k++) {
          const a = poly[k][0], b = poly[k + 1][0];
          tri([p0[0], p0[1], d], [a[0], a[1], d], [b[0], b[1], d], [0, 0, 1]);          // front
          tri([p0[0], p0[1], -d], [b[0], b[1], -d], [a[0], a[1], -d], [0, 0, -1]);      // back
        }

        // the walls: every step of the outline that runs between two edge points
        for (let k = 0; k < poly.length; k++) {
          const [a, aEdge] = poly[k];
          const [b, bEdge] = poly[(k + 1) % poly.length];
          if (!aEdge || !bEdge) continue;
          const dx = b[0] - a[0], dy = b[1] - a[1];
          const len = Math.hypot(dx, dy);
          if (len < 1e-9) continue;
          const wn = [dy / len, -dx / len, 0];             // points away from the shape
          tri([a[0], a[1], d], [a[0], a[1], -d], [b[0], b[1], -d], wn);
          tri([a[0], a[1], d], [b[0], b[1], -d], [b[0], b[1], d], wn);
        }
      }
    }
  }

  if (!pos.length) return null;
  return center({ positions: new Float32Array(pos), normals: new Float32Array(nor) });
}

/** Puts the shape in the middle and gives it a comfortable size. */
function center(m) {
  const p = m.positions;
  let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.length; i += 3)
    for (let k = 0; k < 3; k++) {
      lo[k] = Math.min(lo[k], p[i + k]);
      hi[k] = Math.max(hi[k], p[i + k]);
    }
  const mid = [0, 1, 2].map((k) => (lo[k] + hi[k]) / 2);
  const size = Math.max(hi[0] - lo[0], hi[1] - lo[1]) || 1;
  const s = 1.8 / size;
  for (let i = 0; i < p.length; i += 3)
    for (let k = 0; k < 3; k++) p[i + k] = (p[i + k] - mid[k]) * s;
  return m;
}

/** Roughly how many triangles a drawing will turn into. */
export const triangleCount = (m) => (m ? m.positions.length / 9 : 0);
