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
  var diffEl = document.getElementById("difficulty");

  var COLORS = [
    { name: "RED", hex: "#ff5d5d" },
    { name: "BLUE", hex: "#4d8dff" },
    { name: "GREEN", hex: "#3ddc84" },
    { name: "YELLOW", hex: "#ffd24d" }
  ];

  // Per-difficulty tuning. rounds = number of prompts, roundMs = time allowed
  // per round (auto-miss on expiry), totalMs = overall game clock.
  var DIFFICULTIES = {
    easy: { rounds: 15, roundMs: 4500, totalMs: 60000 },
    medium: { rounds: 20, roundMs: 3000, totalMs: 45000 },
    hard: { rounds: 28, roundMs: 1500, totalMs: 40000 }
  };
  var cfg = DIFFICULTIES.medium;

  var round, correct, reactionTimes, wordColor, roundStart, over, startTime, tickTimer, roundTimer;

  function refreshHud() {
    scoreEl.textContent = correct;
    bestEl.textContent = window.ArcadeCommon.getBest(GAME_ID) || 0;
    var avg = reactionTimes.length ? Math.round(reactionTimes.reduce(function (a, b) { return a + b; }, 0) / reactionTimes.length) : "-";
    roundInfo.textContent = "Round " + round + " / " + cfg.rounds + " · avg reaction: " + (avg === "-" ? "-" : avg + "ms");
  }

  function newGame() {
    round = 0;
    correct = 0;
    reactionTimes = [];
    over = false;
    resultBanner.innerHTML = "";
    startTime = Date.now();
    clearInterval(tickTimer);
    clearTimeout(roundTimer);
    tickTimer = setInterval(tickTime, 100);
    timeEl.textContent = Math.ceil(cfg.totalMs / 1000);
    refreshHud();
    renderSwatches();
    nextRound();
  }

  function tickTime() {
    if (over) return;
    var remaining = Math.max(0, cfg.totalMs - (Date.now() - startTime));
    timeEl.textContent = Math.ceil(remaining / 1000);
    if (remaining <= 0) endGame();
  }

  function renderSwatches() {
    swatchRow.innerHTML = "";
    var order = window.ArcadeCommon.shuffle(COLORS);
    order.forEach(function (c) {
      var btn = document.createElement("button");
      btn.className = "btn swatch";
      btn.style.width = "64px";
      btn.style.height = "64px";
      btn.style.borderRadius = "12px";
      btn.style.background = c.hex;
      btn.style.border = "2px solid var(--border)";
      btn.style.boxShadow = "0 0 16px " + c.hex + "80";
      btn.setAttribute("data-color", c.name);
      btn.addEventListener("click", function () { handleAnswer(c.name, btn); });
      swatchRow.appendChild(btn);
    });
  }

  function nextRound() {
    if (over) return;
    if (round >= cfg.rounds) {
      endGame();
      return;
    }
    round++;
    var wordText = window.ArcadeCommon.pick(COLORS);
    wordColor = window.ArcadeCommon.pick(COLORS);
    wordDisplay.textContent = wordText.name;
    wordDisplay.style.color = wordColor.hex;
    wordDisplay.style.textShadow = "0 0 22px " + wordColor.hex + "99";
    roundStart = Date.now();
    clearTimeout(roundTimer);
    roundTimer = setTimeout(roundTimeout, cfg.roundMs);
    refreshHud();
  }

  function flash(el, good) {
    if (!el) return;
    var cls = good ? "flash-good" : "flash-bad";
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }

  function roundTimeout() {
    if (over) return;
    flash(wordDisplay, false);
    refreshHud();
    nextRound();
  }

  function handleAnswer(name, btn) {
    if (over) return;
    clearTimeout(roundTimer);
    var rt = Date.now() - roundStart;
    var isRight = name === wordColor.name;
    if (isRight) {
      correct++;
      reactionTimes.push(rt);
    }
    flash(btn, isRight);
    refreshHud();
    nextRound();
  }

  function endGame() {
    if (over) return;
    over = true;
    clearInterval(tickTimer);
    clearTimeout(roundTimer);
    var improved = window.ArcadeCommon.setBest(GAME_ID, correct);
    var avg = reactionTimes.length ? Math.round(reactionTimes.reduce(function (a, b) { return a + b; }, 0) / reactionTimes.length) : 0;
    wordDisplay.textContent = "Done!";
    wordDisplay.style.color = "";
    wordDisplay.style.textShadow = "";
    resultBanner.innerHTML = '<span class="overlay-win">' + window.ArcadeI18n.t("common.gameOver") +
      " — " + correct + "/" + round + " correct, avg " + avg + "ms" + (improved ? " 🏆" : "") + "</span>";
    refreshHud();
  }

  restartBtn.addEventListener("click", newGame);

  // Difficulty selector - retunes pace and round count, starts a fresh game.
  window.ArcadeCommon.mountDifficulty(diffEl, GAME_ID, {
    defaultKey: "medium",
    onChange: function (level) {
      cfg = DIFFICULTIES[level] || DIFFICULTIES.medium;
      newGame();
    }
  });
})();
