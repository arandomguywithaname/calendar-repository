(function () {
  var GAME_ID = "reversi";
  var boardEl = document.getElementById("board");
  var blackScoreEl = document.getElementById("black-score");
  var whiteScoreEl = document.getElementById("white-score");
  var bestEl = document.getElementById("best");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");

  var SIZE = 8;
  var DIRS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];

  var board, turn, over;

  function idx(r, c) { return r * SIZE + c; }
  function inBounds(r, c) { return r >= 0 && r < SIZE && c >= 0 && c < SIZE; }
  function opponent(color) { return color === "B" ? "W" : "B"; }

  function getFlips(b, r, c, color) {
    if (b[idx(r, c)]) return [];
    var allFlips = [];
    DIRS.forEach(function (d) {
      var line = [];
      var rr = r + d[0], cc = c + d[1];
      while (inBounds(rr, cc) && b[idx(rr, cc)] === opponent(color)) {
        line.push(idx(rr, cc));
        rr += d[0];
        cc += d[1];
      }
      if (line.length > 0 && inBounds(rr, cc) && b[idx(rr, cc)] === color) {
        allFlips = allFlips.concat(line);
      }
    });
    return allFlips;
  }

  function validMoves(b, color) {
    var moves = [];
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        if (!b[idx(r, c)]) {
          var flips = getFlips(b, r, c, color);
          if (flips.length > 0) moves.push({ r: r, c: c, flips: flips });
        }
      }
    }
    return moves;
  }

  function applyMove(b, move, color) {
    b[idx(move.r, move.c)] = color;
    move.flips.forEach(function (i) { b[i] = color; });
  }

  function counts() {
    var black = 0, white = 0;
    board.forEach(function (v) {
      if (v === "B") black++;
      else if (v === "W") white++;
    });
    return { black: black, white: white };
  }

  function refreshHud() {
    var c = counts();
    blackScoreEl.textContent = c.black;
    whiteScoreEl.textContent = c.white;
    var best = window.ArcadeCommon.getBest(GAME_ID);
    bestEl.textContent = best === null ? 0 : best;
  }

  function newGame() {
    board = new Array(SIZE * SIZE).fill(null);
    board[idx(3, 3)] = "W";
    board[idx(3, 4)] = "B";
    board[idx(4, 3)] = "B";
    board[idx(4, 4)] = "W";
    turn = "B";
    over = false;
    resultBanner.innerHTML = "";
    refreshHud();
    render();
  }

  function render() {
    boardEl.innerHTML = "";
    var moves = (!over && turn === "B") ? validMoves(board, "B") : [];
    var validSet = {};
    moves.forEach(function (m) { validSet[idx(m.r, m.c)] = m; });
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        (function (r, c) {
          var i = idx(r, c);
          var cell = document.createElement("div");
          var cls = "cell";
          if (validSet[i]) cls += " valid";
          cell.className = cls;
          cell.textContent = board[i] === "B" ? "⚫" : board[i] === "W" ? "⚪" : "";
          cell.addEventListener("click", function () { handleClick(r, c); });
          boardEl.appendChild(cell);
        })(r, c);
      }
    }
  }

  function handleClick(r, c) {
    if (over || turn !== "B") return;
    var flips = getFlips(board, r, c, "B");
    if (flips.length === 0) return;
    applyMove(board, { r: r, c: c, flips: flips }, "B");
    refreshHud();
    afterMove("B");
  }

  function afterMove(justMoved) {
    var other = opponent(justMoved);
    var otherMoves = validMoves(board, other);
    if (otherMoves.length > 0) {
      turn = other;
      render();
      if (other === "W") setTimeout(cpuMove, 450);
      return;
    }
    var selfMoves = validMoves(board, justMoved);
    if (selfMoves.length > 0) {
      window.ArcadeCommon.toast((other === "B" ? "You have" : "CPU has") + " no valid moves — turn passes");
      turn = justMoved;
      render();
      if (justMoved === "W") setTimeout(cpuMove, 450);
      return;
    }
    endGame();
  }

  function cpuMove() {
    if (over) return;
    var moves = validMoves(board, "W");
    if (moves.length === 0) {
      afterMove("W");
      return;
    }
    var best = moves[0];
    moves.forEach(function (m) {
      if (m.flips.length > best.flips.length) best = m;
    });
    applyMove(board, best, "W");
    refreshHud();
    afterMove("W");
  }

  function endGame() {
    over = true;
    var c = counts();
    var scoreForBest = c.black;
    var improved = window.ArcadeCommon.setBest(GAME_ID, scoreForBest);
    var msg;
    if (c.black > c.white) msg = window.ArcadeI18n.t("common.youWin");
    else if (c.white > c.black) msg = window.ArcadeI18n.t("common.youLose");
    else msg = window.ArcadeI18n.t("common.tie");
    var cls = c.black > c.white ? "overlay-win" : (c.white > c.black ? "overlay-lose" : "overlay-win");
    resultBanner.innerHTML = '<span class="' + cls + '">' + msg + " — " + c.black + " to " + c.white +
      (improved ? " 🏆" : "") + "</span>";
    refreshHud();
    render();
  }

  restartBtn.addEventListener("click", newGame);
  newGame();
})();
