(function () {
  var GAME_ID = "word-search";
  var boardEl = document.getElementById("ws-board");
  var wordListEl = document.getElementById("word-list");
  var foundCountEl = document.getElementById("found-count");
  var totalCountEl = document.getElementById("total-count");
  var timeEl = document.getElementById("time");
  var bestEl = document.getElementById("best");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");

  var SIZE = 10;
  var WORD_POOL = ["SNAKE", "PONG", "ARCADE", "PIXEL", "CHESS", "MAZE", "LEVEL", "SCORE", "COMBO", "QUEST", "JOYSTICK", "BOARD"];
  var DIRECTIONS = [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]];

  var grid, words, foundWords, cellEls, dragStart, pendingStart, dragging, over, seconds, timer;

  function refreshHud() {
    foundCountEl.textContent = foundWords.length;
    totalCountEl.textContent = words.length;
    timeEl.textContent = seconds;
    var best = window.ArcadeCommon.getBest(GAME_ID);
    bestEl.textContent = best === null ? "-" : best;
  }

  function newGame() {
    var chosen = window.ArcadeCommon.shuffle(WORD_POOL).slice(0, 6);
    words = chosen.sort(function (a, b) { return b.length - a.length; });
    grid = [];
    for (var r = 0; r < SIZE; r++) grid.push(new Array(SIZE).fill(null));

    words.forEach(function (word) {
      placeWord(word);
    });

    for (var r2 = 0; r2 < SIZE; r2++) {
      for (var c2 = 0; c2 < SIZE; c2++) {
        if (!grid[r2][c2]) {
          grid[r2][c2] = String.fromCharCode(65 + Math.floor(Math.random() * 26));
        }
      }
    }

    foundWords = [];
    dragStart = null;
    pendingStart = null;
    dragging = false;
    over = false;
    seconds = 0;
    clearInterval(timer);
    timer = setInterval(function () { if (!over) { seconds++; refreshHud(); } }, 1000);
    resultBanner.innerHTML = "";
    refreshHud();
    renderWordList();
    render();
  }

  function placeWord(word) {
    for (var attempt = 0; attempt < 300; attempt++) {
      var dir = window.ArcadeCommon.pick(DIRECTIONS);
      var r = window.ArcadeCommon.randInt(0, SIZE - 1);
      var c = window.ArcadeCommon.randInt(0, SIZE - 1);
      var endR = r + dir[0] * (word.length - 1);
      var endC = c + dir[1] * (word.length - 1);
      if (endR < 0 || endR >= SIZE || endC < 0 || endC >= SIZE) continue;
      var ok = true;
      for (var i = 0; i < word.length; i++) {
        var rr = r + dir[0] * i, cc = c + dir[1] * i;
        if (grid[rr][cc] !== null && grid[rr][cc] !== word[i]) { ok = false; break; }
      }
      if (!ok) continue;
      for (var j = 0; j < word.length; j++) {
        var rr2 = r + dir[0] * j, cc2 = c + dir[1] * j;
        grid[rr2][cc2] = word[j];
      }
      return true;
    }
    return false;
  }

  function renderWordList() {
    wordListEl.innerHTML = "";
    words.forEach(function (word) {
      var chip = document.createElement("span");
      chip.className = "word-chip" + (foundWords.indexOf(word) !== -1 ? " found" : "");
      chip.textContent = word;
      chip.setAttribute("data-word", word);
      wordListEl.appendChild(chip);
    });
  }

  function render() {
    boardEl.innerHTML = "";
    boardEl.style.gridTemplateColumns = "repeat(" + SIZE + ", 32px)";
    cellEls = [];
    for (var r = 0; r < SIZE; r++) {
      var rowEls = [];
      for (var c = 0; c < SIZE; c++) {
        var el = document.createElement("div");
        el.className = "cell";
        el.textContent = grid[r][c];
        el.setAttribute("data-r", r);
        el.setAttribute("data-c", c);
        boardEl.appendChild(el);
        rowEls.push(el);
      }
      cellEls.push(rowEls);
    }
    applyFoundHighlightsWithMap();
  }

  function lineCells(start, end) {
    var dr = end[0] - start[0], dc = end[1] - start[1];
    var steps = Math.max(Math.abs(dr), Math.abs(dc));
    if (steps === 0) return [start];
    if (dr !== 0 && dc !== 0 && Math.abs(dr) !== Math.abs(dc)) return null;
    var sr = dr === 0 ? 0 : dr / Math.abs(dr);
    var sc = dc === 0 ? 0 : dc / Math.abs(dc);
    var cells = [];
    for (var i = 0; i <= steps; i++) cells.push([start[0] + sr * i, start[1] + sc * i]);
    return cells;
  }

  function highlightPreview(cells) {
    for (var r = 0; r < SIZE; r++) for (var c = 0; c < SIZE; c++) cellEls[r][c].classList.remove("selecting");
    if (!cells) return;
    cells.forEach(function (rc) { cellEls[rc[0]][rc[1]].classList.add("selecting"); });
  }

  function finalizeSelection(start, end) {
    var cells = lineCells(start, end);
    highlightPreview(null);
    if (!cells || cells.length < 2) return;
    var str = cells.map(function (rc) { return grid[rc[0]][rc[1]]; }).join("");
    var strRev = str.split("").reverse().join("");
    var matchWord = words.filter(function (w) { return foundWords.indexOf(w) === -1 && (w === str || w === strRev); })[0];
    if (matchWord) {
      foundWords.push(matchWord);
      foundCellsMap[matchWord] = cells;
      window.ArcadeCommon.toast("Found " + matchWord + "!");
      applyFoundHighlightsWithMap();
      renderWordList();
      refreshHud();
      checkWin();
    }
  }

  var foundCellsMap = {};

  function applyFoundHighlightsWithMap() {
    for (var r = 0; r < SIZE; r++) for (var c = 0; c < SIZE; c++) cellEls[r][c].classList.remove("found");
    foundWords.forEach(function (word) {
      var cells = foundCellsMap[word];
      if (cells) cells.forEach(function (rc) { cellEls[rc[0]][rc[1]].classList.add("found"); });
    });
  }

  function cellFromPoint(x, y) {
    var el = document.elementFromPoint(x, y);
    if (!el || !el.hasAttribute("data-r")) return null;
    return [Number(el.getAttribute("data-r")), Number(el.getAttribute("data-c"))];
  }

  boardEl.addEventListener("mousedown", function (e) {
    if (over) return;
    var target = e.target.closest("[data-r]");
    if (!target) return;
    var cell = [Number(target.getAttribute("data-r")), Number(target.getAttribute("data-c"))];
    if (pendingStart) {
      finalizeSelection(pendingStart, cell);
      pendingStart = null;
      dragging = false;
      return;
    }
    dragStart = cell;
    dragging = true;
    highlightPreview([cell]);
  });

  boardEl.addEventListener("mousemove", function (e) {
    if (!dragging || over) return;
    var target = e.target.closest("[data-r]");
    if (!target) return;
    var cell = [Number(target.getAttribute("data-r")), Number(target.getAttribute("data-c"))];
    var cells = lineCells(dragStart, cell);
    highlightPreview(cells || [dragStart]);
  });

  document.addEventListener("mouseup", function (e) {
    if (!dragging || over) return;
    dragging = false;
    var target = e.target.closest ? e.target.closest("[data-r]") : null;
    var cell = target ? [Number(target.getAttribute("data-r")), Number(target.getAttribute("data-c"))] : dragStart;
    if (cell[0] === dragStart[0] && cell[1] === dragStart[1]) {
      pendingStart = dragStart;
      highlightPreview([dragStart]);
    } else {
      finalizeSelection(dragStart, cell);
    }
  });

  boardEl.addEventListener("touchstart", function (e) {
    if (over) return;
    var t = e.touches[0];
    var cell = cellFromPoint(t.clientX, t.clientY);
    if (!cell) return;
    e.preventDefault();
    if (pendingStart) {
      finalizeSelection(pendingStart, cell);
      pendingStart = null;
      dragging = false;
      return;
    }
    dragStart = cell;
    dragging = true;
    highlightPreview([cell]);
  }, { passive: false });

  boardEl.addEventListener("touchmove", function (e) {
    if (!dragging || over) return;
    var t = e.touches[0];
    var cell = cellFromPoint(t.clientX, t.clientY);
    if (!cell) return;
    e.preventDefault();
    var cells = lineCells(dragStart, cell);
    highlightPreview(cells || [dragStart]);
  }, { passive: false });

  boardEl.addEventListener("touchend", function (e) {
    if (!dragging || over) return;
    dragging = false;
    var t = e.changedTouches[0];
    var cell = cellFromPoint(t.clientX, t.clientY) || dragStart;
    if (cell[0] === dragStart[0] && cell[1] === dragStart[1]) {
      pendingStart = dragStart;
      highlightPreview([dragStart]);
    } else {
      finalizeSelection(dragStart, cell);
    }
  });

  function checkWin() {
    if (foundWords.length === words.length) {
      over = true;
      clearInterval(timer);
      var improved = window.ArcadeCommon.setBestLowerIsBetter(GAME_ID, seconds);
      resultBanner.innerHTML = '<span class="overlay-win">' + window.ArcadeI18n.t("common.youWin") +
        " — " + seconds + "s" + (improved ? " 🏆" : "") + "</span>";
      refreshHud();
    }
  }

  restartBtn.addEventListener("click", function () { foundCellsMap = {}; newGame(); });
  foundCellsMap = {};
  newGame();
})();
