(function () {
  var GAME_ID = "sudoku";
  var boardEl = document.getElementById("board");
  var numpadEl = document.getElementById("numpad");
  var timeEl = document.getElementById("time");
  var bestEl = document.getElementById("best");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");
  var clearBtn = document.getElementById("clear-cell");
  var diffEl = document.getElementById("difficulty");

  // Per-difficulty blank count. More blanks = fewer givens = harder.
  var DIFFICULTIES = {
    easy: { blanks: 30 },
    medium: { blanks: 35 },
    hard: { blanks: 50 }
  };
  var cfg = DIFFICULTIES.medium;

  var BASE = [
    [1, 2, 3, 4, 5, 6, 7, 8, 9],
    [4, 5, 6, 7, 8, 9, 1, 2, 3],
    [7, 8, 9, 1, 2, 3, 4, 5, 6],
    [2, 3, 4, 5, 6, 7, 8, 9, 1],
    [5, 6, 7, 8, 9, 1, 2, 3, 4],
    [8, 9, 1, 2, 3, 4, 5, 6, 7],
    [3, 4, 5, 6, 7, 8, 9, 1, 2],
    [6, 7, 8, 9, 1, 2, 3, 4, 5],
    [9, 1, 2, 3, 4, 5, 6, 7, 8]
  ];

  var grid, given, selected, over, seconds, timer;

  function refreshHud() {
    timeEl.textContent = seconds;
    var best = window.ArcadeCommon.getBest(GAME_ID);
    bestEl.textContent = best === null ? "-" : best;
  }

  function shuffleGroups() {
    var bands = window.ArcadeCommon.shuffle([0, 1, 2]);
    var rowOrder = [];
    bands.forEach(function (band) {
      var rows = window.ArcadeCommon.shuffle([0, 1, 2]);
      rows.forEach(function (r) { rowOrder.push(band * 3 + r); });
    });
    var stacks = window.ArcadeCommon.shuffle([0, 1, 2]);
    var colOrder = [];
    stacks.forEach(function (stack) {
      var cols = window.ArcadeCommon.shuffle([0, 1, 2]);
      cols.forEach(function (c) { colOrder.push(stack * 3 + c); });
    });
    var digitMap = window.ArcadeCommon.shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);

    var solution = [];
    for (var r = 0; r < 9; r++) {
      var row = [];
      for (var c = 0; c < 9; c++) {
        var val = BASE[rowOrder[r]][colOrder[c]];
        row.push(digitMap[val - 1]);
      }
      solution.push(row);
    }
    if (Math.random() < 0.5) {
      var t = [];
      for (var i = 0; i < 9; i++) {
        var row2 = [];
        for (var j = 0; j < 9; j++) row2.push(solution[j][i]);
        t.push(row2);
      }
      solution = t;
    }
    return solution;
  }

  function newGame() {
    var solution = shuffleGroups();
    grid = solution.map(function (row) { return row.slice(); });
    given = [];
    var indexes = [];
    for (var i = 0; i < 81; i++) indexes.push(i);
    indexes = window.ArcadeCommon.shuffle(indexes);
    var blanks = cfg.blanks;
    var blankSet = {};
    for (var k = 0; k < blanks; k++) blankSet[indexes[k]] = true;
    for (var r = 0; r < 9; r++) {
      var rowGiven = [];
      for (var c = 0; c < 9; c++) {
        var idx = r * 9 + c;
        if (blankSet[idx]) {
          grid[r][c] = 0;
          rowGiven.push(false);
        } else {
          rowGiven.push(true);
        }
      }
      given.push(rowGiven);
    }
    selected = null;
    over = false;
    seconds = 0;
    clearInterval(timer);
    timer = setInterval(function () { if (!over) { seconds++; refreshHud(); } }, 1000);
    resultBanner.innerHTML = "";
    refreshHud();
    render();
    renderNumpad();
  }

  function conflictsAt(r, c) {
    var v = grid[r][c];
    if (v === 0) return false;
    for (var i = 0; i < 9; i++) {
      if (i !== c && grid[r][i] === v) return true;
      if (i !== r && grid[i][c] === v) return true;
    }
    var br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
    for (var rr = br; rr < br + 3; rr++) {
      for (var cc = bc; cc < bc + 3; cc++) {
        if ((rr !== r || cc !== c) && grid[rr][cc] === v) return true;
      }
    }
    return false;
  }

  function render() {
    boardEl.innerHTML = "";
    boardEl.style.gridTemplateColumns = "repeat(9, min(38px, calc((100vw - 56px) / 9)))";
    for (var r = 0; r < 9; r++) {
      for (var c = 0; c < 9; c++) {
        (function (r, c) {
          var el = document.createElement("div");
          el.className = "cell";
          if (given[r][c]) el.classList.add("given");
          if (c === 2 || c === 5) el.classList.add("b-right");
          if (r === 2 || r === 5) el.classList.add("b-bottom");
          if (selected && selected[0] === r && selected[1] === c) el.classList.add("selected");
          if (grid[r][c] !== 0) {
            el.textContent = grid[r][c];
            if (conflictsAt(r, c)) el.classList.add("conflict");
          }
          el.addEventListener("click", function () {
            if (given[r][c] || over) return;
            selected = [r, c];
            render();
          });
          boardEl.appendChild(el);
        })(r, c);
      }
    }
  }

  function renderNumpad() {
    numpadEl.innerHTML = "";
    for (var n = 1; n <= 9; n++) {
      (function (n) {
        var btn = document.createElement("button");
        btn.className = "btn";
        btn.textContent = n;
        btn.addEventListener("click", function () { setValue(n); });
        numpadEl.appendChild(btn);
      })(n);
    }
  }

  function setValue(n) {
    if (over || !selected) return;
    var r = selected[0], c = selected[1];
    if (given[r][c]) return;
    grid[r][c] = n;
    render();
    checkWin();
  }

  function clearCell() {
    if (over || !selected) return;
    var r = selected[0], c = selected[1];
    if (given[r][c]) return;
    grid[r][c] = 0;
    render();
  }

  function checkWin() {
    for (var r = 0; r < 9; r++) {
      for (var c = 0; c < 9; c++) {
        if (grid[r][c] === 0 || conflictsAt(r, c)) return;
      }
    }
    over = true;
    clearInterval(timer);
    var improved = window.ArcadeCommon.setBestLowerIsBetter(GAME_ID, seconds);
    resultBanner.innerHTML = '<span class="overlay-win">' + window.ArcadeI18n.t("common.youWin") +
      " — " + seconds + "s" + (improved ? " 🏆" : "") + "</span>";
    refreshHud();
  }

  document.addEventListener("keydown", function (e) {
    if (over || !selected) return;
    if (e.key >= "1" && e.key <= "9") setValue(Number(e.key));
    else if (e.key === "Backspace" || e.key === "Delete" || e.key === "0") clearCell();
  });

  clearBtn.addEventListener("click", clearCell);
  restartBtn.addEventListener("click", newGame);

  // Difficulty selector - changing the number of givens starts a fresh puzzle.
  window.ArcadeCommon.mountDifficulty(diffEl, GAME_ID, {
    defaultKey: "medium",
    onChange: function (level) {
      cfg = DIFFICULTIES[level] || DIFFICULTIES.medium;
      newGame();
    }
  });
})();
