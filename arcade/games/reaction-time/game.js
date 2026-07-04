(function () {
  var GAME_ID = "reaction-time";
  var zone = document.getElementById("zone");
  var scoreEl = document.getElementById("score");
  var bestEl = document.getElementById("best");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");

  var state = "idle"; // idle, waiting, ready, tooSoon, result
  var waitTimer = null;
  var goTime = 0;

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
    var delay = window.ArcadeCommon.randInt(1000, 4000);
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
      zone.textContent = "Click to try again";
      scoreEl.textContent = reaction;
      var improved = window.ArcadeCommon.setBestLowerIsBetter(GAME_ID, reaction);
      refreshHud();
      resultBanner.innerHTML = '<span class="overlay-win">' + reaction + " ms" + (improved ? " — new best! 🏆" : "") + "</span>";
    }
  }

  zone.addEventListener("click", handleClick);
  restartBtn.addEventListener("click", reset);

  refreshHud();
})();
