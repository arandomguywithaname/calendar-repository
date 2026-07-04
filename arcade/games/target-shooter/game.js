(function () {
  var GAME_ID = "target-shooter";
  var canvas = document.getElementById("board");
  var ctx = canvas.getContext("2d");
  var scoreEl = document.getElementById("score");
  var timeEl = document.getElementById("time");
  var bestEl = document.getElementById("best");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");

  var W = canvas.width, H = canvas.height;
  var GAME_TIME = 30;
  var MAX_TARGETS = 3;

  var targets, score, timeLeft, over, spawnTimer, tickTimer, loopId, lastFrame;

  function refreshHud() {
    scoreEl.textContent = score;
    timeEl.textContent = timeLeft;
    bestEl.textContent = window.ArcadeCommon.getBest(GAME_ID) || 0;
  }

  function newGame() {
    targets = [];
    score = 0;
    timeLeft = GAME_TIME;
    over = false;
    resultBanner.innerHTML = "";
    refreshHud();
    clearInterval(tickTimer);
    tickTimer = setInterval(function () {
      if (over) return;
      timeLeft--;
      refreshHud();
      if (timeLeft <= 0) endGame();
    }, 1000);
    cancelAnimationFrame(loopId);
    lastFrame = performance.now();
    spawnTimer = 0;
    loop();
  }

  function spawnTarget() {
    var radius = window.ArcadeCommon.randInt(16, 40);
    var lifetime = window.ArcadeCommon.randInt(650, 1600);
    var points = Math.max(5, Math.round((44 - radius) * 2 + (1600 - lifetime) / 40));
    targets.push({
      x: window.ArcadeCommon.randInt(radius + 10, W - radius - 10),
      y: window.ArcadeCommon.randInt(radius + 10, H - radius - 10),
      radius: radius,
      lifetime: lifetime,
      born: performance.now(),
      points: points,
      hit: false
    });
  }

  function update(dt) {
    if (over) return;
    spawnTimer += dt;
    var interval = window.ArcadeCommon.randInt(450, 850);
    if (spawnTimer > interval && targets.length < MAX_TARGETS) {
      spawnTimer = 0;
      spawnTarget();
    }
    var now = performance.now();
    targets = targets.filter(function (t) {
      return !t.hit && (now - t.born) < t.lifetime;
    });
  }

  function draw() {
    ctx.fillStyle = "#171b2e";
    ctx.fillRect(0, 0, W, H);

    var now = performance.now();
    targets.forEach(function (t) {
      var progress = (now - t.born) / t.lifetime;
      var r = t.radius * (1 - progress * 0.45);
      var alpha = Math.max(0, 1 - progress * 0.85);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(t.x, t.y, r, 0, Math.PI * 2);
      ctx.fillStyle = "#ff5da2";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(t.x, t.y, r * 0.62, 0, Math.PI * 2);
      ctx.fillStyle = "#eef0fb";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(t.x, t.y, r * 0.28, 0, Math.PI * 2);
      ctx.fillStyle = "#ff5da2";
      ctx.fill();
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

  function endGame() {
    over = true;
    clearInterval(tickTimer);
    var improved = window.ArcadeCommon.setBest(GAME_ID, score);
    resultBanner.innerHTML = '<span class="overlay-win">' + window.ArcadeI18n.t("common.gameOver") +
      " — " + window.ArcadeI18n.t("common.score") + ": " + score + (improved ? " 🏆" : "") + "</span>";
    refreshHud();
  }

  canvas.addEventListener("click", function (e) {
    if (over) return;
    var rect = canvas.getBoundingClientRect();
    var x = (e.clientX - rect.left) * (W / rect.width);
    var y = (e.clientY - rect.top) * (H / rect.height);
    var now = performance.now();
    for (var i = targets.length - 1; i >= 0; i--) {
      var t = targets[i];
      if (t.hit) continue;
      var progress = (now - t.born) / t.lifetime;
      var r = t.radius * (1 - progress * 0.45);
      var dx = x - t.x, dy = y - t.y;
      if (dx * dx + dy * dy <= r * r) {
        t.hit = true;
        score += t.points;
        window.ArcadeCommon.toast("+" + t.points);
        refreshHud();
        break;
      }
    }
  });

  restartBtn.addEventListener("click", newGame);
  newGame();
})();
