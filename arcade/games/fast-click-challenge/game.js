(function () {
  var GAME_ID = "fast-click-challenge";
  var bigBtn = document.getElementById("big-button");
  var scoreEl = document.getElementById("score");
  var bestEl = document.getElementById("best");
  var timeEl = document.getElementById("time");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");

  var DURATION_MS = 10000;
  var clicks, running, over, startTime, tickTimer;

  function refreshHud() {
    scoreEl.textContent = clicks;
    bestEl.textContent = window.ArcadeCommon.getBest(GAME_ID) || 0;
  }

  function newGame() {
    clicks = 0;
    running = false;
    over = false;
    clearInterval(tickTimer);
    timeEl.textContent = (DURATION_MS / 1000).toFixed(1);
    resultBanner.innerHTML = "";
    bigBtn.textContent = "Click to Start!";
    bigBtn.disabled = false;
    refreshHud();
  }

  function tick() {
    var elapsed = Date.now() - startTime;
    var remaining = Math.max(0, DURATION_MS - elapsed);
    timeEl.textContent = (remaining / 1000).toFixed(1);
    if (remaining <= 0) endGame();
  }

  function endGame() {
    if (over) return;
    over = true;
    running = false;
    clearInterval(tickTimer);
    timeEl.textContent = "0.0";
    bigBtn.disabled = true;
    bigBtn.textContent = "Time's up!";
    var improved = window.ArcadeCommon.setBest(GAME_ID, clicks);
    resultBanner.innerHTML = '<span class="overlay-win">' + window.ArcadeI18n.t("common.gameOver") +
      " — " + clicks + " " + window.ArcadeI18n.t("common.score") + (improved ? " 🏆" : "") + "</span>";
    refreshHud();
  }

  function handleClick() {
    if (over) return;
    if (!running) {
      running = true;
      startTime = Date.now();
      clearInterval(tickTimer);
      tickTimer = setInterval(tick, 50);
    }
    clicks++;
    refreshHud();
  }

  bigBtn.addEventListener("click", handleClick);
  restartBtn.addEventListener("click", newGame);
  newGame();
})();
