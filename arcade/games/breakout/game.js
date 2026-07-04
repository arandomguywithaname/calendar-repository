(function () {
  var GAME_ID = "breakout";
  var canvas = document.getElementById("board");
  var ctx = canvas.getContext("2d");
  var scoreEl = document.getElementById("score");
  var livesEl = document.getElementById("lives");
  var bestEl = document.getElementById("best");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");

  var W = canvas.width, H = canvas.height;
  var PADDLE_W = 80, PADDLE_H = 12;
  var BALL_R = 7;
  var ROWS = 5, COLS = 8;
  var BRICK_W = 52, BRICK_H = 20, BRICK_GAP = 4, BRICK_TOP = 40;
  var BRICK_COLORS = ["#ff5da2", "#ff7c5c", "#ffb84d", "#3ddc84", "#29e0c9"];

  var paddle, ball, bricks, score, lives, over, won, loopId;

  function refreshHud() {
    scoreEl.textContent = score;
    livesEl.textContent = lives;
    bestEl.textContent = window.ArcadeCommon.getBest(GAME_ID) || 0;
  }

  function buildBricks() {
    bricks = [];
    var offsetX = (W - (COLS * BRICK_W + (COLS - 1) * BRICK_GAP)) / 2;
    for (var r = 0; r < ROWS; r++) {
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
    ball = { x: W / 2, y: H - 60, vx: 3.4 * (Math.random() < 0.5 ? 1 : -1), vy: -4.2 };
  }

  function newGame() {
    paddle = { x: W / 2 - PADDLE_W / 2 };
    score = 0;
    lives = 3;
    over = false;
    won = false;
    resultBanner.innerHTML = "";
    buildBricks();
    resetBall();
    refreshHud();
    cancelAnimationFrame(loopId);
    loop();
  }

  function update() {
    if (over) return;
    ball.x += ball.vx;
    ball.y += ball.vy;

    if (ball.x < BALL_R) { ball.x = BALL_R; ball.vx *= -1; }
    if (ball.x > W - BALL_R) { ball.x = W - BALL_R; ball.vx *= -1; }
    if (ball.y < BALL_R) { ball.y = BALL_R; ball.vy *= -1; }

    // Paddle collision
    if (ball.vy > 0 && ball.y + BALL_R > H - 20 - PADDLE_H && ball.y - BALL_R < H - 20 &&
        ball.x > paddle.x && ball.x < paddle.x + PADDLE_W) {
      ball.y = H - 20 - PADDLE_H - BALL_R;
      var rel = (ball.x - (paddle.x + PADDLE_W / 2)) / (PADDLE_W / 2);
      ball.vx = rel * 5.2;
      ball.vy = -Math.abs(ball.vy);
      var speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
      var minSpeed = 5.2;
      if (speed < minSpeed) {
        var scale = minSpeed / speed;
        ball.vx *= scale; ball.vy *= scale;
      }
    }

    // Brick collisions
    for (var i = 0; i < bricks.length; i++) {
      var b = bricks[i];
      if (!b.alive) continue;
      if (ball.x + BALL_R > b.x && ball.x - BALL_R < b.x + BRICK_W &&
          ball.y + BALL_R > b.y && ball.y - BALL_R < b.y + BRICK_H) {
        b.alive = false;
        score += 10;
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

  function draw() {
    ctx.fillStyle = "#171b2e";
    ctx.fillRect(0, 0, W, H);

    bricks.forEach(function (b) {
      if (!b.alive) return;
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y, BRICK_W, BRICK_H);
    });

    ctx.fillStyle = "#eef0fb";
    ctx.fillRect(paddle.x, H - 20 - PADDLE_H, PADDLE_W, PADDLE_H);

    ctx.beginPath();
    ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2);
    ctx.fillStyle = "#29e0c9";
    ctx.fill();
  }

  function loop() {
    update();
    draw();
    if (!over) loopId = requestAnimationFrame(loop);
  }

  function setPaddleX(x) {
    paddle.x = Math.max(0, Math.min(W - PADDLE_W, x - PADDLE_W / 2));
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
    if (keys.ArrowRight) paddle.x = Math.min(W - PADDLE_W, paddle.x + 7);
  }, 16);

  document.getElementById("touch-controls").addEventListener("click", function (e) {
    var btn = e.target.closest("[data-dir]");
    if (!btn || over) return;
    var d = btn.getAttribute("data-dir");
    paddle.x = Math.max(0, Math.min(W - PADDLE_W, paddle.x + (d === "left" ? -40 : 40)));
  });

  restartBtn.addEventListener("click", newGame);
  newGame();
})();
