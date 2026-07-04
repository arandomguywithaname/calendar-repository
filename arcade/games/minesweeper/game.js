(function () {
  var GAME_ID = "minesweeper";
  var boardEl = document.getElementById("board");
  var minesEl = document.getElementById("mines");
  var timeEl = document.getElementById("time");
  var bestEl = document.getElementById("best");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");
  var flagModeBtn = document.getElementById("flag-mode");

  var SIZE = 9, MINES = 10;
  var grid, revealedCount, flagCount, over, won, flagMode, timer, seconds, firstClick;

  function refreshHud() {
    minesEl.textContent = Math.max(0, MINES - flagCount);
    timeEl.textContent = seconds;
    var best = window.ArcadeCommon.getBest(GAME_ID);
    bestEl.textContent = best === null ? "-" : best;
  }

  function newGame() {
    grid = [];
    for (var r = 0; r < SIZE; r++) {
      var row = [];
      for (var c = 0; c < SIZE; c++) {
        row.push({ mine: false, revealed: false, flagged: false, count: 0 });
      }
      grid.push(row);
    }
    revealedCount = 0;
    flagCount = 0;
    over = false;
    won = false;
    firstClick = true;
    flagMode = false;
    flagModeBtn.textContent = "🚩 Flag Mode: Off";
    flagModeBtn.classList.remove("active");
    seconds = 0;
    clearInterval(timer);
    resultBanner.innerHTML = "";
    refreshHud();
    render();
  }

  function placeMines(excludeR, excludeC) {
    var placed = 0;
    while (placed < MINES) {
      var r = window.ArcadeCommon.randInt(0, SIZE - 1);
      var c = window.ArcadeCommon.randInt(0, SIZE - 1);
      if (grid[r][c].mine) continue;
      if (Math.abs(r - excludeR) <= 1 && Math.abs(c - excludeC) <= 1) continue;
      grid[r][c].mine = true;
      placed++;
    }
    for (var r2 = 0; r2 < SIZE; r2++) {
      for (var c2 = 0; c2 < SIZE; c2++) {
        grid[r2][c2].count = countAdjacentMines(r2, c2);
      }
    }
  }

  function countAdjacentMines(r, c) {
    var count = 0;
    forEachNeighbor(r, c, function (nr, nc) { if (grid[nr][nc].mine) count++; });
    return count;
  }

  function forEachNeighbor(r, c, fn) {
    for (var dr = -1; dr <= 1; dr++) {
      for (var dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        var nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE) fn(nr, nc);
      }
    }
  }

  function reveal(r, c) {
    var cell = grid[r][c];
    if (cell.revealed || cell.flagged) return;
    cell.revealed = true;
    revealedCount++;
    if (cell.count === 0 && !cell.mine) {
      forEachNeighbor(r, c, function (nr, nc) { reveal(nr, nc); });
    }
  }

  function render() {
    boardEl.innerHTML = "";
    boardEl.style.gridTemplateColumns = "repeat(" + SIZE + ", 38px)";
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        (function (r, c) {
          var cell = grid[r][c];
          var el = document.createElement("div");
          el.className = "cell";
          if (cell.revealed) {
            el.classList.add("revealed");
            if (cell.mine) {
              el.classList.add("mine");
              el.textContent = "💣";
            } else if (cell.count > 0) {
              el.textContent = cell.count;
              el.style.color = numberColor(cell.count);
            }
          } else if (cell.flagged) {
            el.classList.add("flagged");
            el.textContent = "🚩";
          }
          el.addEventListener("click", function () { handleClick(r, c); });
          el.addEventListener("contextmenu", function (e) { e.preventDefault(); toggleFlag(r, c); });
          boardEl.appendChild(el);
        })(r, c);
      }
    }
  }

  function numberColor(n) {
    var colors = ["", "#4ac3ff", "#3ddc84", "#ff5d5d", "#7c5cff", "#ffb84d", "#29e0c9", "#eef0fb", "#a6acc9"];
    return colors[n] || "var(--text)";
  }

  function handleClick(r, c) {
    if (over) return;
    if (flagMode) { toggleFlag(r, c); return; }
    var cell = grid[r][c];
    if (cell.flagged || cell.revealed) return;
    if (firstClick) {
      placeMines(r, c);
      firstClick = false;
      seconds = 0;
      timer = setInterval(function () { seconds++; refreshHud(); }, 1000);
    }
    if (cell.mine) {
      cell.revealed = true;
      loseGame();
      return;
    }
    reveal(r, c);
    render();
    refreshHud();
    checkWin();
  }

  function toggleFlag(r, c) {
    if (over) return;
    var cell = grid[r][c];
    if (cell.revealed) return;
    if (firstClick) return;
    cell.flagged = !cell.flagged;
    flagCount += cell.flagged ? 1 : -1;
    render();
    refreshHud();
  }

  function checkWin() {
    if (revealedCount === SIZE * SIZE - MINES) {
      over = true;
      won = true;
      clearInterval(timer);
      var improved = window.ArcadeCommon.setBestLowerIsBetter(GAME_ID, seconds);
      resultBanner.innerHTML = '<span class="overlay-win">' + window.ArcadeI18n.t("common.youWin") +
        " — " + seconds + "s" + (improved ? " 🏆" : "") + "</span>";
      refreshHud();
    }
  }

  function loseGame() {
    over = true;
    clearInterval(timer);
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        if (grid[r][c].mine) grid[r][c].revealed = true;
      }
    }
    render();
    resultBanner.innerHTML = '<span class="overlay-lose">' + window.ArcadeI18n.t("common.youLose") + "</span>";
  }

  flagModeBtn.addEventListener("click", function () {
    flagMode = !flagMode;
    flagModeBtn.textContent = "🚩 Flag Mode: " + (flagMode ? "On" : "Off");
    flagModeBtn.classList.toggle("active", flagMode);
  });

  restartBtn.addEventListener("click", newGame);
  newGame();
})();
