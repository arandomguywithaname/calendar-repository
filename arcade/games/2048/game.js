(function () {
  var GAME_ID = "2048";
  var boardEl = document.getElementById("board");
  var scoreEl = document.getElementById("score");
  var bestEl = document.getElementById("best");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");
  var SIZE = 4;
  var grid, score, over, won;

  var TILE_COLORS = {
    0: "#242a45", 2: "#3a4166", 4: "#4a5286", 8: "#7c5cff", 16: "#8f5eff",
    32: "#ff5da2", 64: "#ff3d8f", 128: "#ffb84d", 256: "#ffaa2e", 512: "#29e0c9",
    1024: "#20c4b0", 2048: "#3ddc84"
  };

  function refreshHud() {
    scoreEl.textContent = score;
    bestEl.textContent = window.ArcadeCommon.getBest(GAME_ID) || 0;
  }

  function emptyGrid() {
    var g = [];
    for (var r = 0; r < SIZE; r++) g.push(new Array(SIZE).fill(0));
    return g;
  }

  function addRandomTile() {
    var empties = [];
    for (var r = 0; r < SIZE; r++)
      for (var c = 0; c < SIZE; c++)
        if (grid[r][c] === 0) empties.push([r, c]);
    if (!empties.length) return;
    var pick = empties[Math.floor(Math.random() * empties.length)];
    grid[pick[0]][pick[1]] = Math.random() < 0.9 ? 2 : 4;
  }

  function newGame() {
    grid = emptyGrid();
    score = 0;
    over = false;
    won = false;
    resultBanner.innerHTML = "";
    addRandomTile();
    addRandomTile();
    refreshHud();
    render();
  }

  function render() {
    boardEl.innerHTML = "";
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        var v = grid[r][c];
        var cell = document.createElement("div");
        cell.className = "cell";
        cell.textContent = v === 0 ? "" : v;
        cell.style.background = TILE_COLORS[v] || "#3ddc84";
        cell.style.color = v <= 4 ? "var(--text-dim)" : "white";
        boardEl.appendChild(cell);
      }
    }
  }

  function slideRow(row) {
    var vals = row.filter(function (v) { return v !== 0; });
    var scoreGain = 0;
    for (var i = 0; i < vals.length - 1; i++) {
      if (vals[i] === vals[i + 1]) {
        vals[i] *= 2;
        scoreGain += vals[i];
        vals.splice(i + 1, 1);
      }
    }
    while (vals.length < SIZE) vals.push(0);
    return { row: vals, scoreGain: scoreGain };
  }

  function rotateGrid(g) {
    var res = emptyGrid();
    for (var r = 0; r < SIZE; r++)
      for (var c = 0; c < SIZE; c++)
        res[c][SIZE - 1 - r] = g[r][c];
    return res;
  }

  function move(dir) {
    if (over) return;
    var rotations = { left: 0, up: 3, right: 2, down: 1 }[dir];
    var g = grid;
    for (var i = 0; i < rotations; i++) g = rotateGrid(g);

    var moved = false;
    var totalGain = 0;
    var newG = [];
    for (var r = 0; r < SIZE; r++) {
      var result = slideRow(g[r]);
      newG.push(result.row);
      totalGain += result.scoreGain;
      for (var c = 0; c < SIZE; c++) if (result.row[c] !== g[r][c]) moved = true;
    }
    g = newG;
    for (i = 0; i < (4 - rotations) % 4; i++) g = rotateGrid(g);

    if (moved) {
      grid = g;
      score += totalGain;
      addRandomTile();
      refreshHud();
      render();
      checkGameState();
    }
  }

  function checkGameState() {
    for (var r = 0; r < SIZE; r++)
      for (var c = 0; c < SIZE; c++) {
        if (grid[r][c] === 2048 && !won) {
          won = true;
          resultBanner.innerHTML = '<span class="overlay-win">' + window.ArcadeI18n.t("common.youWin") + "</span>";
        }
        if (grid[r][c] === 0) return;
      }
    for (var r2 = 0; r2 < SIZE; r2++)
      for (var c2 = 0; c2 < SIZE - 1; c2++)
        if (grid[r2][c2] === grid[r2][c2 + 1]) return;
    for (var c3 = 0; c3 < SIZE; c3++)
      for (var r3 = 0; r3 < SIZE - 1; r3++)
        if (grid[r3][c3] === grid[r3 + 1][c3]) return;
    over = true;
    window.ArcadeCommon.setBest(GAME_ID, score);
    resultBanner.innerHTML = '<span class="overlay-lose">' + window.ArcadeI18n.t("common.gameOver") + "</span>";
  }

  document.addEventListener("keydown", function (e) {
    var map = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };
    if (map[e.key]) { e.preventDefault(); move(map[e.key]); }
  });

  document.getElementById("touch-controls").addEventListener("click", function (e) {
    var btn = e.target.closest("[data-dir]");
    if (btn) move(btn.getAttribute("data-dir"));
  });

  var touchStart = null;
  document.querySelector(".game-stage").addEventListener("touchstart", function (e) {
    touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  });
  document.querySelector(".game-stage").addEventListener("touchend", function (e) {
    if (!touchStart) return;
    var dx = e.changedTouches[0].clientX - touchStart.x;
    var dy = e.changedTouches[0].clientY - touchStart.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) > 30) {
      if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? "right" : "left");
      else move(dy > 0 ? "down" : "up");
    }
    touchStart = null;
  });

  restartBtn.addEventListener("click", newGame);
  newGame();
})();
