(function () {
  var GAME_ID = "guess-the-number";
  var promptEl = document.getElementById("prompt");
  var inputEl = document.getElementById("guess-input");
  var guessBtn = document.getElementById("guess-btn");
  var feedbackEl = document.getElementById("feedback");
  var guessesEl = document.getElementById("guesses");
  var bestEl = document.getElementById("best");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");

  var MIN = 1, MAX = 100;
  var target, guesses, over, low, high;

  function refreshHud() {
    guessesEl.textContent = guesses;
    var best = window.ArcadeCommon.getBest(GAME_ID);
    bestEl.textContent = best === null ? "-" : best;
  }

  function newGame() {
    target = window.ArcadeCommon.randInt(MIN, MAX);
    guesses = 0;
    over = false;
    low = MIN;
    high = MAX;
    feedbackEl.textContent = "";
    resultBanner.innerHTML = "";
    promptEl.textContent = "I'm thinking of a number between " + MIN + " and " + MAX + ".";
    inputEl.value = "";
    inputEl.disabled = false;
    guessBtn.disabled = false;
    inputEl.min = MIN;
    inputEl.max = MAX;
    refreshHud();
    inputEl.focus();
  }

  function submitGuess() {
    if (over) return;
    var val = parseInt(inputEl.value, 10);
    if (isNaN(val) || val < MIN || val > MAX) {
      window.ArcadeCommon.toast("Enter a number between " + MIN + " and " + MAX);
      return;
    }
    guesses++;
    refreshHud();
    if (val === target) {
      over = true;
      var improved = window.ArcadeCommon.setBestLowerIsBetter(GAME_ID, guesses);
      feedbackEl.textContent = "🎯 Exactly right!";
      resultBanner.innerHTML = '<span class="overlay-win">' + window.ArcadeI18n.t("common.youWin") +
        " — " + guesses + " " + window.ArcadeI18n.t("common.moves") + (improved ? " 🏆" : "") + "</span>";
      inputEl.disabled = true;
      guessBtn.disabled = true;
      refreshHud();
    } else if (val < target) {
      if (val > low) low = val;
      feedbackEl.textContent = "⬆️ Higher than " + val;
    } else {
      if (val < high) high = val;
      feedbackEl.textContent = "⬇️ Lower than " + val;
    }
    inputEl.value = "";
    inputEl.focus();
  }

  guessBtn.addEventListener("click", submitGuess);
  inputEl.addEventListener("keydown", function (e) {
    if (e.key === "Enter") submitGuess();
  });
  restartBtn.addEventListener("click", newGame);

  newGame();
})();
