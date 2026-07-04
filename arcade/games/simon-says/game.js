(function () {
  var GAME_ID = "simon-says";
  var levelEl = document.getElementById("level");
  var bestEl = document.getElementById("best");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");
  var quads = [
    document.getElementById("q0"),
    document.getElementById("q1"),
    document.getElementById("q2"),
    document.getElementById("q3")
  ];

  var sequence, playerStep, level, over, accepting, showTimer;

  function refreshHud() {
    levelEl.textContent = level;
    bestEl.textContent = window.ArcadeCommon.getBest(GAME_ID) || 0;
  }

  function newGame() {
    sequence = [];
    playerStep = 0;
    level = 0;
    over = false;
    accepting = false;
    resultBanner.innerHTML = "";
    refreshHud();
    quads.forEach(function (q) { q.disabled = false; });
    setTimeout(nextRound, 500);
  }

  function nextRound() {
    sequence.push(window.ArcadeCommon.randInt(0, 3));
    playerStep = 0;
    level = sequence.length - 1;
    refreshHud();
    accepting = false;
    quads.forEach(function (q) { q.disabled = true; });
    playSequence(0);
  }

  function playSequence(i) {
    if (i >= sequence.length) {
      accepting = true;
      quads.forEach(function (q) { q.disabled = false; });
      return;
    }
    var idx = sequence[i];
    quads[idx].classList.add("lit");
    showTimer = setTimeout(function () {
      quads[idx].classList.remove("lit");
      setTimeout(function () { playSequence(i + 1); }, 200);
    }, 420);
  }

  function handleClick(idx) {
    if (!accepting || over) return;
    quads[idx].classList.add("lit");
    setTimeout(function () { quads[idx].classList.remove("lit"); }, 200);

    if (idx === sequence[playerStep]) {
      playerStep++;
      if (playerStep === sequence.length) {
        accepting = false;
        setTimeout(nextRound, 700);
      }
    } else {
      endGame();
    }
  }

  function endGame() {
    over = true;
    accepting = false;
    quads.forEach(function (q) { q.disabled = true; });
    var finalScore = sequence.length - 1;
    window.ArcadeCommon.setBest(GAME_ID, finalScore);
    resultBanner.innerHTML = '<span class="overlay-lose">' + window.ArcadeI18n.t("common.gameOver") + " — " + window.ArcadeI18n.t("common.level") + " " + finalScore + "</span>";
    refreshHud();
  }

  quads.forEach(function (q, i) {
    q.addEventListener("click", function () { handleClick(i); });
  });

  restartBtn.addEventListener("click", newGame);
  newGame();
})();
