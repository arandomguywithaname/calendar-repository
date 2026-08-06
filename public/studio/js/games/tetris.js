/* ===========================================================
   tetris.js — a full little Tetris that can be dropped onto
   the whiteboard. Click the game to give it the keyboard.
   Keys: ← → move, ↑ rotate, ↓ soft drop, space hard drop, P pause.
   =========================================================== */

const COLS = 10, ROWS = 20;
const SHAPES = {
  I: { cells: [[0,1],[1,1],[2,1],[3,1]], w: 4, color: "#38bdf8" },
  O: { cells: [[1,0],[2,0],[1,1],[2,1]], w: 4, color: "#fbbf24" },
  T: { cells: [[1,0],[0,1],[1,1],[2,1]], w: 3, color: "#a78bfa" },
  S: { cells: [[1,0],[2,0],[0,1],[1,1]], w: 3, color: "#4ade80" },
  Z: { cells: [[0,0],[1,0],[1,1],[2,1]], w: 3, color: "#f87171" },
  J: { cells: [[0,0],[0,1],[1,1],[2,1]], w: 3, color: "#6ea8fe" },
  L: { cells: [[2,0],[0,1],[1,1],[2,1]], w: 3, color: "#fb923c" },
};
const KEYS = Object.keys(SHAPES);

