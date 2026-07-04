(function () {
  var GAME_ID = "color-slider";
  var boardEl = document.getElementById("board");
  var targetEl = document.getElementById("target");
  var movesEl = document.getElementById("moves");
  var bestEl = document.getElementById("best");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");

  var COLORS = ["#ff5d5d", "#4d9fff", "#3ddc84", "#ffb84d"];
  var SIZE = 16;

  var board, target, moves, over;

  function refreshHud() {
    movesEl.textContent = moves;
    var best = window.ArcadeCommon.getBest(GAME_ID);
    bestEl.textContent = best === null ? "-" : best;
  }

  function randomGrid() {
    var g = [];
    for (var i = 0; i < SIZE; i++) g.push(window.ArcadeCommon.randInt(0, COLORS.length - 1));
    return g;
  }

  function sameGrid(a, b) {
    for (var i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  function newGame() {
    target = randomGrid();
    do {
      board = randomGrid();
    } while (sameGrid(board, target));
    moves = 0;
    over = false;
    resultBanner.innerHTML = "";
    refreshHud();
    render();
  }

  function render() {
    boardEl.innerHTML = "";
    board.forEach(function (val, i) {
      var cell = document.createElement("div");
      cell.className = "cell" + (over ? " disabled" : "");
      cell.style.background = COLORS[val];
      cell.addEventListener("click", function () { handleClick(i); });
      boardEl.appendChild(cell);
    });

    targetEl.innerHTML = "";
    target.forEach(function (val) {
      var cell = document.createElement("div");
      cell.className = "cell";
      cell.style.background = COLORS[val];
      targetEl.appendChild(cell);
    });
  }

  function handleClick(i) {
    if (over) return;
    board[i] = (board[i] + 1) % COLORS.length;
    moves++;
    refreshHud();
    render();
    if (sameGrid(board, target)) finish();
  }

  function finish() {
    over = true;
    var improved = window.ArcadeCommon.setBestLowerIsBetter(GAME_ID, moves);
    resultBanner.innerHTML = '<span class="overlay-win">' + window.ArcadeI18n.t("common.youWin") +
      " — " + moves + " " + window.ArcadeI18n.t("common.moves") + (improved ? " 🏆" : "") + "</span>";
    refreshHud();
    render();
  }

  restartBtn.addEventListener("click", newGame);
  newGame();
})();
