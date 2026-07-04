(function () {
  var GAME_ID = "chess-vs-ai";
  var SIZE = 8;

  var boardEl = document.getElementById("board");
  var movesEl = document.getElementById("moves");
  var turnStat = document.getElementById("turn-stat");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");

  var SYMBOLS = {
    white: { k: "♔", q: "♕", r: "♖", b: "♗", n: "♘", p: "♙" },
    black: { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" }
  };
  var VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };

  var KNIGHT_OFFSETS = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
  var KING_OFFSETS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
  var DIAG_DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  var ORTHO_DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  var board, turn, over, moves, selected;

  function inBounds(r, c) { return r >= 0 && r < SIZE && c >= 0 && c < SIZE; }
  function isDark(r, c) { return (r + c) % 2 === 1; }

  function newGame() {
    board = [];
    for (var r = 0; r < SIZE; r++) {
      var row = [];
      for (var c = 0; c < SIZE; c++) row.push(null);
      board.push(row);
    }
    var backRank = ["r", "n", "b", "q", "k", "b", "n", "r"];
    for (var c2 = 0; c2 < SIZE; c2++) {
      board[0][c2] = { type: backRank[c2], color: "black" };
      board[1][c2] = { type: "p", color: "black" };
      board[6][c2] = { type: "p", color: "white" };
      board[7][c2] = { type: backRank[c2], color: "white" };
    }
    turn = "white";
    over = false;
    moves = 0;
    selected = null;
    resultBanner.innerHTML = "";
    refreshHud();
    render();
  }

  function refreshHud() {
    movesEl.textContent = moves;
    if (!over) {
      turnStat.textContent = turn === "white" ? window.ArcadeI18n.t("common.yourTurn") : window.ArcadeI18n.t("common.cpuTurn");
    }
  }

  function stepMoves(b, r, c, color, offsets) {
    var res = [];
    offsets.forEach(function (o) {
      var rr = r + o[0], cc = c + o[1];
      if (inBounds(rr, cc)) {
        var occ = b[rr][cc];
        if (!occ || occ.color !== color) res.push([rr, cc]);
      }
    });
    return res;
  }

  function slide(b, r, c, color, dirs) {
    var res = [];
    dirs.forEach(function (d) {
      var rr = r + d[0], cc = c + d[1];
      while (inBounds(rr, cc)) {
        var occ = b[rr][cc];
        if (!occ) {
          res.push([rr, cc]);
        } else {
          if (occ.color !== color) res.push([rr, cc]);
          break;
        }
        rr += d[0]; cc += d[1];
      }
    });
    return res;
  }

  function pawnMoves(b, r, c, color) {
    var dir = color === "white" ? -1 : 1;
    var startRow = color === "white" ? 6 : 1;
    var res = [];
    var oneR = r + dir;
    if (inBounds(oneR, c) && !b[oneR][c]) {
      res.push([oneR, c]);
      var twoR = r + 2 * dir;
      if (r === startRow && !b[twoR][c]) res.push([twoR, c]);
    }
    [c - 1, c + 1].forEach(function (cc) {
      if (inBounds(oneR, cc)) {
        var occ = b[oneR][cc];
        if (occ && occ.color !== color) res.push([oneR, cc]);
      }
    });
    return res;
  }

  function pieceMoves(b, r, c) {
    var p = b[r][c];
    if (!p) return [];
    switch (p.type) {
      case "p": return pawnMoves(b, r, c, p.color);
      case "n": return stepMoves(b, r, c, p.color, KNIGHT_OFFSETS);
      case "b": return slide(b, r, c, p.color, DIAG_DIRS);
      case "r": return slide(b, r, c, p.color, ORTHO_DIRS);
      case "q": return slide(b, r, c, p.color, DIAG_DIRS.concat(ORTHO_DIRS));
      case "k": return stepMoves(b, r, c, p.color, KING_OFFSETS);
      default: return [];
    }
  }

  function allMovesFor(b, color) {
    var res = [];
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        var p = b[r][c];
        if (p && p.color === color) {
          pieceMoves(b, r, c).forEach(function (to) {
            res.push({ from: [r, c], to: to });
          });
        }
      }
    }
    return res;
  }

  function movePiece(from, to) {
    var p = board[from[0]][from[1]];
    var captured = board[to[0]][to[1]];
    board[from[0]][from[1]] = null;
    board[to[0]][to[1]] = p;
    if (p.type === "p") {
      if ((p.color === "white" && to[0] === 0) || (p.color === "black" && to[0] === SIZE - 1)) {
        p.type = "q";
      }
    }
    return captured;
  }

  function render() {
    boardEl.innerHTML = "";
    var legalDests = [];
    if (selected) {
      legalDests = pieceMoves(board, selected[0], selected[1]);
    }
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        var cell = document.createElement("div");
        cell.className = "cell " + (isDark(r, c) ? "dark" : "light");
        if (selected && selected[0] === r && selected[1] === c) cell.className += " selected";
        if (legalDests.some(function (d) { return d[0] === r && d[1] === c; })) cell.className += " legal-move";
        var piece = board[r][c];
        if (piece) {
          var span = document.createElement("span");
          span.className = piece.color === "white" ? "piece-white" : "piece-black";
          span.textContent = SYMBOLS[piece.color][piece.type];
          cell.appendChild(span);
        }
        (function (rr, cc) {
          cell.addEventListener("click", function () { handleClick(rr, cc); });
        })(r, c);
        boardEl.appendChild(cell);
      }
    }
  }

  function handleClick(r, c) {
    if (over || turn !== "white") return;
    var piece = board[r][c];

    if (selected) {
      var dests = pieceMoves(board, selected[0], selected[1]);
      var isDest = dests.some(function (d) { return d[0] === r && d[1] === c; });
      if (isDest) {
        var captured = movePiece(selected, [r, c]);
        moves++;
        selected = null;
        refreshHud();
        render();
        if (captured && captured.type === "k") {
          endGame("white");
          return;
        }
        turn = "black";
        refreshHud();
        setTimeout(cpuTurn, 500);
        return;
      }
      if (piece && piece.color === "white") {
        selected = [r, c];
        render();
        return;
      }
      selected = null;
      render();
      return;
    }

    if (piece && piece.color === "white") {
      selected = [r, c];
      render();
    }
  }

  function cpuTurn() {
    if (over) return;
    var candidates = allMovesFor(board, "black");
    if (candidates.length === 0) {
      resultBanner.innerHTML = '<span class="overlay-win">' + window.ArcadeI18n.t("common.tie") + "</span>";
      over = true;
      refreshHud();
      return;
    }
    var captureMoves = candidates.filter(function (m) {
      var target = board[m.to[0]][m.to[1]];
      return !!target;
    });
    var chosen;
    if (captureMoves.length > 0) {
      var maxVal = -1;
      captureMoves.forEach(function (m) {
        var target = board[m.to[0]][m.to[1]];
        var val = VALUE[target.type] || 0;
        if (val > maxVal) maxVal = val;
      });
      var bestCaptures = captureMoves.filter(function (m) {
        var target = board[m.to[0]][m.to[1]];
        return (VALUE[target.type] || 0) === maxVal;
      });
      chosen = window.ArcadeCommon.pick(bestCaptures);
    } else {
      chosen = window.ArcadeCommon.pick(candidates);
    }
    var captured = movePiece(chosen.from, chosen.to);
    moves++;
    render();
    refreshHud();
    if (captured && captured.type === "k") {
      endGame("black");
      return;
    }
    turn = "white";
    refreshHud();
  }

  function endGame(winner) {
    over = true;
    if (winner === "white") {
      resultBanner.innerHTML = '<span class="overlay-win">' + window.ArcadeI18n.t("common.youWin") + "</span>";
    } else {
      resultBanner.innerHTML = '<span class="overlay-lose">' + window.ArcadeI18n.t("common.youLose") + "</span>";
    }
    refreshHud();
    render();
  }

  restartBtn.addEventListener("click", newGame);
  newGame();
})();
