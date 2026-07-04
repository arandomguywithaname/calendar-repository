(function () {
  var GAME_ID = "asteroid-dodge";
  var canvas = document.getElementById("board");
  var ctx = canvas.getContext("2d");
  var scoreEl = document.getElementById("score");
  var bestEl = document.getElementById("best");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");

  var W = canvas.width, H = canvas.height;
  var SHIP_W = 28, SHIP_H = 28;

  var ship, asteroids, over, startTime, score, loopId, spawnTimer;

  function refreshHud() {
    scoreEl.textContent = score;
    bestEl.textContent = window.ArcadeCommon.getBest(GAME_ID) || 0;
  }

  function newGame() {
    ship = { x: W / 2 - SHIP_W / 2 };
    asteroids = [];
    over = false;
    score = 0;
    startTime = performance.now();
    spawnTimer = 0;
    resultBanner.innerHTML = "";
    refreshHud();
    cancelAnimationFrame(loopId);
    lastFrame = performance.now();
    loop();
  }

  var lastFrame;

  function spawnAsteroid(elapsedSec) {
    var size = window.ArcadeCommon.randInt(18, 40);
    var speed = 2 + Math.min(6, elapsedSec * 0.12) + Math.random() * 2;
    asteroids.push({
      x: Math.random() * (W - size),
      y: -size,
      size: size,
      speed: speed,
      rot: Math.random() * Math.PI
    });
  }

  function update(dt) {
    if (over) return;
    var elapsedSec = (performance.now() - startTime) / 1000;
    score = Math.floor(elapsedSec * 10);
    refreshHud();

    spawnTimer += dt;
    var spawnInterval = Math.max(180, 700 - elapsedSec * 12);
    if (spawnTimer > spawnInterval) {
      spawnTimer = 0;
      spawnAsteroid(elapsedSec);
    }

    asteroids.forEach(function (a) { a.y += a.speed; });
    asteroids = asteroids.filter(function (a) { return a.y < H + 60; });

    var shipY = H - 50;
    for (var i = 0; i < asteroids.length; i++) {
      var a = asteroids[i];
      var cx = Math.max(ship.x, Math.min(a.x + a.size / 2, ship.x + SHIP_W));
      var cy = Math.max(shipY, Math.min(a.y + a.size / 2, shipY + SHIP_H));
      var dx = (a.x + a.size / 2) - cx;
      var dy = (a.y + a.size / 2) - cy;
      if (dx * dx + dy * dy < (a.size / 2) * (a.size / 2)) {
        endGame();
        return;
      }
    }
  }

  function endGame() {
    over = true;
    window.ArcadeCommon.setBest(GAME_ID, score);
    resultBanner.innerHTML = '<span class="overlay-lose">' + window.ArcadeI18n.t("common.gameOver") + " — " + window.ArcadeI18n.t("common.score") + ": " + score + "</span>";
  }

  function draw() {
    ctx.fillStyle = "#0f1220";
    ctx.fillRect(0, 0, W, H);

    ctx.font = (SHIP_H) + "px sans-serif";
    ctx.save();
    ctx.translate(ship.x + SHIP_W / 2, H - 50 + SHIP_H / 2);
    ctx.fillText("🚀", -SHIP_W / 2, SHIP_H / 2 - 4);
    ctx.restore();

    ctx.textAlign = "left";
    asteroids.forEach(function (a) {
      ctx.save();
      ctx.font = a.size + "px sans-serif";
      ctx.fillText("☄️", a.x, a.y + a.size);
      ctx.restore();
    });
  }

  function loop(now) {
    now = now || performance.now();
    var dt = Math.min(50, now - lastFrame);
    lastFrame = now;
    update(dt);
    draw();
    if (!over) loopId = requestAnimationFrame(loop);
  }

  function setShipX(x) {
    ship.x = Math.max(0, Math.min(W - SHIP_W, x - SHIP_W / 2));
  }

  canvas.addEventListener("mousemove", function (e) {
    var rect = canvas.getBoundingClientRect();
    setShipX((e.clientX - rect.left) * (W / rect.width));
  });

  canvas.addEventListener("touchmove", function (e) {
    e.preventDefault();
    var rect = canvas.getBoundingClientRect();
    setShipX((e.touches[0].clientX - rect.left) * (W / rect.width));
  }, { passive: false });

  var keys = {};
  document.addEventListener("keydown", function (e) {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") e.preventDefault();
    keys[e.key] = true;
  });
  document.addEventListener("keyup", function (e) { keys[e.key] = false; });

  setInterval(function () {
    if (over) return;
    if (keys.ArrowLeft) ship.x = Math.max(0, ship.x - 6);
    if (keys.ArrowRight) ship.x = Math.min(W - SHIP_W, ship.x + 6);
  }, 16);

  document.getElementById("touch-controls").addEventListener("click", function (e) {
    var btn = e.target.closest("[data-dir]");
    if (!btn || over) return;
    var d = btn.getAttribute("data-dir");
    ship.x = Math.max(0, Math.min(W - SHIP_W, ship.x + (d === "left" ? -30 : 30)));
  });

  restartBtn.addEventListener("click", newGame);
  newGame();
})();
