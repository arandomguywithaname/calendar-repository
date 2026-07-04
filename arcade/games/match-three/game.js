(function () {
  var GAME_ID = "match-three";
  var boardEl = document.getElementById("board");
  var scoreEl = document.getElementById("score");
  var bestEl = document.getElementById("best");
  var movesLeftEl = document.getElementById("moves-left");
  var targetEl = document.getElementById("target");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");

  var SIZE = 8;
  var GEMS = ["🔴", "🔵", "🟢", "🟡", "🟣", "🟠"];
  var TARGET_SCORE = 300;
  var START_MOVES = 25;

  var board, score, movesLeft, over, busy, selected;

  function idx(r, c) { return r * SIZE + c; }

  function randType() { return window.ArcadeCommon.randInt(0, GEMS.length - 1); }

  function generateBoard() {
    var b = new Array(SIZE * SIZE);
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        var t;
        do {
          t = randType();
        } while (
          (c >= 2 && b[idx(r, c - 1)] === t && b[idx(r, c - 2)] === t) ||
          (r >= 2 && b[idx(r - 1, c)] === t && b[idx(r - 2, c)] === t)
        );
        b[idx(r, c)] = t;
      }
    }
    return b;
  }

  function findMatches(b) {
    var matched = new Array(SIZE * SIZE).fill(false);
    var r, c, k;
    for (r = 0; r < SIZE; r++) {
      var runStart = 0;
      for (c = 1; c <= SIZE; c++) {
        var same = c < SIZE && b[idx(r, c)] === b[idx(r, runStart)];
        if (!same) {
          if (c - runStart >= 3) {
            for (k = runStart; k < c; k++) matched[idx(r, k)] = true;
          }
          runStart = c;
        }
      }
    }
    for (c = 0; c < SIZE; c++) {
      var runStart2 = 0;
      for (r = 1; r <= SIZE; r++) {
        var same2 = r < SIZE && b[idx(r, c)] === b[idx(runStart2, c)];
        if (!same2) {
          if (r - runStart2 >= 3) {
            for (k = runStart2; k < r; k++) matched[idx(k, c)] = true;
          }
          runStart2 = r;
        }
      }
    }
    return matched;
  }

  function applyGravity(b) {
    for (var c = 0; c < SIZE; c++) {
      var col = [];
      for (var r = SIZE - 1; r >= 0; r--) {
        if (b[idx(r, c)] !== null) col.push(b[idx(r, c)]);
      }
      for (r = SIZE - 1; r >= 0; r--) {
        if (col.length > 0) {
          b[idx(r, c)] = col.shift();
        } else {
          b[idx(r, c)] = null;
        }
      }
    }
  }

  function refill(b) {
    for (var i = 0; i < b.length; i++) {
      if (b[i] === null) b[i] = randType();
    }
  }

  function isAdjacent(a, bIdx) {
    var ra = Math.floor(a / SIZE), ca = a % SIZE;
    var rb = Math.floor(bIdx / SIZE), cb = bIdx % SIZE;
    return Math.abs(ra - rb) + Math.abs(ca - cb) === 1;
  }

  function swap(a, bIdx) {
    var t = board[a];
    board[a] = board[bIdx];
    board[bIdx] = t;
  }

  function refreshHud() {
    scoreEl.textContent = score;
    targetEl.textContent = TARGET_SCORE;
    movesLeftEl.textContent = Math.max(0, movesLeft);
    var best = window.ArcadeCommon.getBest(GAME_ID);
    bestEl.textContent = best === null ? 0 : best;
  }

  function render() {
    boardEl.innerHTML = "";
    for (var i = 0; i < board.length; i++) {
      (function (i) {
        var cell = document.createElement("div");
        cell.className = "cell" + (selected === i ? " selected" : "");
        cell.textContent = board[i] === null ? "" : GEMS[board[i]];
        cell.addEventListener("click", function () { onCellClick(i); });
        boardEl.appendChild(cell);
      })(i);
    }
  }

  function newGame() {
    board = generateBoard();
    score = 0;
    movesLeft = START_MOVES;
    over = false;
    busy = false;
    selected = null;
    resultBanner.innerHTML = "";
    refreshHud();
    render();
  }

  function checkEnd() {
    if (over) return;
    if (score >= TARGET_SCORE) {
      over = true;
      var improved = window.ArcadeCommon.setBest(GAME_ID, score);
      resultBanner.innerHTML = '<span class="overlay-win">' + window.ArcadeI18n.t("common.youWin") +
        " — " + score + (improved ? " 🏆" : "") + "</span>";
    } else if (movesLeft <= 0) {
      over = true;
      window.ArcadeCommon.setBest(GAME_ID, score);
      resultBanner.innerHTML = '<span class="overlay-lose">' + window.ArcadeI18n.t("common.youLose") +
        " — " + window.ArcadeI18n.t("common.score") + ": " + score + "</span>";
    }
    refreshHud();
  }

  function processCascade() {
    var matched = findMatches(board);
    var any = false;
    var count = 0;
    for (var i = 0; i < matched.length; i++) {
      if (matched[i]) { any = true; count++; }
    }
    if (!any) {
      busy = false;
      render();
      checkEnd();
      return;
    }
    for (i = 0; i < matched.length; i++) {
      if (matched[i]) board[i] = null;
    }
    score += count * 10;
    refreshHud();
    render();
    setTimeout(function () {
      applyGravity(board);
      refill(board);
      render();
      setTimeout(processCascade, 220);
    }, 220);
  }

  function onCellClick(i) {
    if (over || busy) return;
    if (selected === null) {
      selected = i;
      render();
      return;
    }
    if (selected === i) {
      selected = null;
      render();
      return;
    }
    if (isAdjacent(selected, i)) {
      var a = selected, b = i;
      selected = null;
      busy = true;
      movesLeft--;
      refreshHud();
      swap(a, b);
      render();
      setTimeout(function () {
        var matched = findMatches(board);
        var any = matched.some(function (m) { return m; });
        if (!any) {
          swap(a, b);
          render();
          busy = false;
          checkEnd();
        } else {
          processCascade();
        }
      }, 280);
    } else {
      selected = i;
      render();
    }
  }

  restartBtn.addEventListener("click", newGame);
  newGame();
})();
