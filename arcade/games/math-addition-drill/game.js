(function () {
  var GAME_ID = "math-addition-drill";
  var problemEl = document.getElementById("problem");
  var answerEl = document.getElementById("answer");
  var submitBtn = document.getElementById("submit");
  var timeEl = document.getElementById("time");
  var scoreEl = document.getElementById("score");
  var bestEl = document.getElementById("best");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");

  var DURATION = 60;
  var timeLeft, score, correctAnswer, running, timer;

  function refreshHud() {
    timeEl.textContent = timeLeft;
    scoreEl.textContent = score;
    var best = window.ArcadeCommon.getBest(GAME_ID);
    bestEl.textContent = best === null ? "-" : best;
  }

  function digitsForLevel() {
    // difficulty ramps up with score: start with small numbers, grow.
    if (score < 5) return 1;
    if (score < 12) return 2;
    return 3;
  }

  function maxForDigits(d) {
    return Math.pow(10, d) - 1;
  }

  function nextProblem() {
    var d = digitsForLevel();
    var max = maxForDigits(d);
    var min = d === 1 ? 0 : Math.pow(10, d - 1);
    var a = window.ArcadeCommon.randInt(min, max);
    var b = window.ArcadeCommon.randInt(min, max);
    correctAnswer = a + b;
    problemEl.textContent = a + " + " + b + " = ?";
    answerEl.value = "";
    answerEl.focus();
  }

  function startGame() {
    score = 0;
    timeLeft = DURATION;
    running = true;
    resultBanner.innerHTML = "";
    answerEl.disabled = false;
    submitBtn.disabled = false;
    restartBtn.textContent = window.ArcadeI18n.t("common.restart");
    refreshHud();
    nextProblem();
    clearInterval(timer);
    timer = setInterval(tick, 1000);
  }

  function tick() {
    timeLeft--;
    refreshHud();
    if (timeLeft <= 0) endGame();
  }

  function endGame() {
    running = false;
    clearInterval(timer);
    answerEl.disabled = true;
    submitBtn.disabled = true;
    var improved = window.ArcadeCommon.setBest(GAME_ID, score);
    problemEl.textContent = "Time's up!";
    resultBanner.innerHTML = '<span class="overlay-win">' + window.ArcadeI18n.t("common.gameOver") +
      " — " + window.ArcadeI18n.t("common.score") + ": " + score + (improved ? " 🏆" : "") + "</span>";
    refreshHud();
  }

  function submitAnswer() {
    if (!running) return;
    var val = parseInt(answerEl.value, 10);
    if (isNaN(val)) return;
    if (val === correctAnswer) {
      score++;
      window.ArcadeCommon.toast(window.ArcadeI18n.t("common.correct"));
    } else {
      window.ArcadeCommon.toast(window.ArcadeI18n.t("common.wrong") + " " + correctAnswer);
    }
    refreshHud();
    nextProblem();
  }

  submitBtn.addEventListener("click", submitAnswer);
  answerEl.addEventListener("keydown", function (e) {
    if (e.key === "Enter") submitAnswer();
  });
  restartBtn.addEventListener("click", startGame);

  refreshHud();
})();
