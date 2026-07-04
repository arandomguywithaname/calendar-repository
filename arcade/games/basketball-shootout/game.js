(function () {
  var GAME_ID = "basketball-shootout";
  var canvas = document.getElementById("board");
  var ctx = canvas.getContext("2d");
  var scoreEl = document.getElementById("score");
  var bestEl = document.getElementById("best");
  var shotNumEl = document.getElementById("shot-num");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");

  var W = canvas.width, H = canvas.height;
  var BALL_R = 16;
  var GRAVITY = 0.42;
  var MAX_DRAG = 130;
  var POWER_SCALE = 0.17;
  var TOTAL_SHOTS = 10;

  var HOOP_X = W / 2;
  var RIM_Y = 108;
  var RIM_HALF = 32;
  var FLOOR_Y = H - 30;
  var START = { x: W / 2, y: FLOOR_Y - BALL_R };

  var ball, state, shotsTaken, makes, resolved, over;
  var dragging = false, dragCurrent = null;

  function refreshHud() {
    scoreEl.textContent = makes;
    bestEl.textContent = window.ArcadeCommon.getBest(GAME_ID) || 0;
    shotNumEl.textContent = shotsTaken;
  }

  function resetBall() {
    ball = { x: START.x, y: START.y, vx: 0, vy: 0 };
    state = "ready";
    resolved = false;
  }

  function newGame() {
    shotsTaken = 0;
    makes = 0;
    over = false;
    resultBanner.innerHTML = "";
    resetBall();
    refreshHud();
  }

  function toCanvasPos(e) {
    var rect = canvas.getBoundingClientRect();
    var cx = e.touches ? e.touches[0].clientX : e.clientX;
    var cy = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: (cx - rect.left) * (W / rect.width), y: (cy - rect.top) * (H / rect.height) };
  }

  function update() {
    if (state !== "flight") return;
    ball.vy += GRAVITY;
    ball.x += ball.vx;
    ball.y += ball.vy;

    if (ball.x < BALL_R) { ball.x = BALL_R; ball.vx *= -0.6; }
    if (ball.x > W - BALL_R) { ball.x = W - BALL_R; ball.vx *= -0.6; }

    if (!resolved && ball.vy > 0 && ball.y >= RIM_Y - 4 && ball.y <= RIM_Y + 10) {
      if (Math.abs(ball.x - HOOP_X) <= RIM_HALF - BALL_R * 0.6) {
        resolved = true;
        makes++;
        window.ArcadeCommon.toast("Swish! +1");
        refreshHud();
      }
    }

    if (ball.y > FLOOR_Y + 40 || ball.y < -400 || ball.x < -100 || ball.x > W + 100) {
      finishShot();
    }
  }

  function finishShot() {
    state = "resolved";
    if (shotsTaken >= TOTAL_SHOTS) {
      endGame();
      return;
    }
    setTimeout(function () {
      resetBall();
    }, 500);
  }

  function endGame() {
    over = true;
    var improved = window.ArcadeCommon.setBest(GAME_ID, makes);
    resultBanner.innerHTML = '<span class="overlay-win">' + window.ArcadeI18n.t("common.gameOver") +
      " — " + makes + "/" + TOTAL_SHOTS + " made" + (improved ? " 🏆" : "") + "</span>";
    refreshHud();
  }

  function draw() {
    var grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "#1b2038");
    grad.addColorStop(1, "#262c4a");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // floor
    ctx.fillStyle = "#3a2a1c";
    ctx.fillRect(0, FLOOR_Y, W, H - FLOOR_Y);

    // backboard
    ctx.fillStyle = "#eef0fb";
    ctx.fillRect(HOOP_X - 40, RIM_Y - 55, 80, 8);
    ctx.strokeStyle = "#ff5d5d";
    ctx.strokeRect(HOOP_X - 14, RIM_Y - 47, 28, 16);

    // rim
    ctx.beginPath();
    ctx.moveTo(HOOP_X - RIM_HALF, RIM_Y);
    ctx.lineTo(HOOP_X + RIM_HALF, RIM_Y);
    ctx.strokeStyle = "#ff8a3d";
    ctx.lineWidth = 4;
    ctx.stroke();

    // net
    ctx.strokeStyle = "rgba(238,240,251,0.6)";
    ctx.lineWidth = 1;
    for (var i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(HOOP_X + i * (RIM_HALF / 2.2), RIM_Y);
      ctx.lineTo(HOOP_X + i * (RIM_HALF / 3.2), RIM_Y + 26);
      ctx.stroke();
    }

    if (dragging && dragCurrent && state === "ready") {
      var dx = dragCurrent.x - ball.x, dy = dragCurrent.y - ball.y;
      var dist = Math.min(Math.sqrt(dx * dx + dy * dy), MAX_DRAG);
      var angle = Math.atan2(dy, dx);
      ctx.beginPath();
      ctx.moveTo(ball.x, ball.y);
      ctx.lineTo(ball.x + Math.cos(angle) * dist, ball.y + Math.sin(angle) * dist);
      ctx.strokeStyle = "rgba(238,240,251,0.6)";
      ctx.setLineDash([5, 5]);
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.beginPath();
      ctx.moveTo(ball.x, ball.y);
      ctx.lineTo(ball.x - Math.cos(angle) * dist, ball.y - Math.sin(angle) * dist);
      ctx.strokeStyle = "#29e0c9";
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    ctx.font = (BALL_R * 2) + "px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("🏀", ball.x, ball.y);
  }

  function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
  }

  function startDrag(e) {
    if (over || state !== "ready") return;
    var pos = toCanvasPos(e);
    var dx = pos.x - ball.x, dy = pos.y - ball.y;
    if (Math.sqrt(dx * dx + dy * dy) > 90) return;
    dragging = true;
    dragCurrent = pos;
    e.preventDefault();
  }
  function moveDrag(e) {
    if (!dragging) return;
    dragCurrent = toCanvasPos(e);
    e.preventDefault();
  }
  function endDrag() {
    if (!dragging) return;
    dragging = false;
    var dx = dragCurrent.x - ball.x, dy = dragCurrent.y - ball.y;
    var dist = Math.min(Math.sqrt(dx * dx + dy * dy), MAX_DRAG);
    if (dist > 12) {
      var angle = Math.atan2(dy, dx);
      ball.vx = -Math.cos(angle) * dist * POWER_SCALE;
      ball.vy = -Math.sin(angle) * dist * POWER_SCALE;
      state = "flight";
      shotsTaken++;
      refreshHud();
    }
    dragCurrent = null;
  }

  canvas.addEventListener("mousedown", startDrag);
  canvas.addEventListener("mousemove", moveDrag);
  window.addEventListener("mouseup", endDrag);
  canvas.addEventListener("touchstart", startDrag, { passive: false });
  canvas.addEventListener("touchmove", moveDrag, { passive: false });
  canvas.addEventListener("touchend", endDrag);

  restartBtn.addEventListener("click", newGame);
  newGame();
  loop();
})();
