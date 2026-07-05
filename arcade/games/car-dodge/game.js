(function () {
  var GAME_ID = "car-dodge";
  var canvas = document.getElementById("board");
  var ctx = canvas.getContext("2d");
  var scoreEl = document.getElementById("score");
  var bestEl = document.getElementById("best");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");
  var diffEl = document.getElementById("difficulty");

  var W = canvas.width, H = canvas.height;
  var LANES = 3;
  var LANE_W = W / LANES;
  var PLAYER_W = 46, PLAYER_H = 78;
  var TRAFFIC_W = 46, TRAFFIC_H = 78;
  var COLORS = ["#ff5d5d", "#4d8dff", "#ffd24d", "#3ddc84", "#7c5cff"];

  // Difficulty tuning. base/max = speed range (px/frame), rampMs = how fast
  // speed climbs, spawnBase/spawnMin/spawnRamp control traffic density and how
  // quickly it thickens. Hard is fast, dense and accelerates hard.
  var DIFFICULTIES = {
    easy:   { base: 2.4, max: 7,  rampMs: 5200, spawnBase: 1450, spawnMin: 640, spawnRamp: 42 },
    medium: { base: 3.0, max: 10, rampMs: 3500, spawnBase: 1100, spawnMin: 420, spawnRamp: 25 },
    hard:   { base: 4.4, max: 13, rampMs: 2200, spawnBase: 820,  spawnMin: 300, spawnRamp: 16 }
  };
  var cfg = DIFFICULTIES.medium;

  var playerLane, playerX, targetX, traffic, distance, elapsedMs, spawnTimer, over, dashOffset, raf, particles;

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
    particles = [];
    distance = 0;
    elapsedMs = 0;
    spawnTimer = 0;
    dashOffset = 0;
    over = false;
    resultBanner.innerHTML = "";
    refreshHud();
  }

  function currentSpeed() { return Math.min(cfg.base + elapsedMs / cfg.rampMs, cfg.max); }
  function currentSpawnInterval() { return Math.max(cfg.spawnBase - elapsedMs / cfg.spawnRamp, cfg.spawnMin); }

  function spawnTraffic() {
    var lane = window.ArcadeCommon.randInt(0, LANES - 1);
    var blocked = traffic.some(function (c) { return c.lane === lane && c.y < TRAFFIC_H * 2; });
    if (blocked) return;
    traffic.push({
      lane: lane,
      x: laneCenter(lane),
      y: -TRAFFIC_H,
      color: window.ArcadeCommon.pick(COLORS)
    });
  }

  function burst(x, y, color, n) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2;
      var s = 1 + Math.random() * 5;
      particles.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, color: color });
    }
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
    burst(playerX, H - 110, "#ff8a3d", 30);
    burst(playerX, H - 110, "#ffd24d", 20);
    var improved = window.ArcadeCommon.setBest(GAME_ID, Math.floor(distance / 10));
    resultBanner.innerHTML = '<span class="overlay-lose">' + window.ArcadeI18n.t("common.gameOver") +
      " — " + window.ArcadeI18n.t("common.score") + ": " + Math.floor(distance / 10) + (improved ? " 🏆" : "") + "</span>";
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

  function drawCar(x, y, w, h, color, isPlayer) {
    var left = x - w / 2, top = y - h / 2;
    var grad = ctx.createLinearGradient(left, 0, left + w, 0);
    grad.addColorStop(0, shade(color));
    grad.addColorStop(0.5, color);
    grad.addColorStop(1, shade(color));
    ctx.shadowColor = color;
    ctx.shadowBlur = isPlayer ? 22 : 14;
    ctx.fillStyle = grad;
    roundRect(left, top, w, h, 9);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Windows (tinted glass).
    ctx.fillStyle = "rgba(180,230,255,0.5)";
    roundRect(left + 6, top + 10, w - 12, h * 0.28, 4); ctx.fill();
    roundRect(left + 6, top + h * 0.5, w - 12, h * 0.28, 4); ctx.fill();

    // Light strip.
    var lightY = isPlayer ? top + 4 : top + h - 8;
    ctx.fillStyle = isPlayer ? "rgba(255,255,255,0.85)" : "rgba(255,80,80,0.85)";
    ctx.fillRect(left + 7, lightY, w - 14, 4);
  }

  function shade(hex) {
    var n = parseInt(hex.slice(1), 16);
    var r = Math.round(((n >> 16) & 255) * 0.55);
    var g = Math.round(((n >> 8) & 255) * 0.55);
    var b = Math.round((n & 255) * 0.55);
    return "rgb(" + r + "," + g + "," + b + ")";
  }

  function draw() {
    // Asphalt gradient.
    var road = ctx.createLinearGradient(0, 0, W, 0);
    road.addColorStop(0, "#191d2c");
    road.addColorStop(0.5, "#22283a");
    road.addColorStop(1, "#191d2c");
    ctx.fillStyle = road;
    ctx.fillRect(0, 0, W, H);

    // Glowing neon side rails.
    ctx.shadowColor = "#7c5cff";
    ctx.shadowBlur = 14;
    ctx.fillStyle = "#7c5cff";
    ctx.fillRect(0, 0, 5, H);
    ctx.fillStyle = "#29e0c9";
    ctx.shadowColor = "#29e0c9";
    ctx.fillRect(W - 5, 0, 5, H);
    ctx.shadowBlur = 0;

    // Glowing dashed lane dividers.
    ctx.strokeStyle = "rgba(238,240,251,0.6)";
    ctx.shadowColor = "#eef0fb";
    ctx.shadowBlur = 8;
    ctx.lineWidth = 3;
    ctx.setLineDash([22, 18]);
    for (var lane = 1; lane < LANES; lane++) {
      ctx.beginPath();
      ctx.moveTo(lane * LANE_W, -40 + dashOffset);
      ctx.lineTo(lane * LANE_W, H);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.shadowBlur = 0;

    traffic.forEach(function (c) { drawCar(c.x, c.y, TRAFFIC_W, TRAFFIC_H, c.color, false); });
    if (!over) drawCar(playerX, H - 110, PLAYER_W, PLAYER_H, "#29e0c9", true);

    // Particles (crash debris).
    particles = particles.filter(function (p) { return p.life > 0; });
    particles.forEach(function (p) {
      p.x += p.vx; p.y += p.vy; p.vy += 0.08; p.life -= 0.02;
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.1, 4 * p.life), 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
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
    if (over) return;
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

  // Difficulty selector - changing it restarts with the new tuning.
  window.ArcadeCommon.mountDifficulty(diffEl, GAME_ID, {
    defaultKey: "medium",
    onChange: function (level) {
      cfg = DIFFICULTIES[level] || DIFFICULTIES.medium;
      newGame();
    }
  });
  raf = requestAnimationFrame(loop);
})();
