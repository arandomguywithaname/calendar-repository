(function () {
  var GAME_ID = "crossword-mini";
  var boardEl = document.getElementById("cw-board");
  var cluesEl = document.getElementById("clues");
  var bestEl = document.getElementById("best");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");
  var checkBtn = document.getElementById("check-btn");

  var SIZE = 5;

  // Shared block pattern for all puzzles: a small "plus"-style mini crossword.
  var BLOCKS = [
    [true, true, true, true, true],
    [false, true, false, true, false],
    [false, false, false, false, false],
    [false, true, false, true, false],
    [true, true, true, true, true]
  ];

  var PUZZLES = [
    {
      solution: [
        [null, null, null, null, null],
        ["A", null, "C", null, "T"],
        ["C", "R", "A", "N", "E"],
        ["E", null, "T", null, "N"],
        [null, null, null, null, null]
      ],
      clues: {
        "1,0,D": "Winning tennis serve",
        "1,2,D": "House pet that says meow",
        "1,4,D": "Number right after nine",
        "2,0,A": "Long-necked bird, or a machine that lifts heavy loads"
      }
    },
    {
      solution: [
        [null, null, null, null, null],
        ["I", null, "O", null, "S"],
        ["M", "O", "U", "S", "E"],
        ["P", null, "T", null, "A"],
        [null, null, null, null, null]
      ],
      clues: {
        "1,0,D": "Little mischievous creature",
        "1,2,D": "Not in; outside",
        "1,4,D": "Large body of salt water",
        "2,0,A": "Small rodent, or a computer pointing device"
      }
    },
    {
      solution: [
        [null, null, null, null, null],
        ["O", null, "C", null, "A"],
        ["P", "L", "A", "N", "T"],
        ["T", null, "P", null, "E"],
        [null, null, null, null, null]
      ],
      clues: {
        "1,0,D": "Choose (a course of action)",
        "1,2,D": "Head covering",
        "1,4,D": "Consumed food (past tense)",
        "2,0,A": "Living thing that grows in soil, like a tree or flower"
      }
    }
  ];

  var solution, clues, userGrid, slots, selectedSlot, selectedCell, over;

  function refreshHud() {
    var best = window.ArcadeCommon.getBest(GAME_ID);
    bestEl.textContent = best === null ? "-" : best;
  }

  function isBlock(r, c) {
    return r < 0 || r >= SIZE || c < 0 || c >= SIZE || BLOCKS[r][c];
  }

  function buildSlots() {
    slots = [];
    var counter = 0;
    var numberAt = {};
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        if (isBlock(r, c)) continue;
        var startAcross = isBlock(r, c - 1) && !isBlock(r, c + 1);
        var startDown = isBlock(r - 1, c) && !isBlock(r + 1, c);
        if (startAcross || startDown) {
          counter++;
          numberAt[r + "," + c] = counter;
        }
        if (startAcross) {
          var cellsA = [];
          var cc = c;
          while (!isBlock(r, cc)) { cellsA.push([r, cc]); cc++; }
          slots.push({ number: counter, row: r, col: c, dir: "A", cells: cellsA, key: r + "," + c + ",A" });
        }
        if (startDown) {
          var cellsD = [];
          var rr = r;
          while (!isBlock(rr, c)) { cellsD.push([rr, c]); rr++; }
          slots.push({ number: counter, row: r, col: c, dir: "D", cells: cellsD, key: r + "," + c + ",D" });
        }
      }
    }
    return numberAt;
  }

  var numberMap;

  function newGame() {
    var puzzle = window.ArcadeCommon.pick(PUZZLES);
    solution = puzzle.solution;
    clues = puzzle.clues;
    numberMap = buildSlots();
    userGrid = [];
    for (var r = 0; r < SIZE; r++) {
      var row = [];
      for (var c = 0; c < SIZE; c++) row.push(isBlock(r, c) ? null : "");
      userGrid.push(row);
    }
    selectedSlot = slots[0];
    selectedCell = [selectedSlot.row, selectedSlot.col];
    over = false;
    resultBanner.innerHTML = "";
    refreshHud();
    render();
    renderClues();
  }

  function slotsForCell(r, c) {
    return slots.filter(function (s) {
      return s.cells.some(function (rc) { return rc[0] === r && rc[1] === c; });
    });
  }

  function selectCell(r, c) {
    if (over || isBlock(r, c)) return;
    var candidates = slotsForCell(r, c);
    if (selectedCell && selectedCell[0] === r && selectedCell[1] === c && candidates.length > 1) {
      var idx = candidates.indexOf(selectedSlot);
      selectedSlot = candidates[(idx + 1) % candidates.length];
    } else {
      var keepDir = candidates.filter(function (s) { return selectedSlot && s.dir === selectedSlot.dir; })[0];
      selectedSlot = keepDir || candidates[0];
    }
    selectedCell = [r, c];
    render();
  }

  function render() {
    boardEl.innerHTML = "";
    boardEl.style.gridTemplateColumns = "repeat(" + SIZE + ", 46px)";
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        (function (r, c) {
          var el = document.createElement("div");
          el.className = "cell";
          if (isBlock(r, c)) {
            el.classList.add("block");
          } else {
            el.textContent = userGrid[r][c] || "";
            if (numberMap[r + "," + c]) {
              var num = document.createElement("span");
              num.className = "num";
              num.textContent = numberMap[r + "," + c];
              el.appendChild(num);
              el.appendChild(document.createTextNode(userGrid[r][c] || ""));
            }
            if (selectedSlot && selectedSlot.cells.some(function (rc) { return rc[0] === r && rc[1] === c; })) {
              el.classList.add("active-word");
            }
            if (selectedCell && selectedCell[0] === r && selectedCell[1] === c) {
              el.classList.add("selected");
            }
            el.addEventListener("click", function () { selectCell(r, c); });
          }
          boardEl.appendChild(el);
        })(r, c);
      }
    }
  }

  function renderClues() {
    cluesEl.innerHTML = "";
    ["A", "D"].forEach(function (dir) {
      var col = document.createElement("div");
      col.className = "clue-col";
      var h3 = document.createElement("h3");
      h3.textContent = dir === "A" ? "Across" : "Down";
      col.appendChild(h3);
      slots.filter(function (s) { return s.dir === dir; }).forEach(function (s) {
        var item = document.createElement("div");
        item.className = "clue-item" + (selectedSlot === s ? " active" : "");
        item.textContent = s.number + ". " + (clues[s.key] || "");
        item.addEventListener("click", function () {
          selectedSlot = s;
          selectedCell = [s.row, s.col];
          render();
          renderClues();
        });
        col.appendChild(item);
      });
      cluesEl.appendChild(col);
    });
  }

  function moveWithinSlot(forward) {
    if (!selectedSlot) return;
    var idx = selectedSlot.cells.findIndex(function (rc) { return rc[0] === selectedCell[0] && rc[1] === selectedCell[1]; });
    var nextIdx = idx + (forward ? 1 : -1);
    if (nextIdx >= 0 && nextIdx < selectedSlot.cells.length) {
      selectedCell = selectedSlot.cells[nextIdx];
    }
  }

  document.addEventListener("keydown", function (e) {
    if (over || !selectedCell) return;
    var key = e.key;
    if (/^[a-zA-Z]$/.test(key)) {
      var r = selectedCell[0], c = selectedCell[1];
      userGrid[r][c] = key.toUpperCase();
      moveWithinSlot(true);
      render();
      renderClues();
      checkWin();
    } else if (key === "Backspace") {
      var r2 = selectedCell[0], c2 = selectedCell[1];
      if (userGrid[r2][c2]) {
        userGrid[r2][c2] = "";
      } else {
        moveWithinSlot(false);
      }
      render();
      renderClues();
    } else if (key === "ArrowRight" || key === "ArrowLeft" || key === "ArrowUp" || key === "ArrowDown") {
      e.preventDefault();
      var dr = key === "ArrowDown" ? 1 : key === "ArrowUp" ? -1 : 0;
      var dc = key === "ArrowRight" ? 1 : key === "ArrowLeft" ? -1 : 0;
      var nr = selectedCell[0] + dr, nc = selectedCell[1] + dc;
      if (!isBlock(nr, nc)) selectCell(nr, nc);
    }
  });

  function checkWin() {
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        if (isBlock(r, c)) continue;
        if ((userGrid[r][c] || "") !== solution[r][c]) return;
      }
    }
    over = true;
    window.ArcadeCommon.setBest(GAME_ID, 1);
    resultBanner.innerHTML = '<span class="overlay-win">' + window.ArcadeI18n.t("common.youWin") + "</span>";
  }

  checkBtn.addEventListener("click", function () {
    var complete = true;
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        if (isBlock(r, c)) continue;
        if (!userGrid[r][c]) complete = false;
      }
    }
    if (!complete) { window.ArcadeCommon.toast("Fill in every cell first"); return; }
    checkWin();
    if (!over) window.ArcadeCommon.toast(window.ArcadeI18n.t("common.wrong"));
  });

  restartBtn.addEventListener("click", newGame);
  newGame();
})();
