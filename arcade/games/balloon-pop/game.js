(function () {
  var GAME_ID = "balloon-pop";
  var boardEl = document.getElementById("board");
  var scoreEl = document.getElementById("score");
  var bestEl = document.getElementById("best");
  var timeEl = document.getElementById("time");
  var livesEl = document.getElementById("lives");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");

  var COLORS = ["#ff5da2", "#7c5cff", "#29e0c9", "#ffb84d", "#3ddc84", "#ff5d5d", "#4ac3ff"];
  var BOARD_W = 480, BOARD_H = 480;

  var balloons, score, lives, timeLeft, over, spawnTimer, tickTimer, rafId, nextId;

  function refreshHud() {
    scoreEl.textContent = score;
    livesEl.textContent = lives;
    timeEl.textContent = timeLeft;
    var best = window.ArcadeCommon.getBest(GAME_ID);
    bestEl.textContent = best === null ? "-" : best;
  }

  function newGame() {
    balloons = [];
    score = 0;
    lives = 3;
    timeLeft = 30;
    over = false;
    nextId = 1;
    resultBanner.innerHTML = "";
    boardEl.innerHTML = "";
    refreshHud();
    clearInterval(spawnTimer);
    clearInterval(tickTimer);
    cancelAnimationFrame(rafId);
    spawnTimer = setInterval(spawnBalloon, 650);
    tickTimer = setInterval(function () {
      if (over) return;
      timeLeft--;
      refreshHud();
      if (timeLeft <= 0) endGame();
    }, 1000);
    spawnBalloon();
    rafId = requestAnimationFrame(loop);
  }

  function spawnBalloon() {
    if (over) return;
    var isBomb = Math.random() < 0.14;
    var size = window.ArcadeCommon.randInt(38, 68);
    var b = {
      id: nextId++,
      x: window.ArcadeCommon.randInt(0, BOARD_W - size),
      y: BOARD_H + size,
      size: size,
      speed: window.ArcadeCommon.randInt(60, 130) / 60,
      isBomb: isBomb,
      color: isBomb ? "#111" : window.ArcadeCommon.pick(COLORS),
      el: null
    };
    var el = document.createElement("div");
    el.className = "balloon";
    el.style.fontSize = size + "px";
    el.textContent = isBomb ? "💣" : "🎈";
    if (!isBomb) el.style.filter = "drop-shadow(0 0 0 " + b.color + ")";
    el.style.color = b.color;
    el.style.left = b.x + "px";
    el.style.top = b.y + "px";
    el.addEventListener("click", function () { pop(b); });
    el.addEventListener("touchstart", function (e) { e.preventDefault(); pop(b); }, { passive: false });
    boardEl.appendChild(el);
    b.el = el;
    balloons.push(b);
  }

  function pop(b) {
    if (over || b.popped) return;
    b.popped = true;
    if (b.el && b.el.parentNode) b.el.parentNode.removeChild(b.el);
    balloons = balloons.filter(function (x) { return x !== b; });
    if (b.isBomb) {
      lives--;
      score = Math.max(0, score - 5);
      window.ArcadeCommon.toast("💥 Bomb!");
      if (lives <= 0) { refreshHud(); endGame(); return; }
    } else {
      var gain = Math.round(100 / b.size * 10);
      score += gain;
    }
    refreshHud();
  }

  function loop() {
    if (!over) {
      balloons.forEach(function (b) {
        b.y -= b.speed;
        if (b.el) b.el.style.top = b.y + "px";
        if (b.y < -b.size) {
          b.popped = true;
          if (b.el && b.el.parentNode) b.el.parentNode.removeChild(b.el);
        }
      });
      balloons = balloons.filter(function (b) { return !b.popped; });
      rafId = requestAnimationFrame(loop);
    }
  }

  function endGame() {
    if (over) return;
    over = true;
    clearInterval(spawnTimer);
    clearInterval(tickTimer);
    cancelAnimationFrame(rafId);
    var improved = window.ArcadeCommon.setBest(GAME_ID, score);
    var text = lives <= 0 ? window.ArcadeI18n.t("common.gameOver") : window.ArcadeI18n.t("common.gameOver");
    resultBanner.innerHTML = '<span class="' + (lives <= 0 ? "overlay-lose" : "overlay-win") + '">' +
      text + " — " + window.ArcadeI18n.t("common.score") + ": " + score + (improved ? " 🏆" : "") + "</span>";
    refreshHud();
  }

  restartBtn.addEventListener("click", newGame);
  newGame();
})();
