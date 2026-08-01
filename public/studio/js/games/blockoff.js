/* ===========================================================
   blockoff.js — knock the blocks off the board.
   Move the paddle with the mouse or ← →, space launches the
   ball, P pauses, R restarts. Click the game to focus it.
   =========================================================== */

const COLORS = ["#f87171", "#fb923c", "#fbbf24", "#4ade80", "#38bdf8", "#a78bfa"];

export function start(canvas) {
  canvas.tabIndex = 0;
  const ctx = canvas.getContext("2d");

  let W = canvas.width, H = canvas.height;
  let paddle, ball, bricks, score, lives, stuck, paused, won, raf = 0, last = performance.now();
  let leftDown = false, rightDown = false;

  function layout() {
    W = canvas.width; H = canvas.height;
    const cols = 8, rows = 5;
    const pad = 8, top = 34;
    const bw = (W - pad * (cols + 1)) / cols;
    const bh = Math.max(12, H * 0.055);
    bricks = [];
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        bricks.push({
          x: pad + c * (bw + pad), y: top + r * (bh + pad),
          w: bw, h: bh, alive: true, color: COLORS[r % COLORS.length], points: (rows - r) * 10,
        });
    paddle = { w: Math.max(60, W * 0.19), h: 11, x: W / 2, speed: W * 0.9 };
    resetBall();
  }

  function resetBall() {
    ball = { x: paddle.x, y: H - 34, r: Math.max(5, W * 0.016), vx: 0, vy: 0, speed: Math.max(230, H * 0.62) };
    stuck = true;
  }

  function reset() {
    score = 0; lives = 3; paused = false; won = false;
    layout();
  }
  reset();

  function launch() {
    if (!stuck) return;
    const a = (-Math.PI / 2) + (Math.random() * 0.7 - 0.35);
    ball.vx = Math.cos(a) * ball.speed;
    ball.vy = Math.sin(a) * ball.speed;
    stuck = false;
  }

  function update(dt) {
    if (paused || won || lives <= 0) return;
    if (leftDown) paddle.x -= paddle.speed * dt;
    if (rightDown) paddle.x += paddle.speed * dt;
    paddle.x = clamp(paddle.x, paddle.w / 2, W - paddle.w / 2);

    if (stuck) { ball.x = paddle.x; ball.y = H - 34; return; }

    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    if (ball.x - ball.r < 0) { ball.x = ball.r; ball.vx *= -1; }
    if (ball.x + ball.r > W) { ball.x = W - ball.r; ball.vx *= -1; }
    if (ball.y - ball.r < 0) { ball.y = ball.r; ball.vy *= -1; }

    // paddle
    const py = H - 24;
    if (ball.vy > 0 && ball.y + ball.r >= py && ball.y - ball.r < py + paddle.h &&
        Math.abs(ball.x - paddle.x) < paddle.w / 2 + ball.r) {
      const hit = (ball.x - paddle.x) / (paddle.w / 2);           // -1 … 1
      const angle = -Math.PI / 2 + hit * 1.05;
      const sp = Math.hypot(ball.vx, ball.vy) * 1.02;
      ball.vx = Math.cos(angle) * sp;
      ball.vy = Math.sin(angle) * sp;
      ball.y = py - ball.r;
    }

    // bricks
    for (const b of bricks) {
      if (!b.alive) continue;
      if (ball.x + ball.r > b.x && ball.x - ball.r < b.x + b.w &&
          ball.y + ball.r > b.y && ball.y - ball.r < b.y + b.h) {
        b.alive = false;
        score += b.points;
        const overlapX = Math.min(ball.x + ball.r - b.x, b.x + b.w - (ball.x - ball.r));
        const overlapY = Math.min(ball.y + ball.r - b.y, b.y + b.h - (ball.y - ball.r));
        if (overlapX < overlapY) ball.vx *= -1; else ball.vy *= -1;
        break;
      }
    }

    if (bricks.every((b) => !b.alive)) won = true;
    if (ball.y - ball.r > H) {
      lives--;
      if (lives > 0) resetBall();
    }
  }

  function draw() {
    ctx.fillStyle = "#080b11";
    ctx.fillRect(0, 0, W, H);

    for (const b of bricks) {
      if (!b.alive) continue;
      ctx.fillStyle = b.color;
      roundRect(b.x, b.y, b.w, b.h, 4);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.2)";
      ctx.fillRect(b.x + 2, b.y + 2, b.w - 4, Math.max(2, b.h * 0.22));
    }

    ctx.fillStyle = "#e8eef7";
    roundRect(paddle.x - paddle.w / 2, H - 24, paddle.w, paddle.h, 6);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
    ctx.fillStyle = "#fbbf24";
    ctx.fill();

    ctx.fillStyle = "#93a2b8";
    ctx.font = "600 12px -apple-system, Segoe UI, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("Score " + score, 8, 18);
    ctx.textAlign = "right";
    ctx.fillText("♥".repeat(Math.max(0, lives)), W - 8, 18);

    if (stuck || paused || won || lives <= 0) {
      ctx.fillStyle = "rgba(5,8,14,.72)";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#e8eef7";
      ctx.textAlign = "center";
      ctx.font = "700 19px -apple-system, Segoe UI, sans-serif";
      const title = lives <= 0 ? "Game over" : won ? "You cleared it! 🎉" : paused ? "Paused" : "Blockoff";
      ctx.fillText(title, W / 2, H / 2 - 6);
      ctx.font = "500 12px -apple-system, Segoe UI, sans-serif";
      const sub = lives <= 0 || won ? "Press R to play again"
        : paused ? "Press P to continue" : "Space to launch · mouse or ← → to move";
      ctx.fillText(sub, W / 2, H / 2 + 16);
    }
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function loop(now) {
    const dt = Math.min((now - last) / 1000, 0.04);
    last = now;
    update(dt);
    draw();
    raf = requestAnimationFrame(loop);
  }
  raf = requestAnimationFrame(loop);

  const onMove = (e) => {
    const r = canvas.getBoundingClientRect();
    paddle.x = clamp(((e.clientX - r.left) / r.width) * W, paddle.w / 2, W - paddle.w / 2);
  };
  const onDown = () => { canvas.focus(); launch(); };
  const onKey = (e) => {
    const keys = ["ArrowLeft", "ArrowRight", " ", "p", "P", "r", "R"];
    if (!keys.includes(e.key)) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === "ArrowLeft") leftDown = true;
    if (e.key === "ArrowRight") rightDown = true;
    if (e.key === " ") { if (won || lives <= 0) reset(); else launch(); }
    if (e.key === "p" || e.key === "P") paused = !paused;
    if (e.key === "r" || e.key === "R") reset();
  };
  const onKeyUp = (e) => {
    if (e.key === "ArrowLeft") leftDown = false;
    if (e.key === "ArrowRight") rightDown = false;
  };

  canvas.addEventListener("mousemove", onMove);
  canvas.addEventListener("mousedown", onDown);
  canvas.addEventListener("keydown", onKey);
  canvas.addEventListener("keyup", onKeyUp);

  return {
    resize() { layout(); },
    destroy() {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("mousedown", onDown);
      canvas.removeEventListener("keydown", onKey);
      canvas.removeEventListener("keyup", onKeyUp);
    },
  };
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
