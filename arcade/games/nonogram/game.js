(function () {
  var GAME_ID = "nonogram";
  var boardEl = document.getElementById("nono-board");
  var rowCluesEl = document.getElementById("row-clues");
  var colCluesEl = document.getElementById("col-clues");
  var movesEl = document.getElementById("moves");
  var bestEl = document.getElementById("best");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");
  var markModeBtn = document.getElementById("mark-mode");

  var SIZE = 5;
  var PUZZLES = [
    ["01010", "11111", "11111", "01110", "00100"],
    ["01010", "01010", "00000", "10001", "01110"],
    ["00100", "01110", "11111", "00100", "00100"],
    ["00100", "00100", "11111", "00100", "00100"]
  ];

  var solution, state, moves, over, markMode;

  function refreshHud() {
    movesEl.textContent = moves;
    var best = window.ArcadeCommon.getBest(GAME_ID);
    bestEl.textContent = best === null ? "-" : best;
  }

  function computeRuns(cells) {
    var runs = [];
    var count = 0;
    cells.forEach(function (v) {
      if (v === "1") { count++; }
      else { if (count > 0) runs.push(count); count = 0; }
    });
    if (count > 0) runs.push(count);
    if (runs.length === 0) runs.push(0);
    return runs;
  }

  function newGame() {
    solution = window.ArcadeCommon.pick(PUZZLES);
    state = [];
    for (var r = 0; r < SIZE; r++) state.push(new Array(SIZE).fill(0));
    moves = 0;
    over = false;
    markMode = false;
    markModeBtn.textContent = "✖️ Mark Mode: Off";
    markModeBtn.classList.remove("active");
    resultBanner.innerHTML = "";
    refreshHud();
    renderClues();
    render();
  }

  function renderClues() {
    rowCluesEl.innerHTML = "";
    rowCluesEl.style.gridTemplateRows = "repeat(" + SIZE + ", 42px)";
    for (var r = 0; r < SIZE; r++) {
      var cells = solution[r].split("");
      var runs = computeRuns(cells);
      var div = document.createElement("div");
      div.className = "row-clue";
      div.textContent = runs.join(" ");
      rowCluesEl.appendChild(div);
    }
    colCluesEl.innerHTML = "";
    colCluesEl.style.gridTemplateColumns = "repeat(" + SIZE + ", 42px)";
    for (var c = 0; c < SIZE; c++) {
      var colCells = [];
      for (var r2 = 0; r2 < SIZE; r2++) colCells.push(solution[r2][c]);
      var runs2 = computeRuns(colCells);
      var div2 = document.createElement("div");
      div2.className = "col-clue";
      div2.innerHTML = runs2.join("<br>");
      colCluesEl.appendChild(div2);
    }
  }

  function render() {
    boardEl.innerHTML = "";
    boardEl.style.gridTemplateColumns = "repeat(" + SIZE + ", 42px)";
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        (function (r, c) {
          var el = document.createElement("div");
          el.className = "cell";
          var v = state[r][c];
          if (v === 1) { el.classList.add("filled"); }
          else if (v === 2) { el.classList.add("marked"); el.textContent = "✖"; }
          el.addEventListener("click", function () { handleClick(r, c); });
          el.addEventListener("contextmenu", function (e) { e.preventDefault(); toggleMark(r, c); });
          boardEl.appendChild(el);
        })(r, c);
      }
    }
  }

  function handleClick(r, c) {
    if (over) return;
    if (markMode) { toggleMark(r, c); return; }
    state[r][c] = state[r][c] === 1 ? 0 : 1;
    moves++;
    refreshHud();
    render();
    checkWin();
  }

  function toggleMark(r, c) {
    if (over) return;
    state[r][c] = state[r][c] === 2 ? 0 : 2;
    moves++;
    refreshHud();
    render();
  }

  function checkWin() {
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        var shouldFill = solution[r][c] === "1";
        var isFilled = state[r][c] === 1;
        if (shouldFill !== isFilled) return;
      }
    }
    over = true;
    var improved = window.ArcadeCommon.setBestLowerIsBetter(GAME_ID, moves);
    resultBanner.innerHTML = '<span class="overlay-win">' + window.ArcadeI18n.t("common.youWin") +
      " — " + moves + " " + window.ArcadeI18n.t("common.moves") + (improved ? " 🏆" : "") + "</span>";
    refreshHud();
  }

  markModeBtn.addEventListener("click", function () {
    markMode = !markMode;
    markModeBtn.textContent = "✖️ Mark Mode: " + (markMode ? "On" : "Off");
    markModeBtn.classList.toggle("active", markMode);
  });

  restartBtn.addEventListener("click", newGame);
  newGame();
})();
