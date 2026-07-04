(function () {
  var GAME_ID = "color-match-stroop";
  var scoreEl = document.getElementById("score");
  var bestEl = document.getElementById("best");
  var timeEl = document.getElementById("time");
  var roundInfo = document.getElementById("round-info");
  var wordDisplay = document.getElementById("word-display");
  var swatchRow = document.getElementById("swatch-row");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");

  var COLORS = [
    { name: "RED", hex: "#ff5d5d" },
    { name: "BLUE", hex: "#4d8dff" },
    { name: "GREEN", hex: "#3ddc84" },
    { name: "YELLOW", hex: "#ffd24d" }
  ];
  var TOTAL_ROUNDS = 20;
  var TIME_LIMIT_MS = 45000;

  var round, correct, reactionTimes, wordColor, roundStart, over, startTime, tickTimer;

  function refreshHud() {
    scoreEl.textContent = correct;
    bestEl.textContent = window.ArcadeCommon.getBest(GAME_ID) || 0;
    var avg = reactionTimes.length ? Math.round(reactionTimes.reduce(function (a, b) { return a + b; }, 0) / reactionTimes.length) : "-";
    roundInfo.textContent = "Round " + round + " / " + TOTAL_ROUNDS + " · avg reaction: " + (avg === "-" ? "-" : avg + "ms");
  }

  function newGame() {
    round = 0;
    correct = 0;
    reactionTimes = [];
    over = false;
    resultBanner.innerHTML = "";
    startTime = Date.now();
    clearInterval(tickTimer);
    tickTimer = setInterval(tickTime, 100);
    refreshHud();
    renderSwatches();
    nextRound();
  }

  function tickTime() {
    if (over) return;
    var remaining = Math.max(0, TIME_LIMIT_MS - (Date.now() - startTime));
    timeEl.textContent = Math.ceil(remaining / 1000);
    if (remaining <= 0) endGame();
  }

  function renderSwatches() {
    swatchRow.innerHTML = "";
    var order = window.ArcadeCommon.shuffle(COLORS);
    order.forEach(function (c) {
      var btn = document.createElement("button");
      btn.className = "btn";
      btn.style.width = "64px";
      btn.style.height = "64px";
      btn.style.borderRadius = "12px";
      btn.style.background = c.hex;
      btn.style.border = "2px solid var(--border)";
      btn.setAttribute("data-color", c.name);
      btn.addEventListener("click", function () { handleAnswer(c.name); });
      swatchRow.appendChild(btn);
    });
  }

  function nextRound() {
    if (over) return;
    if (round >= TOTAL_ROUNDS) {
      endGame();
      return;
    }
    round++;
    var wordText = window.ArcadeCommon.pick(COLORS);
    wordColor = window.ArcadeCommon.pick(COLORS);
    wordDisplay.textContent = wordText.name;
    wordDisplay.style.color = wordColor.hex;
    roundStart = Date.now();
    refreshHud();
  }

  function handleAnswer(name) {
    if (over) return;
    var rt = Date.now() - roundStart;
    if (name === wordColor.name) {
      correct++;
      reactionTimes.push(rt);
    }
    refreshHud();
    nextRound();
  }

  function endGame() {
    if (over) return;
    over = true;
    clearInterval(tickTimer);
    var improved = window.ArcadeCommon.setBest(GAME_ID, correct);
    var avg = reactionTimes.length ? Math.round(reactionTimes.reduce(function (a, b) { return a + b; }, 0) / reactionTimes.length) : 0;
    wordDisplay.textContent = "Done!";
    wordDisplay.style.color = "";
    resultBanner.innerHTML = '<span class="overlay-win">' + window.ArcadeI18n.t("common.gameOver") +
      " — " + correct + "/" + round + " correct, avg " + avg + "ms" + (improved ? " 🏆" : "") + "</span>";
    refreshHud();
  }

  restartBtn.addEventListener("click", newGame);
  newGame();
})();
