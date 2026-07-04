(function () {
  var GAME_ID = "rock-paper-scissors";
  var playerChoiceEl = document.getElementById("player-choice");
  var cpuChoiceEl = document.getElementById("cpu-choice");
  var streakLine = document.getElementById("streak-line");
  var winsEl = document.getElementById("wins");
  var lossesEl = document.getElementById("losses");
  var tiesEl = document.getElementById("ties");
  var bestEl = document.getElementById("best");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");
  var choiceBtns = document.querySelectorAll(".choice-btn");

  var ICONS = { rock: "🪨", paper: "📄", scissors: "✂️" };
  var BEATS = { rock: "scissors", paper: "rock", scissors: "paper" };

  var stats = { wins: 0, losses: 0, ties: 0, streak: 0 };

  function loadStats() {
    try { stats = JSON.parse(localStorage.getItem("arcade.stats." + GAME_ID)) || stats; } catch (e) {}
  }
  function saveStats() {
    try { localStorage.setItem("arcade.stats." + GAME_ID, JSON.stringify(stats)); } catch (e) {}
  }

  function refreshHud() {
    winsEl.textContent = stats.wins;
    lossesEl.textContent = stats.losses;
    tiesEl.textContent = stats.ties;
    var best = window.ArcadeCommon.getBest(GAME_ID);
    bestEl.textContent = best === null ? 0 : best;
    streakLine.textContent = "Current streak: " + stats.streak;
  }

  function play(choice) {
    var cpu = window.ArcadeCommon.pick(Object.keys(ICONS));
    playerChoiceEl.textContent = ICONS[choice];
    cpuChoiceEl.textContent = ICONS[cpu];

    var result;
    if (choice === cpu) {
      result = "tie";
      stats.ties++;
      stats.streak = 0;
      resultBanner.innerHTML = '<span class="overlay-win">' + window.ArcadeI18n.t("common.tie") + "</span>";
    } else if (BEATS[choice] === cpu) {
      result = "win";
      stats.wins++;
      stats.streak++;
      var improved = window.ArcadeCommon.setBest(GAME_ID, stats.streak);
      resultBanner.innerHTML = '<span class="overlay-win">' + window.ArcadeI18n.t("common.youWin") + (improved ? " 🏆" : "") + "</span>";
    } else {
      result = "lose";
      stats.losses++;
      stats.streak = 0;
      resultBanner.innerHTML = '<span class="overlay-lose">' + window.ArcadeI18n.t("common.youLose") + "</span>";
    }
    saveStats();
    refreshHud();
  }

  choiceBtns.forEach(function (btn) {
    btn.addEventListener("click", function () { play(btn.getAttribute("data-choice")); });
  });

  restartBtn.addEventListener("click", function () {
    stats = { wins: 0, losses: 0, ties: 0, streak: 0 };
    saveStats();
    playerChoiceEl.textContent = "❔";
    cpuChoiceEl.textContent = "❔";
    resultBanner.innerHTML = "";
    refreshHud();
  });

  loadStats();
  refreshHud();
})();
