(function () {
  var GAME_ID = "whack-a-mole";
  var boardEl = document.getElementById("board");
  var scoreEl = document.getElementById("score");
  var timeEl = document.getElementById("time");
  var bestEl = document.getElementById("best");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");

  var HOLES = 9;
  var GAME_TIME = 30;

  var holes, score, timeLeft, over, tickTimer, moleTimer;

  function refreshHud() {
    scoreEl.textContent = score;
    timeEl.textContent = timeLeft;
    bestEl.textContent = window.ArcadeCommon.getBest(GAME_ID) || 0;
  }

  function newGame() {
    holes = [];
    for (var i = 0; i < HOLES; i++) holes.push({ up: false, whacked: false });
    score = 0;
    timeLeft = GAME_TIME;
    over = false;
    resultBanner.innerHTML = "";
    refreshHud();
    render();
    clearInterval(tickTimer);
    clearTimeout(moleTimer);
    tickTimer = setInterval(tick, 1000);
    scheduleMole();
  }

  function render() {
    boardEl.innerHTML = "";
    holes.forEach(function (h, i) {
      var cell = document.createElement("div");
      cell.className = "cell";
      cell.textContent = h.up ? (h.whacked ? "💥" : "🐹") : "🕳️";
      cell.addEventListener("click", function () { whack(i); });
      boardEl.appendChild(cell);
    });
  }

  function whack(i) {
    if (over) return;
    var h = holes[i];
    if (h.up && !h.whacked) {
      h.whacked = true;
      score++;
      refreshHud();
      render();
    }
  }

  function scheduleMole() {
    if (over) return;
    var delay = window.ArcadeCommon.randInt(400, 900);
    moleTimer = setTimeout(function () {
      if (over) return;
      var idx = window.ArcadeCommon.randInt(0, HOLES - 1);
      if (!holes[idx].up) {
        holes[idx].up = true;
        holes[idx].whacked = false;
        render();
        var upTime = window.ArcadeCommon.randInt(650, 1100);
        setTimeout(function () {
          if (over) return;
          holes[idx].up = false;
          holes[idx].whacked = false;
          render();
        }, upTime);
      }
      scheduleMole();
    }, delay);
  }

  function tick() {
    if (over) return;
    timeLeft--;
    refreshHud();
    if (timeLeft <= 0) endGame();
  }

  function endGame() {
    over = true;
    clearInterval(tickTimer);
    clearTimeout(moleTimer);
    holes.forEach(function (h) { h.up = false; });
    render();
    var improved = window.ArcadeCommon.setBest(GAME_ID, score);
    resultBanner.innerHTML = '<span class="overlay-win">' + window.ArcadeI18n.t("common.gameOver") +
      " — " + window.ArcadeI18n.t("common.score") + ": " + score + (improved ? " 🏆" : "") + "</span>";
    refreshHud();
  }

  restartBtn.addEventListener("click", newGame);
  newGame();
})();
