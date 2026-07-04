(function () {
  var GAME_ID = "pong";
  var canvas = document.getElementById("board");
  var ctx = canvas.getContext("2d");
  var scoreEl = document.getElementById("score");
  var cpuScoreEl = document.getElementById("cpuScore");
  var bestEl = document.getElementById("best");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");

  var W = canvas.width, H = canvas.height;
  var PADDLE_W = 10, PADDLE_H = 70;
  var WIN_SCORE = 7;

  var player, cpu, ball, score, cpuScore, over, loopId;

  function refreshHud() {
    scoreEl.textContent = score;
    cpuScoreEl.textContent = cpuScore;
    bestEl.textContent = window.ArcadeCommon.getBest(GAME_ID) || 0;
  }

  function resetBall(dir) {
    ball = {
      x: W / 2, y: H / 2,
      vx: 4.2 * (dir || (Math.random() < 0.5 ? 1 : -1)),
      vy: (Math.random() * 4 - 2)
    };
  }

  function newGame() {
    player = { y: H / 2 - PADDLE_H / 2 };
    cpu = { y: H / 2 - PADDLE_H / 2, err: 0 };
    score = 0;
    cpuScore = 0;
    over = false;
    resultBanner.innerHTML = "";
    resetBall();
    refreshHud();
    cancelAnimationFrame(loopId);
    loop();
  }

  function update() {
    if (over) return;

    ball.x += ball.vx;
    ball.y += ball.vy;

    if (ball.y < 6) { ball.y = 6; ball.vy *= -1; }
    if (ball.y > H - 6) { ball.y = H - 6; ball.vy *= -1; }

    // Player paddle collision (left side)
    if (ball.x - 6 < PADDLE_W + 4 && ball.x - 6 > 4 &&
        ball.y > player.y && ball.y < player.y + PADDLE_H && ball.vx < 0) {
      ball.x = PADDLE_W + 10;
      ball.vx *= -1.06;
      var rel = (ball.y - (player.y + PADDLE_H / 2)) / (PADDLE_H / 2);
      ball.vy = rel * 5;
    }

    // CPU paddle collision (right side)
    if (ball.x + 6 > W - PADDLE_W - 4 && ball.x + 6 < W - 4 &&
        ball.y > cpu.y && ball.y < cpu.y + PADDLE_H && ball.vx > 0) {
      ball.x = W - PADDLE_W - 10;
      ball.vx *= -1.06;
      var rel2 = (ball.y - (cpu.y + PADDLE_H / 2)) / (PADDLE_H / 2);
      ball.vy = rel2 * 5;
    }

    // Cap speed
    var maxSpeed = 11;
    ball.vx = Math.max(-maxSpeed, Math.min(maxSpeed, ball.vx));
    ball.vy = Math.max(-maxSpeed, Math.min(maxSpeed, ball.vy));

    // Score
    if (ball.x < -10) {
      cpuScore++;
      refreshHud();
      checkWin();
      if (!over) resetBall(1);
    } else if (ball.x > W + 10) {
      score++;
      refreshHud();
      checkWin();
      if (!over) resetBall(-1);
    }

    // CPU AI: track ball with lag/imperfection
    cpu.err += (Math.random() - 0.5) * 1.2;
    cpu.err = Math.max(-40, Math.min(40, cpu.err));
    var target = ball.y - PADDLE_H / 2 + cpu.err;
    var cpuSpeed = 4.4;
    if (cpu.y < target) cpu.y = Math.min(cpu.y + cpuSpeed, target);
    else cpu.y = Math.max(cpu.y - cpuSpeed, target);
    cpu.y = Math.max(0, Math.min(H - PADDLE_H, cpu.y));
  }

  function checkWin() {
    if (score >= WIN_SCORE) {
      over = true;
      window.ArcadeCommon.setBest(GAME_ID, score);
      resultBanner.innerHTML = '<span class="overlay-win">' + window.ArcadeI18n.t("common.youWin") + "</span>";
    } else if (cpuScore >= WIN_SCORE) {
      over = true;
      resultBanner.innerHTML = '<span class="overlay-lose">' + window.ArcadeI18n.t("common.youLose") + "</span>";
    }
  }

  function draw() {
    ctx.fillStyle = "#171b2e";
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = "#323a5c";
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.moveTo(W / 2, 0);
    ctx.lineTo(W / 2, H);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = "#29e0c9";
    ctx.fillRect(4, player.y, PADDLE_W, PADDLE_H);
    ctx.fillStyle = "#ff5da2";
    ctx.fillRect(W - PADDLE_W - 4, cpu.y, PADDLE_W, PADDLE_H);

    ctx.fillStyle = "#eef0fb";
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, 6, 0, Math.PI * 2);
    ctx.fill();
  }

  function loop() {
    update();
    draw();
    if (!over) loopId = requestAnimationFrame(loop);
  }

  function setPlayerY(y) {
    player.y = Math.max(0, Math.min(H - PADDLE_H, y - PADDLE_H / 2));
  }

  canvas.addEventListener("mousemove", function (e) {
    var rect = canvas.getBoundingClientRect();
    var y = (e.clientY - rect.top) * (H / rect.height);
    setPlayerY(y);
  });

  canvas.addEventListener("touchmove", function (e) {
    e.preventDefault();
    var rect = canvas.getBoundingClientRect();
    var y = (e.touches[0].clientY - rect.top) * (H / rect.height);
    setPlayerY(y);
  }, { passive: false });

  var keys = {};
  document.addEventListener("keydown", function (e) {
    if (e.key === "ArrowUp" || e.key === "ArrowDown") e.preventDefault();
    keys[e.key] = true;
  });
  document.addEventListener("keyup", function (e) { keys[e.key] = false; });

  setInterval(function () {
    if (over) return;
    if (keys.ArrowUp) player.y = Math.max(0, player.y - 6);
    if (keys.ArrowDown) player.y = Math.min(H - PADDLE_H, player.y + 6);
  }, 16);

  document.getElementById("touch-controls").addEventListener("click", function (e) {
    var btn = e.target.closest("[data-dir]");
    if (!btn || over) return;
    var d = btn.getAttribute("data-dir");
    player.y = Math.max(0, Math.min(H - PADDLE_H, player.y + (d === "up" ? -30 : 30)));
  });

  restartBtn.addEventListener("click", newGame);
  newGame();
})();
