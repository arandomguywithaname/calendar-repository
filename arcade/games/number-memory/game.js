(function () {
  var GAME_ID = "number-memory";
  var displayEl = document.getElementById("number-display");
  var form = document.getElementById("answer-form");
  var input = document.getElementById("answer-input");
  var scoreEl = document.getElementById("score");
  var bestEl = document.getElementById("best");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");
  var diffEl = document.getElementById("difficulty");

  var length, score, current, showTimer, over;

  // Per-difficulty tuning. "start" = starting digit count, show time is
  // "base" + length * "per" (ms). Easy: fewer digits, longer look; Hard: reverse.
  var DIFFICULTIES = {
    easy: { start: 3, base: 2200, per: 300 },
    medium: { start: 4, base: 1500, per: 250 },
    hard: { start: 5, base: 700, per: 150 }
  };
  var cfg = DIFFICULTIES.medium;

  var GLOW = "0 0 14px var(--accent-3), 0 0 30px rgba(41,224,201,0.5)";

  function refreshHud() {
    scoreEl.textContent = score;
    bestEl.textContent = window.ArcadeCommon.getBest(GAME_ID) || 0;
  }

  function randomDigits(n) {
    var s = "";
    for (var i = 0; i < n; i++) s += String(window.ArcadeCommon.randInt(0, 9));
    return s;
  }

  function newGame() {
    length = cfg.start;
    score = 0;
    over = false;
    resultBanner.innerHTML = "";
    form.style.display = "none";
    refreshHud();
    startRound();
  }

  function startRound() {
    clearTimeout(showTimer);
    current = randomDigits(length);
    form.style.display = "none";
    input.value = "";
    displayEl.textContent = current;
    displayEl.style.color = "var(--accent-3)";
    displayEl.style.textShadow = GLOW;
    var showTime = cfg.base + length * cfg.per;
    showTimer = setTimeout(function () {
      displayEl.textContent = "? ? ? ?";
      displayEl.style.color = "";
      displayEl.style.textShadow = "";
      form.style.display = "block";
      input.focus();
    }, showTime);
  }

  function submitAnswer(e) {
    e.preventDefault();
    if (over) return;
    var guess = input.value.trim();
    if (guess === current) {
      score = length;
      length++;
      refreshHud();
      window.ArcadeCommon.toast("Correct! Next: " + length + " digits");
      form.style.display = "none";
      displayEl.style.color = "";
      displayEl.style.textShadow = "";
      displayEl.textContent = "Nice! Get ready...";
      setTimeout(startRound, 900);
    } else {
      over = true;
      clearTimeout(showTimer);
      var improved = window.ArcadeCommon.setBest(GAME_ID, score);
      displayEl.style.color = "var(--danger)";
      displayEl.style.textShadow = "0 0 14px var(--danger)";
      displayEl.textContent = "It was " + current;
      form.style.display = "none";
      resultBanner.innerHTML = '<span class="overlay-lose">' + window.ArcadeI18n.t("common.gameOver") +
        " — " + window.ArcadeI18n.t("common.score") + ": " + score + (improved ? " 🏆" : "") + "</span>";
      refreshHud();
    }
  }

  form.addEventListener("submit", submitAnswer);
  restartBtn.addEventListener("click", newGame);

  // Difficulty selector - changing it starts a fresh game at the new setting.
  window.ArcadeCommon.mountDifficulty(diffEl, GAME_ID, {
    defaultKey: "medium",
    onChange: function (level) {
      cfg = DIFFICULTIES[level] || DIFFICULTIES.medium;
      newGame();
    }
  });
})();
