(function () {
  var GAME_ID = "pattern-memory";
  var boardEl = document.getElementById("board");
  var scoreEl = document.getElementById("score");
  var bestEl = document.getElementById("best");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");
  var diffEl = document.getElementById("difficulty");

  var SIZE = 16;
  var round, score, target, clicked, phase; // phase: "showing" | "input" | "over"

  // Per-difficulty tuning. "startBonus" adds cells to the round-1 pattern,
  // "reveal" is how long (ms) the pattern stays lit before recall.
  var DIFFICULTIES = {
    easy: { startBonus: 1, reveal: 2200 },
    medium: { startBonus: 2, reveal: 1500 },
    hard: { startBonus: 3, reveal: 800 }
  };
  var cfg = DIFFICULTIES.medium;

  function refreshHud() {
    scoreEl.textContent = score;
    bestEl.textContent = window.ArcadeCommon.getBest(GAME_ID) || 0;
  }

  function newGame() {
    round = 1;
    score = 0;
    resultBanner.innerHTML = "";
    refreshHud();
    startRound();
  }

  function pickTarget(count) {
    var indices = [];
    for (var i = 0; i < SIZE; i++) indices.push(i);
    indices = window.ArcadeCommon.shuffle(indices);
    return indices.slice(0, Math.min(count, SIZE));
  }

  function startRound() {
    var count = Math.min(round + cfg.startBonus, SIZE);
    target = pickTarget(count);
    clicked = [];
    phase = "showing";
    render();
    setTimeout(function () {
      phase = "input";
      render();
    }, cfg.reveal);
  }

  function render() {
    boardEl.innerHTML = "";
    for (var i = 0; i < SIZE; i++) {
      (function (idx) {
        var cell = document.createElement("div");
        cell.className = "cell";
        cell.style.height = "70px";
        cell.style.transition = "background 0.12s ease, box-shadow 0.2s ease, transform 0.08s ease";
        var isTarget = target.indexOf(idx) !== -1;
        var isClicked = clicked.indexOf(idx) !== -1;
        if (phase === "showing" && isTarget) {
          cell.style.background = "var(--accent-2)";
          cell.style.boxShadow = "0 0 18px var(--accent-2), inset 0 0 10px rgba(255,255,255,0.35)";
        } else if (isClicked) {
          cell.style.background = "var(--good)";
          cell.style.boxShadow = "0 0 18px var(--good), inset 0 0 10px rgba(255,255,255,0.3)";
        }
        if (phase !== "input") cell.classList.add("disabled");
        cell.addEventListener("click", function () { handleClick(idx); });
        boardEl.appendChild(cell);
      })(i);
    }
  }

  function handleClick(idx) {
    if (phase !== "input") return;
    if (clicked.indexOf(idx) !== -1) return;
    if (target.indexOf(idx) === -1) {
      endGame();
      return;
    }
    clicked.push(idx);
    render();
    if (clicked.length === target.length) {
      score = round;
      round++;
      refreshHud();
      phase = "over-round";
      window.ArcadeCommon.toast("Round " + score + " clear!");
      setTimeout(startRound, 700);
    }
  }

  function endGame() {
    phase = "over";
    // reveal the full target pattern
    render();
    for (var i = 0; i < SIZE; i++) {
      var isTarget = target.indexOf(i) !== -1;
      if (isTarget) {
        boardEl.children[i].style.background = "var(--danger)";
        boardEl.children[i].style.boxShadow = "0 0 18px var(--danger)";
      }
    }
    var improved = window.ArcadeCommon.setBest(GAME_ID, score);
    resultBanner.innerHTML = '<span class="overlay-lose">' + window.ArcadeI18n.t("common.gameOver") +
      " — " + window.ArcadeI18n.t("common.score") + ": " + score + (improved ? " 🏆" : "") + "</span>";
    refreshHud();
  }

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
