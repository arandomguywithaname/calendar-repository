(function () {
  var GAME_ID = "connect-four";
  var boardEl = document.getElementById("board");
  var columnsEl = document.getElementById("columns");
  var scoreEl = document.getElementById("score");
  var bestEl = document.getElementById("best");
  var turnStat = document.getElementById("turn-stat");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");
  var diffEl = document.getElementById("difficulty");

  var ROWS = 6, COLS = 7;
  var EMPTY = 0, PLAYER = 1, CPU = 2;

  // Per-difficulty CPU strength. Easy plays mostly random, Medium takes/blocks
  // obvious wins, Hard looks a couple moves ahead with minimax.
  var DIFFICULTIES = {
    easy: { mode: "random" },
    medium: { mode: "block" },
    hard: { mode: "minimax", depth: 5 }
  };
  var cfg = DIFFICULTIES.medium;

  var board, over, score, busy, winLine;

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
    winLine = null;
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
        if (v === PLAYER) { cell.classList.add("disc-red"); }
        else if (v === CPU) { cell.classList.add("disc-yellow"); }
        if (winLine && winLine.some(function (p) { return p[0] === r && p[1] === c; })) {
          cell.classList.add("win");
        }
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

  function findWinningMove(b, piece) {
    var cols = getValidCols(b);
    for (var i = 0; i < cols.length; i++) {
      var col = cols[i], r = findOpenRow(b, col);
      var nb = cloneBoard(b);
      nb[r][col] = piece;
      if (checkWinAt(nb, piece)) return col;
    }
    return null;
  }

  function chooseCpuCol() {
    var valid = getValidCols(board);
    if (!valid.length) return null;
    if (cfg.mode === "random") {
      // Mostly random, but grab a free winning drop if one is sitting there.
      if (Math.random() < 0.35) {
        var w = findWinningMove(board, CPU);
        if (w !== null) return w;
      }
      return window.ArcadeCommon.pick(valid);
    }
    if (cfg.mode === "block") {
      var win = findWinningMove(board, CPU);
      if (win !== null) return win;
      var block = findWinningMove(board, PLAYER);
      if (block !== null) return block;
      var center = Math.floor(COLS / 2);
      if (valid.indexOf(center) !== -1 && Math.random() < 0.6) return center;
      return window.ArcadeCommon.pick(valid);
    }
    var result = minimax(board, cfg.depth || 5, -Infinity, Infinity, true);
    var col = result.col;
    if (col === null || !isValidCol(board, col)) col = valid[0];
    return col;
  }

  function getWinningLine(b, piece) {
    var dirs = [[0, 1], [1, 0], [1, 1], [-1, 1]];
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        if (b[r][c] !== piece) continue;
        for (var d = 0; d < dirs.length; d++) {
          var dr = dirs[d][0], dc = dirs[d][1];
          var cells = [[r, c]];
          for (var k = 1; k < 4; k++) {
            var nr = r + dr * k, nc = c + dc * k;
            if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS || b[nr][nc] !== piece) break;
            cells.push([nr, nc]);
          }
          if (cells.length === 4) return cells;
        }
      }
    }
    return null;
  }

  function burst() {
    boardEl.style.position = "relative";
    var cx = boardEl.clientWidth / 2, cy = boardEl.clientHeight / 2;
    var colors = ["#ff5d5d", "#ffd23f", "#29e0c9", "#7c5cff"];
    for (var i = 0; i < 26; i++) {
      var p = document.createElement("div");
      p.className = "c4-particle";
      p.style.left = cx + "px";
      p.style.top = cy + "px";
      var col = colors[i % colors.length];
      p.style.background = col;
      p.style.boxShadow = "0 0 8px " + col;
      boardEl.appendChild(p);
      var ang = Math.random() * Math.PI * 2, spd = 2 + Math.random() * 4.5;
      animateParticle(p, Math.cos(ang) * spd, Math.sin(ang) * spd);
    }
  }

  function animateParticle(p, vx, vy) {
    var x = 0, y = 0, life = 1;
    function step() {
      x += vx; y += vy; vy += 0.15; life -= 0.028;
      p.style.transform = "translate(" + x + "px," + y + "px)";
      p.style.opacity = Math.max(0, life);
      if (life > 0) requestAnimationFrame(step);
      else if (p.parentNode) p.parentNode.removeChild(p);
    }
    requestAnimationFrame(step);
  }

  function cpuMove() {
    var col = chooseCpuCol();
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
      winLine = getWinningLine(board, PLAYER);
      render();
      burst();
      resultBanner.innerHTML = '<span class="overlay-win">' + window.ArcadeI18n.t("common.youWin") + "</span>";
    } else if (who === "cpu") {
      winLine = getWinningLine(board, CPU);
      render();
      resultBanner.innerHTML = '<span class="overlay-lose">' + window.ArcadeI18n.t("common.youLose") + "</span>";
    } else {
      resultBanner.innerHTML = '<span class="overlay-win">' + window.ArcadeI18n.t("common.tie") + "</span>";
    }
    refreshHud();
  }

  restartBtn.addEventListener("click", newGame);

  // Difficulty selector - changing CPU strength starts a fresh game.
  window.ArcadeCommon.mountDifficulty(diffEl, GAME_ID, {
    defaultKey: "medium",
    onChange: function (level) {
      cfg = DIFFICULTIES[level] || DIFFICULTIES.medium;
      newGame();
    }
  });
})();
