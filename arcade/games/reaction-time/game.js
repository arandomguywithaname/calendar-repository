(function () {
  var GAME_ID = "reaction-time";
  var zone = document.getElementById("zone");
  var scoreEl = document.getElementById("score");
  var bestEl = document.getElementById("best");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");
  var diffEl = document.getElementById("difficulty");

  var state = "idle"; // idle, waiting, ready, tooSoon, result
  var waitTimer = null;
  var goTime = 0;

  // Per-difficulty tuning. minWait/maxWait bound the random delay before green,
  // zoneH sizes the click area, threshold (hard) is the ms limit to "count".
  var DIFFICULTIES = {
    easy: { minWait: 1500, maxWait: 5000, zoneH: 340, threshold: null },
    medium: { minWait: 1000, maxWait: 4000, zoneH: 260, threshold: null },
    hard: { minWait: 500, maxWait: 2400, zoneH: 200, threshold: 400 }
  };
  var cfg = DIFFICULTIES.medium;

  function refreshHud() {
    var best = window.ArcadeCommon.getBest(GAME_ID);
    bestEl.textContent = best === null ? "-" : best;
  }

  function reset() {
    clearTimeout(waitTimer);
    state = "idle";
    zone.className = "";
    zone.textContent = "Click to start";
    resultBanner.innerHTML = "";
  }

  function startWaiting() {
    state = "waiting";
    zone.className = "wait";
    zone.textContent = "Wait...";
    resultBanner.innerHTML = "";
    var delay = window.ArcadeCommon.randInt(cfg.minWait, cfg.maxWait);
    waitTimer = setTimeout(function () {
      state = "ready";
      goTime = performance.now();
      zone.className = "go";
      zone.textContent = "Click now!";
    }, delay);
  }

  function handleClick() {
    if (state === "idle" || state === "tooSoon" || state === "result") {
      startWaiting();
    } else if (state === "waiting") {
      clearTimeout(waitTimer);
      state = "tooSoon";
      zone.className = "";
      zone.textContent = "Too soon! Click to try again.";
    } else if (state === "ready") {
      var reaction = Math.round(performance.now() - goTime);
      state = "result";
      zone.className = "";
      scoreEl.textContent = reaction;
      if (cfg.threshold !== null && reaction > cfg.threshold) {
        // Hard mode: too slow to be recorded.
        zone.textContent = "Too slow! Click to try again.";
        resultBanner.innerHTML = '<span class="overlay-lose">' + reaction + " ms — too slow to count (under " + cfg.threshold + " ms)</span>";
      } else {
        zone.textContent = "Click to try again";
        var improved = window.ArcadeCommon.setBestLowerIsBetter(GAME_ID, reaction);
        refreshHud();
        resultBanner.innerHTML = '<span class="overlay-win">' + reaction + " ms" + (improved ? " — new best! 🏆" : "") + "</span>";
      }
    }
  }

  zone.addEventListener("click", handleClick);
  restartBtn.addEventListener("click", reset);

  // Difficulty selector - resizes the click area and re-tunes wait timing.
  window.ArcadeCommon.mountDifficulty(diffEl, GAME_ID, {
    defaultKey: "medium",
    onChange: function (level) {
      cfg = DIFFICULTIES[level] || DIFFICULTIES.medium;
      zone.style.height = cfg.zoneH + "px";
      reset();
    }
  });

  refreshHud();
})();
