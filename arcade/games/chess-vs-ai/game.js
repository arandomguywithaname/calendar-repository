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

  var KNIGHT_OFFSETS = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
  var KING_OFFSETS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
  var DIAG_DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  var ORTHO_DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  var board, turn, over, moves, selected;
  var thinking = false;

  var ELO_KEY = "arcade.chess.elo";
  var eloInput = document.getElementById("elo-slider");
  var eloLabel = document.getElementById("elo-value");
  var eloTier = document.getElementById("elo-tier");

  function currentElo() {
    return eloInput ? parseInt(eloInput.value, 10) : 1200;
  }

  // Plain-language name for the number, so the slider means something before
  // you know what a rating is.
  function tierName(elo) {
    if (elo < 500) return "Just learning";
    if (elo < 800) return "Beginner";
    if (elo < 1100) return "Getting there";
    if (elo < 1400) return "Club player";
    if (elo < 1700) return "Strong";
    return "Very strong";
  }

  function syncElo() {
    if (!eloInput) return;
    var elo = currentElo();
    if (eloLabel) eloLabel.textContent = elo;
    if (eloTier) eloTier.textContent = tierName(elo);
    try { localStorage.setItem(ELO_KEY, String(elo)); } catch (e) {}
  }

  if (eloInput) {
    var saved = null;
    try { saved = localStorage.getItem(ELO_KEY); } catch (e) {}
    if (saved && !isNaN(parseInt(saved, 10))) eloInput.value = saved;
    eloInput.addEventListener("input", syncElo);
    syncElo();
  }

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
      turnStat.textContent = thinking
        ? "Thinking…"
        : (turn === "white" ? window.ArcadeI18n.t("common.yourTurn") : window.ArcadeI18n.t("common.cpuTurn"));
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

  // ---------- engine ----------
  //
  // The old opponent had no lookahead whatsoever: if a capture existed it
  // grabbed the biggest one, otherwise it played a RANDOM legal move. That is
  // why it felt like two different players - it would snap off a hanging queen
  // like a grandmaster and then shuffle a rook into nothing on the next move.
  // It also never noticed its own pieces being attacked, and would happily
  // take a pawn defended by a queen.
  //
  // This is a real (if small) engine: alpha-beta search over material,
  // piece-square tables and mobility. Strength is set by one slider instead of
  // being a coin flip.

  // Centipawns. The king is huge so that losing it dominates everything -
  // this game ends on king capture rather than checkmate, so "don't let the
  // king be taken" falls out of the search for free.
  var CP = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };

  // Piece-square tables, written from White's point of view (row 0 = Black's
  // back rank). They are what stop the engine shuffling pieces aimlessly:
  // knights want the middle, pawns want to advance, the king wants to hide.
  var PST = {
    p: [[0,0,0,0,0,0,0,0],[5,10,10,-20,-20,10,10,5],[5,-5,-10,0,0,-10,-5,5],
        [0,0,0,20,20,0,0,0],[5,5,10,25,25,10,5,5],[10,10,20,30,30,20,10,10],
        [50,50,50,50,50,50,50,50],[0,0,0,0,0,0,0,0]],
    n: [[-50,-40,-30,-30,-30,-30,-40,-50],[-40,-20,0,5,5,0,-20,-40],
        [-30,5,10,15,15,10,5,-30],[-30,0,15,20,20,15,0,-30],
        [-30,5,15,20,20,15,5,-30],[-30,0,10,15,15,10,0,-30],
        [-40,-20,0,0,0,0,-20,-40],[-50,-40,-30,-30,-30,-30,-40,-50]],
    b: [[-20,-10,-10,-10,-10,-10,-10,-20],[-10,5,0,0,0,0,5,-10],
        [-10,10,10,10,10,10,10,-10],[-10,0,10,10,10,10,0,-10],
        [-10,5,5,10,10,5,5,-10],[-10,0,5,10,10,5,0,-10],
        [-10,0,0,0,0,0,0,-10],[-20,-10,-10,-10,-10,-10,-10,-20]],
    r: [[0,0,0,5,5,0,0,0],[-5,0,0,0,0,0,0,-5],[-5,0,0,0,0,0,0,-5],
        [-5,0,0,0,0,0,0,-5],[-5,0,0,0,0,0,0,-5],[-5,0,0,0,0,0,0,-5],
        [5,10,10,10,10,10,10,5],[0,0,0,0,0,0,0,0]],
    q: [[-20,-10,-10,-5,-5,-10,-10,-20],[-10,0,5,0,0,0,0,-10],
        [-10,5,5,5,5,5,0,-10],[0,0,5,5,5,5,0,-5],[-5,0,5,5,5,5,0,-5],
        [-10,0,5,5,5,5,0,-10],[-10,0,0,0,0,0,0,-10],
        [-20,-10,-10,-5,-5,-10,-10,-20]],
    k: [[20,30,10,0,0,10,30,20],[20,20,0,0,0,0,20,20],
        [-10,-20,-20,-20,-20,-20,-20,-10],[-20,-30,-30,-40,-40,-30,-30,-20],
        [-30,-40,-40,-50,-50,-40,-40,-30],[-30,-40,-40,-50,-50,-40,-40,-30],
        [-30,-40,-40,-50,-50,-40,-40,-30],[-30,-40,-40,-50,-50,-40,-40,-30]]
  };

  // Positive = good for Black (the engine's side).
  function evaluate(b) {
    var score = 0;
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        var p = b[r][c];
        if (!p) continue;
        var val = CP[p.type] + PST[p.type][p.color === "white" ? SIZE - 1 - r : r][c];
        score += (p.color === "black") ? val : -val;
      }
    }
    return score;
  }

  function doMove(b, m) {
    var piece = b[m.from[0]][m.from[1]];
    var captured = b[m.to[0]][m.to[1]];
    b[m.from[0]][m.from[1]] = null;
    var promoted = piece.type === "p" &&
      ((piece.color === "white" && m.to[0] === 0) || (piece.color === "black" && m.to[0] === SIZE - 1));
    b[m.to[0]][m.to[1]] = promoted ? { type: "q", color: piece.color } : piece;
    return { piece: piece, captured: captured };
  }

  function undoMove(b, m, u) {
    b[m.from[0]][m.from[1]] = u.piece;
    b[m.to[0]][m.to[1]] = u.captured;
  }

  // Captures first, biggest prize first. Ordering is what makes alpha-beta
  // actually cut branches, so this is a speed feature, not a strength one.
  function orderMoves(b, list) {
    return list.map(function (m) {
      var t = b[m.to[0]][m.to[1]];
      return { m: m, s: t ? CP[t.type] : 0 };
    }).sort(function (a, z) { return z.s - a.s; }).map(function (x) { return x.m; });
  }

  function kingAlive(b, color) {
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        var p = b[r][c];
        if (p && p.type === "k" && p.color === color) return true;
      }
    }
    return false;
  }

  // Negamax with alpha-beta. Returns the score from `color`'s point of view.
  function search(b, depth, alpha, beta, color) {
    if (!kingAlive(b, "black")) return color === "black" ? -CP.k : CP.k;
    if (!kingAlive(b, "white")) return color === "black" ? CP.k : -CP.k;
    if (depth === 0) return color === "black" ? evaluate(b) : -evaluate(b);

    var list = orderMoves(b, allMovesFor(b, color));
    if (list.length === 0) return 0; // stalemated in this simplified game
    var best = -Infinity;
    var other = color === "black" ? "white" : "black";
    for (var i = 0; i < list.length; i++) {
      var u = doMove(b, list[i]);
      var sc = -search(b, depth - 1, -beta, -alpha, other);
      undoMove(b, list[i], u);
      if (sc > best) best = sc;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;   // this branch is already refuted
    }
    return best;
  }

  // ---------- strength dial ----------
  //
  // These numbers are calibrated by self-play, not guessed: see the ladder
  // check in the commit. `slack` is how many centipawns worse than the best
  // move the engine is willing to play, and `blunder` is the chance it throws
  // the search away entirely and plays something random. Both shrink as the
  // slider goes up, so low ratings are gently bad rather than insane, and high
  // ratings are consistent instead of streaky.
  var ELO_MIN = 250, ELO_MAX = 2000;

  function eloConfig(elo) {
    var t = (elo - ELO_MIN) / (ELO_MAX - ELO_MIN); // 0..1
    var depth = elo < 700 ? 1 : elo < 1200 ? 2 : elo < 1600 ? 3 : elo < 1900 ? 4 : 5;
    return {
      depth: depth,
      slack: Math.round(400 * Math.pow(1 - t, 2)),
      blunder: Math.max(0, 0.40 * Math.pow(1 - t, 1.6))
    };
  }

  function chooseMove(b, elo) {
    var cfg = eloConfig(elo);
    var list = allMovesFor(b, "black");
    if (list.length === 0) return null;

    if (Math.random() < cfg.blunder) return window.ArcadeCommon.pick(list);

    var scored = [];
    var best = -Infinity;
    var ordered = orderMoves(b, list);
    for (var i = 0; i < ordered.length; i++) {
      var u = doMove(b, ordered[i]);
      var sc = -search(b, cfg.depth - 1, -Infinity, Infinity, "white");
      undoMove(b, ordered[i], u);
      scored.push({ m: ordered[i], s: sc });
      if (sc > best) best = sc;
    }
    // Anything within `slack` of the best move is fair game, which is what
    // makes a low rating play plausibly-weak moves rather than nonsense.
    var pool = scored.filter(function (x) { return x.s >= best - cfg.slack; });
    return window.ArcadeCommon.pick(pool).m;
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
    // Ignore clicks while the engine is searching, or a fast tapper could move
    // twice off one position and desync the board.
    if (over || thinking || turn !== "white") return;
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
    if (allMovesFor(board, "black").length === 0) {
      resultBanner.innerHTML = '<span class="overlay-win">' + window.ArcadeI18n.t("common.tie") + "</span>";
      over = true;
      refreshHud();
      return;
    }
    // Searching deeply can take a moment on a phone, so hand the browser a
    // frame to paint "Thinking..." before we start crunching.
    thinking = true;
    refreshHud();
    setTimeout(function () {
      var chosen = chooseMove(board, currentElo());
      thinking = false;
      if (!chosen || over) { refreshHud(); return; }
      var captured = movePiece(chosen.from, chosen.to);
      moves++;
      render();
      if (captured && captured.type === "k") {
        endGame("black");
        return;
      }
      turn = "white";
      refreshHud();
    }, 20);
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
