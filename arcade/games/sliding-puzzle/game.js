(function () {
  var GAME_ID = "sliding-puzzle";
  var boardEl = document.getElementById("board");
  var movesEl = document.getElementById("moves");
  var bestEl = document.getElementById("best");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");

  var SIZE = 4;
  var tiles, moves, over, blankIndex;

  function refreshHud() {
    movesEl.textContent = moves;
    var best = window.ArcadeCommon.getBest(GAME_ID);
    bestEl.textContent = best === null ? "-" : best;
  }

  function newGame() {
    tiles = [];
    for (var i = 1; i < SIZE * SIZE; i++) tiles.push(i);
    tiles.push(0);
    blankIndex = tiles.length - 1;
    moves = 0;
    over = false;
    resultBanner.innerHTML = "";
    shuffleBoard();
    refreshHud();
    render();
  }

  function shuffleBoard() {
    var shuffleMoves = 200;
    var lastBlank = -1;
    for (var i = 0; i < shuffleMoves; i++) {
      var neighbors = getNeighborIndexes(blankIndex).filter(function (n) { return n !== lastBlank; });
      var target = window.ArcadeCommon.pick(neighbors);
      lastBlank = blankIndex;
      swap(target, blankIndex);
      blankIndex = target;
    }
  }

  function getNeighborIndexes(idx) {
    var row = Math.floor(idx / SIZE), col = idx % SIZE;
    var result = [];
    if (row > 0) result.push(idx - SIZE);
    if (row < SIZE - 1) result.push(idx + SIZE);
    if (col > 0) result.push(idx - 1);
    if (col < SIZE - 1) result.push(idx + 1);
    return result;
  }

  function swap(i, j) {
    var tmp = tiles[i];
    tiles[i] = tiles[j];
    tiles[j] = tmp;
  }

  function render() {
    boardEl.innerHTML = "";
    boardEl.style.gridTemplateColumns = "repeat(" + SIZE + ", 70px)";
    tiles.forEach(function (val, idx) {
      var cell = document.createElement("div");
      cell.className = "cell" + (val === 0 ? " blank" : "");
      cell.textContent = val === 0 ? "" : val;
      if (val !== 0) {
        cell.addEventListener("click", function () { tryMove(idx); });
      }
      boardEl.appendChild(cell);
    });
  }

  function tryMove(idx) {
    if (over) return;
    var neighbors = getNeighborIndexes(blankIndex);
    if (neighbors.indexOf(idx) === -1) return;
    swap(idx, blankIndex);
    blankIndex = idx;
    moves++;
    refreshHud();
    render();
    checkWin();
  }

  function checkWin() {
    for (var i = 0; i < tiles.length - 1; i++) {
      if (tiles[i] !== i + 1) return;
    }
    if (tiles[tiles.length - 1] !== 0) return;
    over = true;
    var improved = window.ArcadeCommon.setBestLowerIsBetter(GAME_ID, moves);
    resultBanner.innerHTML = '<span class="overlay-win">' + window.ArcadeI18n.t("common.youWin") +
      " — " + moves + " " + window.ArcadeI18n.t("common.moves") + (improved ? " 🏆" : "") + "</span>";
    refreshHud();
  }

  restartBtn.addEventListener("click", newGame);
  newGame();
})();
