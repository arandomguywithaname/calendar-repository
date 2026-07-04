(function () {
  var GAME_ID = "car-dodge";
  var canvas = document.getElementById("board");
  var ctx = canvas.getContext("2d");
  var scoreEl = document.getElementById("score");
  var bestEl = document.getElementById("best");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");

  var W = canvas.width, H = canvas.height;
  var LANES = 3;
  var LANE_W = W / LANES;
  var PLAYER_W = 46, PLAYER_H = 78;
  var TRAFFIC_W = 46, TRAFFIC_H = 78;
  var COLORS = ["#ff5d5d", "#4d8dff", "#ffd24d", "#3ddc84", "#7c5cff"];

  var playerLane, playerX, targetX, traffic, distance, elapsedMs, spawnTimer, over, dashOffset, raf;

  function laneCenter(lane) { return lane * LANE_W + LANE_W / 2; }

  function refreshHud() {
    scoreEl.textContent = Math.floor(distance / 10);
    bestEl.textContent = window.ArcadeCommon.getBest(GAME_ID) || 0;
  }

  function newGame() {
    playerLane = 1;
    playerX = laneCenter(playerLane);
    targetX = playerX;
    traffic = [];
    distance = 0;
    elapsedMs = 0;
    spawnTimer = 0;
    dashOffset = 0;
    over = false;
    resultBanner.innerHTML = "";
    refreshHud();
  }

  function currentSpeed() { return Math.min(3 + elapsedMs / 3500, 10); }
  function currentSpawnInterval() { return Math.max(1100 - elapsedMs / 25, 420); }

  function spawnTraffic() {
    var lane = window.ArcadeCommon.randInt(0, LANES - 1);
    // avoid stacking directly on top of another car in the same lane
    var blocked = traffic.some(function (c) { return c.lane === lane && c.y < TRAFFIC_H * 2; });
    if (blocked) return;
    traffic.push({
      lane: lane,
      x: laneCenter(lane),
      y: -TRAFFIC_H,
      color: window.ArcadeCommon.pick(COLORS)
    });
  }

  function update(dt) {
    if (over) return;
    elapsedMs += dt;
    var speed = currentSpeed();
    distance += speed;
    dashOffset = (dashOffset + speed) % 40;

    playerX += (targetX - playerX) * 0.25;

    spawnTimer += dt;
    if (spawnTimer >= currentSpawnInterval()) {
      spawnTimer = 0;
      spawnTraffic();
    }

    traffic.forEach(function (c) { c.y += speed; });
    traffic = traffic.filter(function (c) { return c.y < H + TRAFFIC_H; });

    var pTop = H - 110 - PLAYER_H / 2, pBottom = H - 110 + PLAYER_H / 2;
    var pLeft = playerX - PLAYER_W / 2, pRight = playerX + PLAYER_W / 2;
    for (var i = 0; i < traffic.length; i++) {
      var c = traffic[i];
      var cLeft = c.x - TRAFFIC_W / 2, cRight = c.x + TRAFFIC_W / 2;
      var cTop = c.y - TRAFFIC_H / 2, cBottom = c.y + TRAFFIC_H / 2;
      if (pLeft < cRight - 6 && pRight > cLeft + 6 && pTop < cBottom - 6 && pBottom > cTop + 6) {
        endGame();
        return;
      }
    }
    refreshHud();
  }

  function endGame() {
    over = true;
    var improved = window.ArcadeCommon.setBest(GAME_ID, Math.floor(distance / 10));
    resultBanner.innerHTML = '<span class="overlay-lose">' + window.ArcadeI18n.t("common.gameOver") +
      " — " + window.ArcadeI18n.t("common.score") + ": " + Math.floor(distance / 10) + (improved ? " 🏆" : "") + "</span>";
    refreshHud();
  }

  function drawCar(x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x - w / 2, y - h / 2, w, h);
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.fillRect(x - w / 2 + 6, y - h / 2 + 10, w - 12, h * 0.32);
    ctx.fillRect(x - w / 2 + 6, y + h * 0.06, w - 12, h * 0.32);
  }

  function draw() {
    ctx.fillStyle = "#3a3f52";
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = "#2c3044";
    ctx.fillRect(0, 0, LANE_W * 0.12, H);
    ctx.fillRect(W - LANE_W * 0.12, 0, LANE_W * 0.12, H);

    ctx.strokeStyle = "rgba(238,240,251,0.55)";
    ctx.lineWidth = 3;
    ctx.setLineDash([22, 18]);
    for (var lane = 1; lane < LANES; lane++) {
      ctx.beginPath();
      ctx.moveTo(lane * LANE_W, -40 + dashOffset);
      ctx.lineTo(lane * LANE_W, H);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    traffic.forEach(function (c) { drawCar(c.x, c.y, TRAFFIC_W, TRAFFIC_H, c.color); });
    drawCar(playerX, H - 110, PLAYER_W, PLAYER_H, "#29e0c9");
  }

  var lastTime = null;
  function loop(ts) {
    if (lastTime === null) lastTime = ts;
    var dt = Math.min(ts - lastTime, 40);
    lastTime = ts;
    update(dt);
    draw();
    raf = requestAnimationFrame(loop);
  }

  function moveLane(delta) {
    playerLane = Math.max(0, Math.min(LANES - 1, playerLane + delta));
    targetX = laneCenter(playerLane);
  }

  document.addEventListener("keydown", function (e) {
    if (e.key === "ArrowLeft") { e.preventDefault(); moveLane(-1); }
    else if (e.key === "ArrowRight") { e.preventDefault(); moveLane(1); }
  });

  document.getElementById("touch-controls").addEventListener("click", function (e) {
    var btn = e.target.closest("[data-dir]");
    if (!btn) return;
    moveLane(btn.getAttribute("data-dir") === "left" ? -1 : 1);
  });

  var touchStartX = null;
  canvas.addEventListener("touchstart", function (e) { touchStartX = e.touches[0].clientX; });
  canvas.addEventListener("touchend", function (e) {
    if (touchStartX === null) return;
    var dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) > 25) moveLane(dx > 0 ? 1 : -1);
    touchStartX = null;
  });

  restartBtn.addEventListener("click", newGame);
  newGame();
  raf = requestAnimationFrame(loop);
})();
