(function () {
  var GAME_ID = "checkers";
  var SIZE = 8;

  var boardEl = document.getElementById("board");
  var movesEl = document.getElementById("moves");
  var turnStat = document.getElementById("turn-stat");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");

  var board, turn, over, moves, selected, mustContinue;

  function isPlayable(r, c) {
    return (r + c) % 2 === 1;
  }
  function inBounds(r, c) {
    return r >= 0 && r < SIZE && c >= 0 && c < SIZE;
  }
  function cloneBoard(b) {
    return b.map(function (row) { return row.map(function (cell) { return cell ? { color: cell.color, king: cell.king } : null; }); });
  }

  function newGame() {
    board = [];
    for (var r = 0; r < SIZE; r++) {
      var row = [];
      for (var c = 0; c < SIZE; c++) {
        if (isPlayable(r, c) && r <= 2) row.push({ color: "red", king: false });
        else if (isPlayable(r, c) && r >= 5) row.push({ color: "black", king: false });
        else row.push(null);
      }
      board.push(row);
    }
    turn = "red";
    over = false;
    moves = 0;
    selected = null;
    mustContinue = false;
    resultBanner.innerHTML = "";
    refreshHud();
    render();
  }

  function refreshHud() {
    movesEl.textContent = moves;
    if (!over) {
      turnStat.textContent = turn === "red" ? window.ArcadeI18n.t("common.yourTurn") : window.ArcadeI18n.t("common.cpuTurn");
    }
  }

  function forwardDirs(color) {
    return color === "red" ? [[1, -1], [1, 1]] : [[-1, -1], [-1, 1]];
  }
  function allDirs() {
    return [[1, -1], [1, 1], [-1, -1], [-1, 1]];
  }

  function pieceCapturesFrom(b, r, c, color, king) {
    var dirs = king ? allDirs() : forwardDirs(color);
    var caps = [];
    dirs.forEach(function (d) {
      var mr = r + d[0], mc = c + d[1];
      var lr = r + d[0] * 2, lc = c + d[1] * 2;
      if (inBounds(lr, lc) && isPlayable(lr, lc) && b[lr][lc] === null &&
          inBounds(mr, mc) && b[mr][mc] && b[mr][mc].color !== color) {
        caps.push({ to: [lr, lc], captured: [mr, mc] });
      }
    });
    return caps;
  }

  function pieceSimpleMoves(b, r, c, color, king) {
    var dirs = king ? allDirs() : forwardDirs(color);
    var moves = [];
    dirs.forEach(function (d) {
      var tr = r + d[0], tc = c + d[1];
      if (inBounds(tr, tc) && isPlayable(tr, tc) && b[tr][tc] === null) {
        moves.push({ to: [tr, tc] });
      }
    });
    return moves;
  }

  function colorHasAnyCapture(b, color) {
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        var p = b[r][c];
        if (p && p.color === color && pieceCapturesFrom(b, r, c, color, p.king).length > 0) return true;
      }
    }
    return false;
  }

  function collectChains(b, r, c, color, king) {
    var caps = pieceCapturesFrom(b, r, c, color, king);
    if (caps.length === 0) return [[]];
    var chains = [];
    caps.forEach(function (cap) {
      var nb = cloneBoard(b);
      nb[r][c] = null;
      nb[cap.captured[0]][cap.captured[1]] = null;
      var newKing = king;
      var promoted = false;
      if (!king) {
        if ((color === "red" && cap.to[0] === SIZE - 1) || (color === "black" && cap.to[0] === 0)) {
          newKing = true;
          promoted = true;
        }
      }
      nb[cap.to[0]][cap.to[1]] = { color: color, king: newKing };
      var step = { from: [r, c], to: cap.to, captured: cap.captured };
      if (promoted) {
        chains.push([step]);
      } else {
        var subChains = collectChains(nb, cap.to[0], cap.to[1], color, newKing);
        subChains.forEach(function (sc) { chains.push([step].concat(sc)); });
      }
    });
    return chains;
  }

  function colorHasAnyMove(b, color) {
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        var p = b[r][c];
        if (p && p.color === color) {
          if (pieceCapturesFrom(b, r, c, color, p.king).length > 0) return true;
          if (pieceSimpleMoves(b, r, c, color, p.king).length > 0) return true;
        }
      }
    }
    return false;
  }

  function countPieces(b, color) {
    var n = 0;
    for (var r = 0; r < SIZE; r++) for (var c = 0; c < SIZE; c++) if (b[r][c] && b[r][c].color === color) n++;
    return n;
  }

  function render() {
    boardEl.innerHTML = "";
    var legalDests = [];
    if (selected) {
      var p = board[selected[0]][selected[1]];
      var caps = pieceCapturesFrom(board, selected[0], selected[1], p.color, p.king);
      if (caps.length > 0) {
        legalDests = caps.map(function (cp) { return cp.to; });
      } else if (!mustContinue) {
        legalDests = pieceSimpleMoves(board, selected[0], selected[1], p.color, p.king).map(function (m) { return m.to; });
      }
    }
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        var cell = document.createElement("div");
        var playable = isPlayable(r, c);
        cell.className = "cell " + (playable ? "dark" : "light");
        if (selected && selected[0] === r && selected[1] === c) cell.className += " selected";
        if (legalDests.some(function (d) { return d[0] === r && d[1] === c; })) cell.className += " legal-move";
        var piece = board[r][c];
        if (piece) {
          var span = document.createElement("span");
          span.className = piece.color === "red" ? "piece-red" : "piece-black";
          span.textContent = piece.king ? "♛" : "●";
          cell.appendChild(span);
        }
        if (playable) {
          (function (rr, cc) {
            cell.addEventListener("click", function () { handleClick(rr, cc); });
          })(r, c);
        }
        boardEl.appendChild(cell);
      }
    }
  }

  function handleClick(r, c) {
    if (over || turn !== "red") return;
    var piece = board[r][c];

    if (selected) {
      var sp = board[selected[0]][selected[1]];
      var caps = pieceCapturesFrom(board, selected[0], selected[1], sp.color, sp.king);
      var isCapMove = caps.some(function (cp) { return cp.to[0] === r && cp.to[1] === c; });
      if (isCapMove) {
        var cap = caps.filter(function (cp) { return cp.to[0] === r && cp.to[1] === c; })[0];
        applyMove(selected, cap.to, cap.captured);
        moves++;
        var newPiece = board[r][c];
        var stillMustCapture = pieceCapturesFrom(board, r, c, newPiece.color, newPiece.king).length > 0;
        if (stillMustCapture) {
          selected = [r, c];
          mustContinue = true;
          refreshHud();
          render();
          return;
        }
        selected = null;
        mustContinue = false;
        refreshHud();
        endTurnCheckAndSwitch();
        return;
      }
      if (!mustContinue && !caps.length) {
        var simple = pieceSimpleMoves(board, selected[0], selected[1], sp.color, sp.king);
        var isSimple = simple.some(function (m) { return m.to[0] === r && m.to[1] === c; });
        if (isSimple) {
          applyMove(selected, [r, c], null);
          moves++;
          selected = null;
          refreshHud();
          endTurnCheckAndSwitch();
          return;
        }
      }
      if (!mustContinue && piece && piece.color === "red") {
        selectIfLegal(r, c);
        return;
      }
      if (!mustContinue) {
        selected = null;
        render();
      }
      return;
    }

    if (piece && piece.color === "red") {
      selectIfLegal(r, c);
    }
  }

  function selectIfLegal(r, c) {
    var hasGlobalCapture = colorHasAnyCapture(board, "red");
    var piece = board[r][c];
    if (hasGlobalCapture) {
      if (pieceCapturesFrom(board, r, c, piece.color, piece.king).length === 0) {
        window.ArcadeCommon.toast("A capture is available — you must take it.");
        return;
      }
    } else {
      if (pieceSimpleMoves(board, r, c, piece.color, piece.king).length === 0) {
        return;
      }
    }
    selected = [r, c];
    render();
  }

  function applyMove(from, to, captured) {
    var p = board[from[0]][from[1]];
    board[from[0]][from[1]] = null;
    if (captured) board[captured[0]][captured[1]] = null;
    var king = p.king;
    if (!king) {
      if ((p.color === "red" && to[0] === SIZE - 1) || (p.color === "black" && to[0] === 0)) king = true;
    }
    board[to[0]][to[1]] = { color: p.color, king: king };
    render();
  }

  function endTurnCheckAndSwitch() {
    if (countPieces(board, "black") === 0 || !colorHasAnyMove(board, "black")) {
      endGame("red");
      return;
    }
    turn = "black";
    refreshHud();
    render();
    setTimeout(cpuTurn, 500);
  }

  function cpuTurn() {
    if (over) return;
    var allChains = [];
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        var p = board[r][c];
        if (p && p.color === "black") {
          var chains = collectChains(board, r, c, "black", p.king);
          chains.forEach(function (chain) { if (chain.length > 0) allChains.push(chain); });
        }
      }
    }
    if (allChains.length > 0) {
      var maxLen = Math.max.apply(null, allChains.map(function (ch) { return ch.length; }));
      var best = allChains.filter(function (ch) { return ch.length === maxLen; });
      var chosen = window.ArcadeCommon.pick(best);
      chosen.forEach(function (step) {
        applyMove(step.from, step.to, step.captured);
      });
    } else {
      var allMoves = [];
      for (var r2 = 0; r2 < SIZE; r2++) {
        for (var c2 = 0; c2 < SIZE; c2++) {
          var p2 = board[r2][c2];
          if (p2 && p2.color === "black") {
            pieceSimpleMoves(board, r2, c2, "black", p2.king).forEach(function (m) {
              allMoves.push({ from: [r2, c2], to: m.to });
            });
          }
        }
      }
      if (allMoves.length === 0) {
        endGame("red");
        return;
      }
      var mv = window.ArcadeCommon.pick(allMoves);
      applyMove(mv.from, mv.to, null);
    }
    render();
    if (countPieces(board, "red") === 0 || !colorHasAnyMove(board, "red")) {
      endGame("black");
      return;
    }
    turn = "red";
    refreshHud();
  }

  function endGame(winner) {
    over = true;
    if (winner === "red") {
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