export function start(canvas) {
  canvas.tabIndex = 0;
  const ctx = canvas.getContext("2d");

  // A canvas only gets key presses once it has been clicked. Without saying so,
  // the game looks broken — especially while presenting.
  let focused = document.activeElement === canvas;
  const onFocus = () => (focused = true);
  const onBlur = () => (focused = false);
  canvas.addEventListener("focus", onFocus);
  canvas.addEventListener("blur", onBlur);
  let grid = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  let piece = spawn();
  let score = 0, lines = 0, level = 1, over = false, paused = false;
  let dropMs = 700, acc = 0, last = performance.now(), raf = 0;

  function spawn() {
    const k = KEYS[(Math.random() * KEYS.length) | 0];
    const s = SHAPES[k];
    return { key: k, cells: s.cells.map(([x, y]) => [x, y]), color: s.color, size: s.w, x: 3, y: -1 };
  }

  const collide = (cells, ox, oy) =>
    cells.some(([x, y]) => {
      const gx = x + ox, gy = y + oy;
      return gx < 0 || gx >= COLS || gy >= ROWS || (gy >= 0 && grid[gy][gx]);
    });

  function rotate() {
    const n = piece.size - 1;
    const rotated = piece.cells.map(([x, y]) => [n - y, x]);
    for (const kick of [0, -1, 1, -2, 2]) {
      if (!collide(rotated, piece.x + kick, piece.y)) {
        piece.cells = rotated;
        piece.x += kick;
        return;
      }
    }
  }

  function move(dx) {
    if (!collide(piece.cells, piece.x + dx, piece.y)) piece.x += dx;
  }

  function step() {
    if (collide(piece.cells, piece.x, piece.y + 1)) lock();
    else piece.y++;
  }

  function hardDrop() {
    while (!collide(piece.cells, piece.x, piece.y + 1)) { piece.y++; score += 2; }
    lock();
  }

  function lock() {
    for (const [x, y] of piece.cells) {
      const gy = y + piece.y, gx = x + piece.x;
      if (gy < 0) { over = true; return; }
      grid[gy][gx] = piece.color;
    }
    let cleared = 0;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (grid[r].every(Boolean)) {
        grid.splice(r, 1);
        grid.unshift(Array(COLS).fill(null));
        cleared++;
        r++;
      }
    }
    if (cleared) {
      lines += cleared;
      score += [0, 100, 300, 500, 800][cleared] * level;
      level = 1 + Math.floor(lines / 10);
      dropMs = Math.max(110, 700 - (level - 1) * 60);
    }
    piece = spawn();
    if (collide(piece.cells, piece.x, piece.y)) over = true;
  }

  function draw() {
    const W = canvas.width, H = canvas.height;
    const pad = 6, hudH = 26;
    const cell = Math.min((W - pad * 2) / COLS, (H - pad * 2 - hudH) / ROWS);
    const ox = (W - cell * COLS) / 2, oy = hudH + (H - hudH - cell * ROWS) / 2;

    ctx.fillStyle = "#080b11";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#0e1421";
    ctx.fillRect(ox, oy, cell * COLS, cell * ROWS);

    ctx.strokeStyle = "rgba(255,255,255,.045)";
    ctx.lineWidth = 1;
    for (let r = 0; r <= ROWS; r++) line(ox, oy + r * cell, ox + COLS * cell, oy + r * cell);
    for (let c = 0; c <= COLS; c++) line(ox + c * cell, oy, ox + c * cell, oy + ROWS * cell);

    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++)
        if (grid[r][c]) block(ox + c * cell, oy + r * cell, cell, grid[r][c]);

    // ghost
    let gy = piece.y;
    while (!collide(piece.cells, piece.x, gy + 1)) gy++;
    for (const [x, y] of piece.cells) {
      if (y + gy < 0) continue;
      ctx.globalAlpha = 0.18;
      block(ox + (x + piece.x) * cell, oy + (y + gy) * cell, cell, piece.color);
      ctx.globalAlpha = 1;
    }
    for (const [x, y] of piece.cells)
      if (y + piece.y >= 0) block(ox + (x + piece.x) * cell, oy + (y + piece.y) * cell, cell, piece.color);

    ctx.fillStyle = "#93a2b8";
    ctx.font = "600 12px -apple-system, Segoe UI, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`Score ${score}`, 8, 17);
    ctx.textAlign = "right";
    ctx.fillText(`Lv ${level} · ${lines} lines`, W - 8, 17);

    if (!focused) {
      ctx.fillStyle = "rgba(5,8,14,.66)";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#e8eef7";
      ctx.textAlign = "center";
      ctx.font = "700 17px -apple-system, Segoe UI, sans-serif";
      ctx.fillText("▶  Click to play", W / 2, H / 2 - 4);
      ctx.font = "500 12px -apple-system, Segoe UI, sans-serif";
      ctx.fillStyle = "#93a2b8";
      ctx.fillText("then use the arrow keys", W / 2, H / 2 + 18);
    } else if (over || paused) {
      ctx.fillStyle = "rgba(5,8,14,.8)";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#e8eef7";
      ctx.textAlign = "center";
      ctx.font = "700 20px -apple-system, Segoe UI, sans-serif";
      ctx.fillText(over ? "Game over" : "Paused", W / 2, H / 2 - 6);
      ctx.font = "500 12px -apple-system, Segoe UI, sans-serif";
      ctx.fillText(over ? "Press R to play again" : "Press P to continue", W / 2, H / 2 + 16);
    }
  }

  const line = (x1, y1, x2, y2) => { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); };
  function block(x, y, s, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x + 1, y + 1, s - 2, s - 2);
    ctx.fillStyle = "rgba(255,255,255,.22)";
    ctx.fillRect(x + 1, y + 1, s - 2, Math.max(2, s * 0.18));
  }

  function loop(now) {
    const dt = now - last;
    last = now;
    if (!over && !paused) {
      acc += dt;
      while (acc >= dropMs) { acc -= dropMs; step(); }
    }
    draw();
    raf = requestAnimationFrame(loop);
  }
  raf = requestAnimationFrame(loop);

  function reset() {
    grid = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    piece = spawn();
    score = 0; lines = 0; level = 1; over = false; paused = false; dropMs = 700; acc = 0;
  }

  const onKey = (e) => {
    const handled = ["ArrowLeft","ArrowRight","ArrowDown","ArrowUp"," ","p","P","r","R"];
    if (!handled.includes(e.key)) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === "r" || e.key === "R") return reset();
    if (e.key === "p" || e.key === "P") return (paused = !paused);
    if (over || paused) return;
    if (e.key === "ArrowLeft") move(-1);
    else if (e.key === "ArrowRight") move(1);
    else if (e.key === "ArrowDown") { step(); score += 1; }
    else if (e.key === "ArrowUp") rotate();
    else if (e.key === " ") hardDrop();
  };
  canvas.addEventListener("keydown", onKey);
  canvas.addEventListener("mousedown", () => canvas.focus());

  return {
    /** Used by present mode to hand the keyboard straight to the game. */
    focus() {
      canvas.focus({ preventScroll: true });
    },
    destroy() {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("keydown", onKey);
      canvas.removeEventListener("focus", onFocus);
      canvas.removeEventListener("blur", onBlur);
    },
  };
}
