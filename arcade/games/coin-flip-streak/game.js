(function () {
  var GAME_ID = "coin-flip-streak";
  var coinEl = document.getElementById("coin");
  var statusLine = document.getElementById("status-line");
  var scoreEl = document.getElementById("score");
  var bestEl = document.getElementById("best");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");
  var headsBtn = document.getElementById("heads-btn");
  var tailsBtn = document.getElementById("tails-btn");

  var streak = 0;
  var flipping = false;
  var rotation = 0;

  function refreshHud() {
    scoreEl.textContent = streak;
    var best = window.ArcadeCommon.getBest(GAME_ID);
    bestEl.textContent = best === null ? 0 : best;
  }

  function setButtonsEnabled(enabled) {
    headsBtn.disabled = !enabled;
    tailsBtn.disabled = !enabled;
  }

  function flip(guess) {
    if (flipping) return;
    flipping = true;
    setButtonsEnabled(false);
    resultBanner.innerHTML = "";
    statusLine.textContent = "Flipping...";

    rotation += 720 + window.ArcadeCommon.randInt(0, 3) * 360;
    coinEl.style.transform = "rotateY(" + rotation + "deg)";

    setTimeout(function () {
      var outcome = window.ArcadeCommon.pick(["heads", "tails"]);
      coinEl.textContent = outcome === "heads" ? "🙂" : "🌟";
      if (outcome === guess) {
        streak++;
        var improved = window.ArcadeCommon.setBest(GAME_ID, streak);
        statusLine.textContent = "It's " + outcome + "! Streak continues.";
        resultBanner.innerHTML = '<span class="overlay-win">' + window.ArcadeI18n.t("common.correct") + (improved ? " 🏆 New best!" : "") + "</span>";
      } else {
        statusLine.textContent = "It's " + outcome + ". Streak broken.";
        resultBanner.innerHTML = '<span class="overlay-lose">' + window.ArcadeI18n.t("common.wrong") + "</span>";
        streak = 0;
      }
      refreshHud();
      flipping = false;
      setButtonsEnabled(true);
    }, 550);
  }

  headsBtn.addEventListener("click", function () { flip("heads"); });
  tailsBtn.addEventListener("click", function () { flip("tails"); });

  restartBtn.addEventListener("click", function () {
    streak = 0;
    coinEl.textContent = "🪙";
    statusLine.textContent = "Pick heads or tails to start.";
    resultBanner.innerHTML = "";
    refreshHud();
  });

  refreshHud();
})();
