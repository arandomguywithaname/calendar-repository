(function () {
  var GAME_ID = "breakout";
  var canvas = document.getElementById("board");
  var ctx = canvas.getContext("2d");
  var scoreEl = document.getElementById("score");
  var livesEl = document.getElementById("lives");
  var bestEl = document.getElementById("best");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");
  var diffEl = document.getElementById("difficulty");

  var W = canvas.width, H = canvas.height;
  var PADDLE_H = 12;
  var BALL_R = 7;
  var COLS = 8;
  var BRICK_W = 52, BRICK_H = 20, BRICK_GAP = 4, BRICK_TOP = 44;
  var BRICK_COLORS = ["#ff5da2", "#ff7c5c", "#ffb84d", "#3ddc84", "#29e0c9", "#7c5cff", "#5ca8ff"];

  // Per-difficulty tuning: rows of bricks, paddle width, ball launch speed.
  var DIFFICULTIES = {
    easy: { rows: 3, paddleW: 108, speed: 3.4, minSpeed: 4.2 },
    medium: { rows: 5, paddleW: 80, speed: 4.6, minSpeed: 5.2 },
    hard: { rows: 7, paddleW: 56, speed: 6.0, minSpeed: 6.8 }
  };
  var cfg = DIFFICULTIES.medium;

  var paddle, paddleW, ball, trail, particles, bricks, score, lives, over, won, loopId;

  function refreshHud() {
    scoreEl.textContent = score;
    livesEl.textContent = lives;
    bestEl.textContent = window.ArcadeCommon.getBest(GAME_ID) || 0;
  }

  function buildBricks() {
    bricks = [];
    var offsetX = (W - (COLS * BRICK_W + (COLS - 1) * BRICK_GAP)) / 2;
    for (var r = 0; r < cfg.rows; r++) {
      for (var c = 0; c < COLS; c++) {
        bricks.push({
          x: offsetX + c * (BRICK_W + BRICK_GAP),
          y: BRICK_TOP + r * (BRICK_H + BRICK_GAP),
          alive: true,
          color: BRICK_COLORS[r % BRICK_COLORS.length]
        });
      }
    }
  }

  function resetBall() {
    ball = { x: W / 2, y: H - 60, vx: cfg.speed * 0.72 * (Math.random() < 0.5 ? 1 : -1), vy: -cfg.speed };
    trail = [];
  }

  function newGame() {
    paddleW = cfg.paddleW;
    paddle = { x: W / 2 - paddleW / 2 };
    score = 0;
    lives = 3;
    over = false;
    won = false;
    particles = [];
    resultBanner.innerHTML = "";
    buildBricks();
    resetBall();
    refreshHud();
    cancelAnimationFrame(loopId);
    loop();
  }

  function spawnParticles(x, y, color, count) {
    for (var i = 0; i < (count || 14); i++) {
      var ang = Math.random() * Math.PI * 2;
      var spd = 1 + Math.random() * 3;
      particles.push({
        x: x, y: y,
        vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
        life: 1, color: color
      });
    }
  }

  function update() {
    if (over) return;

    trail.push({ x: ball.x, y: ball.y });
    if (trail.length > 12) trail.shift();

    ball.x += ball.vx;
    ball.y += ball.vy;

    if (ball.x < BALL_R) { ball.x = BALL_R; ball.vx *= -1; }
    if (ball.x > W - BALL_R) { ball.x = W - BALL_R; ball.vx *= -1; }
    if (ball.y < BALL_R) { ball.y = BALL_R; ball.vy *= -1; }

    // Paddle collision
    if (ball.vy > 0 && ball.y + BALL_R > H - 20 - PADDLE_H && ball.y - BALL_R < H - 20 &&
        ball.x > paddle.x && ball.x < paddle.x + paddleW) {
      ball.y = H - 20 - PADDLE_H - BALL_R;
      var rel = (ball.x - (paddle.x + paddleW / 2)) / (paddleW / 2);
      ball.vx = rel * 5.4;
      ball.vy = -Math.abs(ball.vy);
      var speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
      if (speed < cfg.minSpeed) {
        var scale = cfg.minSpeed / speed;
        ball.vx *= scale; ball.vy *= scale;
      }
      spawnParticles(ball.x, H - 20 - PADDLE_H, "#29e0c9", 8);
    }

    // Brick collisions
    for (var i = 0; i < bricks.length; i++) {
      var b = bricks[i];
      if (!b.alive) continue;
      if (ball.x + BALL_R > b.x && ball.x - BALL_R < b.x + BRICK_W &&
          ball.y + BALL_R > b.y && ball.y - BALL_R < b.y + BRICK_H) {
        b.alive = false;
        score += 10;
        spawnParticles(b.x + BRICK_W / 2, b.y + BRICK_H / 2, b.color, 16);
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
    window.ArcadeCommon.setBest(GAME_ID, score);
    resultBanner.innerHTML = '<span class="overlay-win">' + window.ArcadeI18n.t("common.youWin") + "</span>";
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
    // Dark background with a soft glow bloom.
    ctx.fillStyle = "#0a0d1a";
    ctx.fillRect(0, 0, W, H);
    var bg = ctx.createRadialGradient(W / 2, BRICK_TOP, 20, W / 2, BRICK_TOP, H);
    bg.addColorStop(0, "rgba(124,92,255,0.10)");
    bg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Glowing gradient bricks.
    bricks.forEach(function (b) {
      if (!b.alive) return;
      ctx.save();
      ctx.shadowColor = b.color;
      ctx.shadowBlur = 14;
      var g = ctx.createLinearGradient(b.x, b.y, b.x, b.y + BRICK_H);
      g.addColorStop(0, "#ffffff");
      g.addColorStop(0.25, b.color);
      g.addColorStop(1, b.color);
      ctx.fillStyle = g;
      roundRect(b.x, b.y, BRICK_W, BRICK_H, 5);
      ctx.fill();
      ctx.restore();
    });

    // Glowing paddle.
    ctx.save();
    ctx.shadowColor = "#29e0c9";
    ctx.shadowBlur = 20;
    var pg = ctx.createLinearGradient(paddle.x, 0, paddle.x + paddleW, 0);
    pg.addColorStop(0, "#29e0c9");
    pg.addColorStop(0.5, "#bff6ff");
    pg.addColorStop(1, "#29e0c9");
    ctx.fillStyle = pg;
    roundRect(paddle.x, H - 20 - PADDLE_H, paddleW, PADDLE_H, 6);
    ctx.fill();
    ctx.restore();

    // Ball trail.
    trail.forEach(function (t, i) {
      var frac = i / trail.length;
      ctx.globalAlpha = frac * 0.5;
      ctx.fillStyle = "#ffd9ec";
      ctx.beginPath();
      ctx.arc(t.x, t.y, BALL_R * frac, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    // Glowing ball.
    ctx.save();
    var grad = ctx.createRadialGradient(ball.x, ball.y, 1, ball.x, ball.y, BALL_R + 10);
    grad.addColorStop(0, "#ffffff");
    grad.addColorStop(0.4, "#ff9dc7");
    grad.addColorStop(1, "rgba(255,93,162,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, BALL_R + 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowColor = "#ff5da2";
    ctx.shadowBlur = 16;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Particles.
    particles = particles.filter(function (p) { return p.life > 0; });
    particles.forEach(function (p) {
      p.x += p.vx; p.y += p.vy; p.vy += 0.05; p.life -= 0.045;
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3 * p.life + 0.5, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  function loop() {
    update();
    draw();
    if (!over) loopId = requestAnimationFrame(loop);
    else finish();
  }

  function finish() {
    if (!particles.length) return;
    draw();
    requestAnimationFrame(finish);
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
    if (over) return;
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

  window.ArcadeCommon.mountDifficulty(diffEl, GAME_ID, {
    defaultKey: "medium",
    onChange: function (level) {
      cfg = DIFFICULTIES[level] || DIFFICULTIES.medium;
      newGame();
    }
  });
})();
