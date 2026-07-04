(function () {
  var GAME_ID = "air-hockey";
  var canvas = document.getElementById("board");
  var ctx = canvas.getContext("2d");
  var scoreEl = document.getElementById("score");
  var cpuScoreEl = document.getElementById("cpuScore");
  var bestEl = document.getElementById("best");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");

  var W = canvas.width, H = canvas.height;
  var PADDLE_R = 26;
  var PUCK_R = 13;
  var GOAL_W = 130;
  var WIN_SCORE = 5;
  var FRICTION = 0.995;

  var player, cpu, puck, score, cpuScore, over, loopId;
  var pointerTarget = null;

  function refreshHud() {
    scoreEl.textContent = score;
    cpuScoreEl.textContent = cpuScore;
    bestEl.textContent = window.ArcadeCommon.getBest(GAME_ID) || 0;
  }

  function resetPuck(dir) {
    puck = {
      x: W / 2, y: H / 2,
      vx: (Math.random() * 4 - 2),
      vy: 4 * (dir || (Math.random() < 0.5 ? 1 : -1))
    };
  }

  function newGame() {
    player = { x: W / 2, y: H - 70 };
    cpu = { x: W / 2, y: 70 };
    score = 0;
    cpuScore = 0;
    over = false;
    resultBanner.innerHTML = "";
    resetPuck();
    refreshHud();
    cancelAnimationFrame(loopId);
    loop();
  }

  function clampPlayer(x, y) {
    x = Math.max(PADDLE_R, Math.min(W - PADDLE_R, x));
    y = Math.max(H / 2 + PADDLE_R, Math.min(H - PADDLE_R, y));
    return { x: x, y: y };
  }

  function updatePlayer() {
    if (!pointerTarget) return;
    var c = clampPlayer(pointerTarget.x, pointerTarget.y);
    player.x = c.x;
    player.y = c.y;
  }

  function updateCpu() {
    var targetX = W / 2, targetY = 70;
    if (puck.y < H / 2) {
      targetX = puck.x;
      targetY = Math.max(PADDLE_R, Math.min(H / 2 - PADDLE_R, puck.y - 10));
    }
    var speed = 4.4;
    cpu.x += Math.max(-speed, Math.min(speed, targetX - cpu.x));
    cpu.y += Math.max(-speed, Math.min(speed, targetY - cpu.y));
    cpu.x = Math.max(PADDLE_R, Math.min(W - PADDLE_R, cpu.x));
    cpu.y = Math.max(PADDLE_R, Math.min(H / 2 - PADDLE_R, cpu.y));
  }

  function collidePaddle(paddle) {
    var dx = puck.x - paddle.x, dy = puck.y - paddle.y;
    var dist = Math.sqrt(dx * dx + dy * dy);
    var minDist = PADDLE_R + PUCK_R;
    if (dist < minDist && dist > 0) {
      var nx = dx / dist, ny = dy / dist;
      puck.x = paddle.x + nx * minDist;
      puck.y = paddle.y + ny * minDist;
      var speed = Math.sqrt(puck.vx * puck.vx + puck.vy * puck.vy);
      var impact = Math.max(speed, 6);
      puck.vx = nx * impact;
      puck.vy = ny * impact;
    }
  }

  function update() {
    if (over) return;
    updatePlayer();
    updateCpu();

    puck.x += puck.vx;
    puck.y += puck.vy;
    puck.vx *= FRICTION;
    puck.vy *= FRICTION;

    if (puck.x < PUCK_R) { puck.x = PUCK_R; puck.vx *= -1; }
    if (puck.x > W - PUCK_R) { puck.x = W - PUCK_R; puck.vx *= -1; }

    var goalLeft = W / 2 - GOAL_W / 2, goalRight = W / 2 + GOAL_W / 2;

    if (puck.y < PUCK_R) {
      if (puck.x > goalLeft && puck.x < goalRight) {
        score++;
        refreshHud();
        checkWin();
        if (!over) resetPuck(1);
      } else {
        puck.y = PUCK_R;
        puck.vy *= -1;
      }
    }
    if (puck.y > H - PUCK_R) {
      if (puck.x > goalLeft && puck.x < goalRight) {
        cpuScore++;
        refreshHud();
        checkWin();
        if (!over) resetPuck(-1);
      } else {
        puck.y = H - PUCK_R;
        puck.vy *= -1;
      }
    }

    collidePaddle(player);
    collidePaddle(cpu);
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
    ctx.fillStyle = "#101427";
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = "#323a5c";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, H / 2);
    ctx.lineTo(W, H / 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, 50, 0, Math.PI * 2);
    ctx.stroke();

    var goalLeft = W / 2 - GOAL_W / 2, goalRight = W / 2 + GOAL_W / 2;
    ctx.strokeStyle = "#ff5da2";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(goalLeft, 3);
    ctx.lineTo(goalRight, 3);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(goalLeft, H - 3);
    ctx.lineTo(goalRight, H - 3);
    ctx.stroke();

    ctx.fillStyle = "#29e0c9";
    ctx.beginPath();
    ctx.arc(player.x, player.y, PADDLE_R, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#ff5da2";
    ctx.beginPath();
    ctx.arc(cpu.x, cpu.y, PADDLE_R, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#eef0fb";
    ctx.beginPath();
    ctx.arc(puck.x, puck.y, PUCK_R, 0, Math.PI * 2);
    ctx.fill();
  }

  function loop() {
    update();
    draw();
    if (!over) loopId = requestAnimationFrame(loop);
  }

  function setPointerFromEvent(clientX, clientY) {
    var rect = canvas.getBoundingClientRect();
    pointerTarget = {
      x: (clientX - rect.left) * (W / rect.width),
      y: (clientY - rect.top) * (H / rect.height)
    };
  }

  canvas.addEventListener("mousemove", function (e) { setPointerFromEvent(e.clientX, e.clientY); });
  canvas.addEventListener("touchmove", function (e) {
    e.preventDefault();
    setPointerFromEvent(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: false });
  canvas.addEventListener("touchstart", function (e) {
    setPointerFromEvent(e.touches[0].clientX, e.touches[0].clientY);
  });

  restartBtn.addEventListener("click", newGame);
  newGame();
})();
