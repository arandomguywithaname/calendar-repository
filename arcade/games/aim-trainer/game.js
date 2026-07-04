(function () {
  var GAME_ID = "aim-trainer";
  var canvas = document.getElementById("board");
  var ctx = canvas.getContext("2d");
  var scoreEl = document.getElementById("score");
  var bestEl = document.getElementById("best");
  var timeEl = document.getElementById("time");
  var avgEl = document.getElementById("avg");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");

  var W = canvas.width, H = canvas.height;
  var DURATION = 30000;
  var MAX_TARGETS = 20;
  var MIN_R = 16, MAX_R = 26;

  var target, hits, times, spawnTime, startTime, over, rafId;

  function refreshHud() {
    scoreEl.textContent = hits;
    bestEl.textContent = window.ArcadeCommon.getBest(GAME_ID) || 0;
    var remain = Math.max(0, DURATION - (Date.now() - startTime));
    timeEl.textContent = (remain / 1000).toFixed(1);
    if (times.length) {
      var sum = times.reduce(function (a, b) { return a + b; }, 0);
      avgEl.textContent = Math.round(sum / times.length);
    } else {
      avgEl.textContent = "-";
    }
  }

  function spawnTarget() {
    var r = window.ArcadeCommon.randInt(MIN_R, MAX_R);
    target = {
      x: window.ArcadeCommon.randInt(r, W - r),
      y: window.ArcadeCommon.randInt(r, H - r),
      r: r
    };
    spawnTime = Date.now();
  }

  function newGame() {
    hits = 0;
    times = [];
    over = false;
    startTime = Date.now();
    resultBanner.innerHTML = "";
    spawnTarget();
    refreshHud();
    cancelAnimationFrame(rafId);
    loop();
  }

  function endGame() {
    over = true;
    target = null;
    var isBest = window.ArcadeCommon.setBest(GAME_ID, hits);
    refreshHud();
    var avgText = times.length ? Math.round(times.reduce(function (a, b) { return a + b; }, 0) / times.length) : "-";
    resultBanner.innerHTML = '<span class="overlay-win">' + window.ArcadeI18n.t("common.gameOver") +
      " — " + hits + " hits, avg " + avgText + "ms" + (isBest ? " — New Best!" : "") + "</span>";
  }

  function draw() {
    ctx.fillStyle = "#171b2e";
    ctx.fillRect(0, 0, W, H);

    if (target) {
      var grad = ctx.createRadialGradient(target.x, target.y, 2, target.x, target.y, target.r);
      grad.addColorStop(0, "#ff5da2");
      grad.addColorStop(0.6, "#c23a72");
      grad.addColorStop(0.61, "#eef0fb");
      grad.addColorStop(0.8, "#ff5da2");
      grad.addColorStop(1, "#7c5cff");
      ctx.beginPath();
      ctx.arc(target.x, target.y, target.r, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(target.x, target.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = "#eef0fb";
      ctx.fill();
    }
  }

  function loop() {
    if (over) return;
    refreshHud();
    draw();
    if (Date.now() - startTime >= DURATION) {
      endGame();
      return;
    }
    rafId = requestAnimationFrame(loop);
  }

  canvas.addEventListener("click", function (e) {
    if (over || !target) return;
    var rect = canvas.getBoundingClientRect();
    var x = (e.clientX - rect.left) * (W / rect.width);
    var y = (e.clientY - rect.top) * (H / rect.height);
    var dx = x - target.x, dy = y - target.y;
    if (Math.sqrt(dx * dx + dy * dy) <= target.r) {
      hits++;
      times.push(Date.now() - spawnTime);
      if (hits >= MAX_TARGETS) {
        endGame();
        return;
      }
      spawnTarget();
      refreshHud();
    }
  });

  restartBtn.addEventListener("click", newGame);
  newGame();
})();
