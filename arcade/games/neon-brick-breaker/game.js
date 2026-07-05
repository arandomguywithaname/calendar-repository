(function () {
  var GAME_ID = "neon-brick-breaker";
  var canvas = document.getElementById("board");
  var ctx = canvas.getContext("2d");
  var scoreEl = document.getElementById("score");
  var livesEl = document.getElementById("lives");
  var bestEl = document.getElementById("best");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");
  var diffEl = document.getElementById("difficulty");

  var W = canvas.width, H = canvas.height;
  var BALL_R = 7;
  var PADDLE_H = 12;
  var PADDLE_MIN_W = 38;
  var PADDLE_SHRINK = 12;

  var BRICK_W = 42, BRICK_H = 18, BRICK_GAP = 5, BRICK_TOP = 30;
  var NEON_COLORS = ["#ff5da2", "#29e0c9", "#7c5cff", "#ffb84d", "#3ddc84"];

  // Difficulty tuning. ballSpeed = constant ball speed (px/frame), paddleW =
  // starting paddle width, rows = brick pyramid layout (more/wider = more bricks).
  var DIFFICULTIES = {
    easy:   { ballSpeed: 4.4, paddleW: 112, rows: [3, 5, 7, 5, 3] },
    medium: { ballSpeed: 5.6, paddleW: 90,  rows: [3, 5, 7, 9, 7, 5, 3] },
    hard:   { ballSpeed: 7.0, paddleW: 64,  rows: [4, 6, 8, 10, 9, 10, 8, 6, 4] }
  };
  var cfg = DIFFICULTIES.medium;

  var paddle, paddleW, ball, bricks, score, lives, over, won, loopId, particles, trail;

  function refreshHud() {
    scoreEl.textContent = score;
    livesEl.textContent = lives;
    bestEl.textContent = window.ArcadeCommon.getBest(GAME_ID) || 0;
  }

  function buildBricks() {
    bricks = [];
    cfg.rows.forEach(function (count, r) {
      var rowWidth = count * (BRICK_W + BRICK_GAP) - BRICK_GAP;
      var startX = (W - rowWidth) / 2;
      for (var c = 0; c < count; c++) {
        bricks.push({
          x: startX + c * (BRICK_W + BRICK_GAP),
          y: BRICK_TOP + r * (BRICK_H + BRICK_GAP),
          alive: true,
          color: NEON_COLORS[r % NEON_COLORS.length]
        });
      }
    });
  }

  function resetBall() {
    var sp = cfg.ballSpeed;
    var dir = Math.random() < 0.5 ? 1 : -1;
    ball = { x: W / 2, y: H - 60, vx: sp * 0.6 * dir, vy: -sp * 0.8 };
  }

  function newGame() {
    paddleW = cfg.paddleW;
    paddle = { x: W / 2 - paddleW / 2 };
    score = 0;
    lives = 3;
    over = false;
    won = false;
    particles = [];
    trail = [];
    resultBanner.innerHTML = "";
    buildBricks();
    resetBall();
    refreshHud();
    cancelAnimationFrame(loopId);
    loop();
  }

  function burst(x, y, color, n) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2;
      var s = 1 + Math.random() * 3.5;
      particles.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, color: color });
    }
  }

  function update() {
    if (over) return;
    ball.x += ball.vx;
    ball.y += ball.vy;

    trail.push({ x: ball.x, y: ball.y });
    if (trail.length > 10) trail.shift();

    if (ball.x < BALL_R) { ball.x = BALL_R; ball.vx *= -1; }
    if (ball.x > W - BALL_R) { ball.x = W - BALL_R; ball.vx *= -1; }
    if (ball.y < BALL_R) { ball.y = BALL_R; ball.vy *= -1; }

    var sp = cfg.ballSpeed;
    if (ball.vy > 0 && ball.y + BALL_R > H - 20 - PADDLE_H && ball.y - BALL_R < H - 20 &&
        ball.x > paddle.x && ball.x < paddle.x + paddleW) {
      ball.y = H - 20 - PADDLE_H - BALL_R;
      var rel = Math.max(-0.75, Math.min(0.75, (ball.x - (paddle.x + paddleW / 2)) / (paddleW / 2)));
      ball.vx = rel * sp;
      ball.vy = -Math.sqrt(Math.max(0.01, sp * sp - ball.vx * ball.vx));
      burst(ball.x, H - 20 - PADDLE_H, "#29e0c9", 6);
    }

    for (var i = 0; i < bricks.length; i++) {
      var b = bricks[i];
      if (!b.alive) continue;
      if (ball.x + BALL_R > b.x && ball.x - BALL_R < b.x + BRICK_W &&
          ball.y + BALL_R > b.y && ball.y - BALL_R < b.y + BRICK_H) {
        b.alive = false;
        score += 10;
        burst(b.x + BRICK_W / 2, b.y + BRICK_H / 2, b.color, 12);
        refreshHud();
        var overlapLeft = (ball.x + BALL_R) - b.x;
        var overlapRight = (b.x + BRICK_W) - (ball.x - BALL_R);
        var overlapTop = (ball.y + BALL_R) - b.y;
        var overlapBottom = (b.y + BRICK_H) - (ball.y - BALL_R);
        var minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);
        if (minOverlap === overlapTop || minOverlap === overlapBottom) ball.vy *= -1;
        else ball.vx *= -1;
        break;
      }
    }

    if (bricks.every(function (b) { return !b.alive; })) {
      winGame();
      return;
    }

    if (ball.y - BALL_R > H) {
      lives--;
      paddleW = Math.max(PADDLE_MIN_W, paddleW - PADDLE_SHRINK);
      paddle.x = Math.max(0, Math.min(W - paddleW, paddle.x));
      refreshHud();
      if (lives <= 0) {
        loseGame();
        return;
      }
      resetBall();
    }
  }

  function winGame() {
    over = true;
    won = true;
    var isBest = window.ArcadeCommon.setBest(GAME_ID, score);
    var msg = window.ArcadeI18n.t("common.youWin");
    if (isBest && score > 0) msg += " 🏆";
    resultBanner.innerHTML = '<span class="overlay-win">' + msg + "</span>";
    refreshHud();
  }

  function loseGame() {
    over = true;
    window.ArcadeCommon.setBest(GAME_ID, score);
    resultBanner.innerHTML = '<span class="overlay-lose">' + window.ArcadeI18n.t("common.gameOver") + "</span>";
    refreshHud();
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

  function draw() {
    // Deep gradient background with a faint grid.
    var bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#0a0d1c");
    bg.addColorStop(1, "#04060e");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(124,92,255,0.06)";
    ctx.lineWidth = 1;
    for (var gx = 0; gx < W; gx += 30) {
      ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke();
    }

    // Bricks: rounded gradient tiles with a bright top highlight and glow.
    bricks.forEach(function (b) {
      if (!b.alive) return;
      var grad = ctx.createLinearGradient(b.x, b.y, b.x, b.y + BRICK_H);
      grad.addColorStop(0, "#ffffff");
      grad.addColorStop(0.25, b.color);
      grad.addColorStop(1, shade(b.color));
      ctx.shadowColor = b.color;
      ctx.shadowBlur = 14;
      ctx.fillStyle = grad;
      roundRect(b.x, b.y, BRICK_W, BRICK_H, 4);
      ctx.fill();
      ctx.shadowBlur = 0;
    });

    // Ball trail.
    trail.forEach(function (tp, i) {
      var alpha = (i / trail.length) * 0.5;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "#ff9dc7";
      ctx.beginPath();
      ctx.arc(tp.x, tp.y, Math.max(0.1, BALL_R * (i / trail.length)), 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    // Paddle: glowing gradient bar.
    var py = H - 20 - PADDLE_H;
    var pg = ctx.createLinearGradient(paddle.x, py, paddle.x, py + PADDLE_H);
    pg.addColorStop(0, "#ffffff");
    pg.addColorStop(0.5, "#7bf5e4");
    pg.addColorStop(1, "#1a9c8b");
    ctx.shadowColor = "#29e0c9";
    ctx.shadowBlur = 18;
    ctx.fillStyle = pg;
    roundRect(paddle.x, py, paddleW, PADDLE_H, 6);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Ball: glowing orb.
    var bgrad = ctx.createRadialGradient(ball.x - 2, ball.y - 2, 1, ball.x, ball.y, BALL_R + 3);
    bgrad.addColorStop(0, "#ffffff");
    bgrad.addColorStop(0.5, "#ff5da2");
    bgrad.addColorStop(1, "rgba(255,93,162,0.1)");
    ctx.shadowColor = "#ff5da2";
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2);
    ctx.fillStyle = bgrad;
    ctx.fill();
    ctx.shadowBlur = 0;

    // Particles.
    particles = particles.filter(function (p) { return p.life > 0; });
    particles.forEach(function (p) {
      p.x += p.vx; p.y += p.vy; p.vy += 0.05; p.life -= 0.035;
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.1, 3 * p.life), 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  function shade(hex) {
    var n = parseInt(hex.slice(1), 16);
    var r = Math.round(((n >> 16) & 255) * 0.5);
    var g = Math.round(((n >> 8) & 255) * 0.5);
    var b = Math.round((n & 255) * 0.5);
    return "rgb(" + r + "," + g + "," + b + ")";
  }

  function loop() {
    update();
    draw();
    if (!over) loopId = requestAnimationFrame(loop);
  }

  function setPaddleX(x) {
    paddle.x = Math.max(0, Math.min(W - paddleW, x - paddleW / 2));
  }

  canvas.addEventListener("mousemove", function (e) {
    var rect = canvas.getBoundingClientRect();
    setPaddleX((e.clientX - rect.left) * (W / rect.width));
  });

  canvas.addEventListener("touchmove", function (e) {
    e.preventDefault();
    var rect = canvas.getBoundingClientRect();
    setPaddleX((e.touches[0].clientX - rect.left) * (W / rect.width));
  }, { passive: false });

  var keys = {};
  document.addEventListener("keydown", function (e) {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") e.preventDefault();
    keys[e.key] = true;
  });
  document.addEventListener("keyup", function (e) { keys[e.key] = false; });

  setInterval(function () {
    if (over || !paddle) return;
    if (keys.ArrowLeft) paddle.x = Math.max(0, paddle.x - 7);
    if (keys.ArrowRight) paddle.x = Math.min(W - paddleW, paddle.x + 7);
  }, 16);

  document.getElementById("touch-controls").addEventListener("click", function (e) {
    var btn = e.target.closest("[data-dir]");
    if (!btn || over) return;
    var d = btn.getAttribute("data-dir");
    paddle.x = Math.max(0, Math.min(W - paddleW, paddle.x + (d === "left" ? -40 : 40)));
  });

  restartBtn.addEventListener("click", newGame);

  // Difficulty selector - changing it restarts with the new tuning.
  window.ArcadeCommon.mountDifficulty(diffEl, GAME_ID, {
    defaultKey: "medium",
    onChange: function (level) {
      cfg = DIFFICULTIES[level] || DIFFICULTIES.medium;
      newGame();
    }
  });
})();
