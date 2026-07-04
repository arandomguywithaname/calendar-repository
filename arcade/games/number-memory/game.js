(function () {
  var GAME_ID = "number-memory";
  var displayEl = document.getElementById("number-display");
  var form = document.getElementById("answer-form");
  var input = document.getElementById("answer-input");
  var scoreEl = document.getElementById("score");
  var bestEl = document.getElementById("best");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");

  var length, score, current, showTimer, over;

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
    length = 4;
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
    displayEl.style.color = "";
    var showTime = 1500 + length * 250;
    showTimer = setTimeout(function () {
      displayEl.textContent = "? ? ? ?";
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
      displayEl.textContent = "Nice! Get ready...";
      setTimeout(startRound, 900);
    } else {
      over = true;
      clearTimeout(showTimer);
      var improved = window.ArcadeCommon.setBest(GAME_ID, score);
      displayEl.style.color = "var(--danger)";
      displayEl.textContent = "It was " + current;
      form.style.display = "none";
      resultBanner.innerHTML = '<span class="overlay-lose">' + window.ArcadeI18n.t("common.gameOver") +
        " — " + window.ArcadeI18n.t("common.score") + ": " + score + (improved ? " 🏆" : "") + "</span>";
      refreshHud();
    }
  }

  form.addEventListener("submit", submitAnswer);
  restartBtn.addEventListener("click", newGame);
  newGame();
})();
