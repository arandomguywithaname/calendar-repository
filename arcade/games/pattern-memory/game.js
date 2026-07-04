(function () {
  var GAME_ID = "pattern-memory";
  var boardEl = document.getElementById("board");
  var scoreEl = document.getElementById("score");
  var bestEl = document.getElementById("best");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");

  var SIZE = 16;
  var round, score, target, clicked, phase; // phase: "showing" | "input" | "over"

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
    var count = Math.min(round + 2, SIZE);
    target = pickTarget(count);
    clicked = [];
    phase = "showing";
    render();
    setTimeout(function () {
      phase = "input";
      render();
    }, 1500);
  }

  function render() {
    boardEl.innerHTML = "";
    for (var i = 0; i < SIZE; i++) {
      (function (idx) {
        var cell = document.createElement("div");
        cell.className = "cell";
        cell.style.height = "70px";
        var isTarget = target.indexOf(idx) !== -1;
        var isClicked = clicked.indexOf(idx) !== -1;
        if (phase === "showing" && isTarget) {
          cell.style.background = "var(--accent-2)";
        } else if (isClicked) {
          cell.style.background = "var(--good)";
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
      if (isTarget) boardEl.children[i].style.background = "var(--danger)";
    }
    var improved = window.ArcadeCommon.setBest(GAME_ID, score);
    resultBanner.innerHTML = '<span class="overlay-lose">' + window.ArcadeI18n.t("common.gameOver") +
      " — " + window.ArcadeI18n.t("common.score") + ": " + score + (improved ? " 🏆" : "") + "</span>";
    refreshHud();
  }

  restartBtn.addEventListener("click", newGame);
  newGame();
})();
