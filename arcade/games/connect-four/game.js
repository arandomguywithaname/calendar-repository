(function () {
  var GAME_ID = "connect-four";
  var boardEl = document.getElementById("board");
  var columnsEl = document.getElementById("columns");
  var scoreEl = document.getElementById("score");
  var bestEl = document.getElementById("best");
  var turnStat = document.getElementById("turn-stat");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");

  var ROWS = 6, COLS = 7;
  var EMPTY = 0, PLAYER = 1, CPU = 2;
  var DEPTH = 5;

  var board, over, score, busy;

  function refreshHud() {
    scoreEl.textContent = score;
    var best = window.ArcadeCommon.getBest(GAME_ID);
    bestEl.textContent = best === null ? "-" : best;
  }

  function newGame() {
    board = [];
    for (var r = 0; r < ROWS; r++) board.push(new Array(COLS).fill(EMPTY));
    over = false;
    busy = false;
    if (score === undefined) score = 0;
    resultBanner.innerHTML = "";
    setTurnStat(true);
    refreshHud();
    renderColumns();
    render();
  }

  function setTurnStat(playerTurn) {
    turnStat.innerHTML = '<span data-i18n="' + (playerTurn ? "common.yourTurn" : "common.cpuTurn") + '">' +
      window.ArcadeI18n.t(playerTurn ? "common.yourTurn" : "common.cpuTurn") + "</span>";
  }

  function renderColumns() {
    columnsEl.innerHTML = "";
    for (var c = 0; c < COLS; c++) {
      var btn = document.createElement("button");
      btn.className = "btn";
      btn.textContent = "↓";
      btn.addEventListener("click", function (col) {
        return function () { playerMove(col); };
      }(c));
      columnsEl.appendChild(btn);
    }
  }

  function render() {
    boardEl.innerHTML = "";
    boardEl.style.gridTemplateColumns = "repeat(" + COLS + ", 52px)";
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        var cell = document.createElement("div");
        cell.className = "cell";
        var v = board[r][c];
        if (v === PLAYER) { cell.textContent = "🔴"; }
        else if (v === CPU) { cell.textContent = "🟡"; }
        boardEl.appendChild(cell);
      }
    }
  }

  function findOpenRow(b, col) {
    for (var r = ROWS - 1; r >= 0; r--) {
      if (b[r][col] === EMPTY) return r;
    }
    return -1;
  }

  function cloneBoard(b) {
    return b.map(function (row) { return row.slice(); });
  }

  function isValidCol(b, col) {
    return b[0][col] === EMPTY;
  }

  function getValidCols(b) {
    var cols = [];
    for (var c = 0; c < COLS; c++) if (isValidCol(b, c)) cols.push(c);
    return cols;
  }

  function checkWinAt(b, piece) {
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        if (c + 3 < COLS && b[r][c] === piece && b[r][c + 1] === piece && b[r][c + 2] === piece && b[r][c + 3] === piece) return true;
        if (r + 3 < ROWS && b[r][c] === piece && b[r + 1][c] === piece && b[r + 2][c] === piece && b[r + 3][c] === piece) return true;
        if (r + 3 < ROWS && c + 3 < COLS && b[r][c] === piece && b[r + 1][c + 1] === piece && b[r + 2][c + 2] === piece && b[r + 3][c + 3] === piece) return true;
        if (r - 3 >= 0 && c + 3 < COLS && b[r][c] === piece && b[r - 1][c + 1] === piece && b[r - 2][c + 2] === piece && b[r - 3][c + 3] === piece) return true;
      }
    }
    return false;
  }

  function isBoardFull(b) {
    return getValidCols(b).length === 0;
  }

  function scoreWindow(window4, piece) {
    var opp = piece === PLAYER ? CPU : PLAYER;
    var pieceCount = 0, emptyCount = 0, oppCount = 0;
    window4.forEach(function (v) {
      if (v === piece) pieceCount++;
      else if (v === opp) oppCount++;
      else emptyCount++;
    });
    var s = 0;
    if (pieceCount === 4) s += 100000;
    else if (pieceCount === 3 && emptyCount === 1) s += 50;
    else if (pieceCount === 2 && emptyCount === 2) s += 10;
    if (oppCount === 3 && emptyCount === 1) s -= 60;
    return s;
  }

  function scorePosition(b, piece) {
    var score = 0;
    var centerCol = Math.floor(COLS / 2);
    for (var r = 0; r < ROWS; r++) score += (b[r][centerCol] === piece ? 3 : 0);
    var r2, c2, window4;
    for (r2 = 0; r2 < ROWS; r2++) {
      for (c2 = 0; c2 < COLS - 3; c2++) {
        window4 = [b[r2][c2], b[r2][c2 + 1], b[r2][c2 + 2], b[r2][c2 + 3]];
        score += scoreWindow(window4, piece);
      }
    }
    for (c2 = 0; c2 < COLS; c2++) {
      for (r2 = 0; r2 < ROWS - 3; r2++) {
        window4 = [b[r2][c2], b[r2 + 1][c2], b[r2 + 2][c2], b[r2 + 3][c2]];
        score += scoreWindow(window4, piece);
      }
    }
    for (r2 = 0; r2 < ROWS - 3; r2++) {
      for (c2 = 0; c2 < COLS - 3; c2++) {
        window4 = [b[r2][c2], b[r2 + 1][c2 + 1], b[r2 + 2][c2 + 2], b[r2 + 3][c2 + 3]];
        score += scoreWindow(window4, piece);
      }
    }
    for (r2 = 3; r2 < ROWS; r2++) {
      for (c2 = 0; c2 < COLS - 3; c2++) {
        window4 = [b[r2][c2], b[r2 - 1][c2 + 1], b[r2 - 2][c2 + 2], b[r2 - 3][c2 + 3]];
        score += scoreWindow(window4, piece);
      }
    }
    return score;
  }

  function minimax(b, depth, alpha, beta, maximizing) {
    var validCols = getValidCols(b);
    var playerWin = checkWinAt(b, PLAYER);
    var cpuWin = checkWinAt(b, CPU);
    if (playerWin) return { col: null, score: -10000000 };
    if (cpuWin) return { col: null, score: 10000000 };
    if (validCols.length === 0) return { col: null, score: 0 };
    if (depth === 0) return { col: null, score: scorePosition(b, CPU) };

    var col, r, newBoard, result;
    if (maximizing) {
      var value = -Infinity;
      var bestCol = validCols[Math.floor(validCols.length / 2)];
      for (var i = 0; i < validCols.length; i++) {
        col = validCols[i];
        r = findOpenRow(b, col);
        newBoard = cloneBoard(b);
        newBoard[r][col] = CPU;
        result = minimax(newBoard, depth - 1, alpha, beta, false);
        if (result.score > value) { value = result.score; bestCol = col; }
        alpha = Math.max(alpha, value);
        if (alpha >= beta) break;
      }
      return { col: bestCol, score: value };
    } else {
      var value2 = Infinity;
      var bestCol2 = validCols[Math.floor(validCols.length / 2)];
      for (var j = 0; j < validCols.length; j++) {
        col = validCols[j];
        r = findOpenRow(b, col);
        newBoard = cloneBoard(b);
        newBoard[r][col] = PLAYER;
        result = minimax(newBoard, depth - 1, alpha, beta, true);
        if (result.score < value2) { value2 = result.score; bestCol2 = col; }
        beta = Math.min(beta, value2);
        if (alpha >= beta) break;
      }
      return { col: bestCol2, score: value2 };
    }
  }

  function playerMove(col) {
    if (over || busy) return;
    if (!isValidCol(board, col)) return;
    var r = findOpenRow(board, col);
    board[r][col] = PLAYER;
    render();
    if (checkWinAt(board, PLAYER)) { finish("player"); return; }
    if (isBoardFull(board)) { finish("tie"); return; }
    busy = true;
    setTurnStat(false);
    setTimeout(cpuMove, 400);
  }

  function cpuMove() {
    var result = minimax(board, DEPTH, -Infinity, Infinity, true);
    var col = result.col;
    if (col === null || !isValidCol(board, col)) {
      var valid = getValidCols(board);
      col = valid[0];
    }
    var r = findOpenRow(board, col);
    board[r][col] = CPU;
    render();
    busy = false;
    if (checkWinAt(board, CPU)) { finish("cpu"); return; }
    if (isBoardFull(board)) { finish("tie"); return; }
    setTurnStat(true);
  }

  function finish(who) {
    over = true;
    busy = false;
    if (who === "player") {
      score += 10;
      window.ArcadeCommon.setBest(GAME_ID, score);
      resultBanner.innerHTML = '<span class="overlay-win">' + window.ArcadeI18n.t("common.youWin") + "</span>";
    } else if (who === "cpu") {
      resultBanner.innerHTML = '<span class="overlay-lose">' + window.ArcadeI18n.t("common.youLose") + "</span>";
    } else {
      resultBanner.innerHTML = '<span class="overlay-win">' + window.ArcadeI18n.t("common.tie") + "</span>";
    }
    refreshHud();
  }

  restartBtn.addEventListener("click", newGame);
  newGame();
})();
