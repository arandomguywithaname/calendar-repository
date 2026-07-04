(function () {
  var GAME_ID = "lights-out";
  var boardEl = document.getElementById("board");
  var movesEl = document.getElementById("moves");
  var bestEl = document.getElementById("best");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");

  var SIZE = 5;
  var board, moves, over;

  function idx(r, c) { return r * SIZE + c; }

  function refreshHud() {
    movesEl.textContent = moves;
    var best = window.ArcadeCommon.getBest(GAME_ID);
    bestEl.textContent = best === null ? "-" : best;
  }

  function toggleAt(board, r, c) {
    var deltas = [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]];
    deltas.forEach(function (d) {
      var rr = r + d[0], cc = c + d[1];
      if (rr >= 0 && rr < SIZE && cc >= 0 && cc < SIZE) {
        board[idx(rr, cc)] = !board[idx(rr, cc)];
      }
    });
  }

  function isSolved() {
    return board.every(function (v) { return !v; });
  }

  function newGame() {
    board = new Array(SIZE * SIZE).fill(false);
    var scrambleMoves = window.ArcadeCommon.randInt(15, 24);
    for (var i = 0; i < scrambleMoves; i++) {
      var r = window.ArcadeCommon.randInt(0, SIZE - 1);
      var c = window.ArcadeCommon.randInt(0, SIZE - 1);
      toggleAt(board, r, c);
    }
    if (isSolved()) {
      toggleAt(board, window.ArcadeCommon.randInt(0, SIZE - 1), window.ArcadeCommon.randInt(0, SIZE - 1));
    }
    moves = 0;
    over = false;
    resultBanner.innerHTML = "";
    refreshHud();
    render();
  }

  function render() {
    boardEl.innerHTML = "";
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        (function (r, c) {
          var cell = document.createElement("div");
          cell.className = "cell" + (board[idx(r, c)] ? " lit" : "");
          cell.textContent = board[idx(r, c)] ? "💡" : "";
          cell.addEventListener("click", function () { handleClick(r, c); });
          boardEl.appendChild(cell);
        })(r, c);
      }
    }
  }

  function handleClick(r, c) {
    if (over) return;
    toggleAt(board, r, c);
    moves++;
    refreshHud();
    render();
    if (isSolved()) {
      over = true;
      var improved = window.ArcadeCommon.setBestLowerIsBetter(GAME_ID, moves);
      resultBanner.innerHTML = '<span class="overlay-win">' + window.ArcadeI18n.t("common.youWin") +
        " — " + moves + " " + window.ArcadeI18n.t("common.moves") + (improved ? " 🏆" : "") + "</span>";
      refreshHud();
    }
  }

  restartBtn.addEventListener("click", newGame);
  newGame();
})();
