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

  var board, state, turn, over, moves, selected, repetition;
  var thinking = false;

  function inBounds(r, c) { return r >= 0 && r < SIZE && c >= 0 && c < SIZE; }
  function isDark(r, c) { return (r + c) % 2 === 1; }
  function other(color) { return color === "white" ? "black" : "white"; }

  // ---------- position state ----------
  //
  // Castling and en passant depend on history, not just on where the pieces
  // are, so they live alongside the board and are saved/restored by the
  // search the same way captured pieces are.

  function initialState() {
    return {
      castle: { white: { k: true, q: true }, black: { k: true, q: true } },
      ep: null,   // square a pawn may capture onto this turn, e.g. [2,4]
      half: 0     // plies since the last capture or pawn move (50-move rule)
    };
  }

  // ---------- attack detection ----------
  //
  // Worked out directly from the square rather than by generating every enemy
  // move, because castling needs to ask "is this square attacked?" while it is
  // itself being generated - going through move generation would recurse.

  function isAttacked(b, r, c, by) {
    // Pawns. A white pawn moves up the board, so one sitting a row BELOW this
    // square (and a file to either side) is attacking it.
    var pd = by === "white" ? 1 : -1;
    for (var i = 0; i < 2; i++) {
      var pr = r + pd, pc = c + (i === 0 ? -1 : 1);
      if (inBounds(pr, pc)) {
        var pp = b[pr][pc];
        if (pp && pp.color === by && pp.type === "p") return true;
      }
    }
    var j, rr, cc, q;
    for (j = 0; j < KNIGHT_OFFSETS.length; j++) {
      rr = r + KNIGHT_OFFSETS[j][0]; cc = c + KNIGHT_OFFSETS[j][1];
      if (inBounds(rr, cc)) { q = b[rr][cc]; if (q && q.color === by && q.type === "n") return true; }
    }
    for (j = 0; j < KING_OFFSETS.length; j++) {
      rr = r + KING_OFFSETS[j][0]; cc = c + KING_OFFSETS[j][1];
      if (inBounds(rr, cc)) { q = b[rr][cc]; if (q && q.color === by && q.type === "k") return true; }
    }
    function ray(dirs, types) {
      for (var d = 0; d < dirs.length; d++) {
        var ar = r + dirs[d][0], ac = c + dirs[d][1];
        while (inBounds(ar, ac)) {
          var pc2 = b[ar][ac];
          if (pc2) {
            if (pc2.color === by && types.indexOf(pc2.type) !== -1) return true;
            break;
          }
          ar += dirs[d][0]; ac += dirs[d][1];
        }
      }
      return false;
    }
    return ray(DIAG_DIRS, ["b", "q"]) || ray(ORTHO_DIRS, ["r", "q"]);
  }

  function findKing(b, color) {
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        var p = b[r][c];
        if (p && p.type === "k" && p.color === color) return [r, c];
      }
    }
    return null;
  }

  function inCheck(b, color) {
    var k = findKing(b, color);
    return k ? isAttacked(b, k[0], k[1], other(color)) : false;
  }

  // ---------- move generation ----------

  function slideTo(b, r, c, color, dirs, out) {
    dirs.forEach(function (d) {
      var rr = r + d[0], cc = c + d[1];
      while (inBounds(rr, cc)) {
        var occ = b[rr][cc];
        if (!occ) out.push({ from: [r, c], to: [rr, cc] });
        else {
          if (occ.color !== color) out.push({ from: [r, c], to: [rr, cc] });
          break;
        }
        rr += d[0]; cc += d[1];
      }
    });
  }

  function stepTo(b, r, c, color, offsets, out) {
    offsets.forEach(function (o) {
      var rr = r + o[0], cc = c + o[1];
      if (!inBounds(rr, cc)) return;
      var occ = b[rr][cc];
      if (!occ || occ.color !== color) out.push({ from: [r, c], to: [rr, cc] });
    });
  }

  function pawnTo(b, st, r, c, color, out) {
    var dir = color === "white" ? -1 : 1;
    var startRow = color === "white" ? 6 : 1;
    var lastRow = color === "white" ? 0 : SIZE - 1;
    function push(m) {
      if (m.to[0] === lastRow) m.promo = "q";
      out.push(m);
    }
    var oneR = r + dir;
    if (inBounds(oneR, c) && !b[oneR][c]) {
      push({ from: [r, c], to: [oneR, c] });
      var twoR = r + 2 * dir;
      if (r === startRow && inBounds(twoR, c) && !b[twoR][c]) {
        out.push({ from: [r, c], to: [twoR, c], double: true });
      }
    }
    [c - 1, c + 1].forEach(function (cc) {
      if (!inBounds(oneR, cc)) return;
      var occ = b[oneR][cc];
      if (occ && occ.color !== color) push({ from: [r, c], to: [oneR, cc] });
      // En passant: the square behind a pawn that has just run past us.
      else if (!occ && st.ep && st.ep[0] === oneR && st.ep[1] === cc) {
        out.push({ from: [r, c], to: [oneR, cc], ep: true });
      }
    });
  }

  function castleMoves(b, st, color, out) {
    var rights = st.castle[color];
    if (!rights.k && !rights.q) return;
    var row = color === "white" ? 7 : 0;
    var king = b[row][4];
    if (!king || king.type !== "k" || king.color !== color) return;
    // You may not castle out of check, nor through a square the enemy covers.
    if (isAttacked(b, row, 4, other(color))) return;
    if (rights.k && !b[row][5] && !b[row][6]) {
      var rookK = b[row][7];
      if (rookK && rookK.type === "r" && rookK.color === color &&
          !isAttacked(b, row, 5, other(color)) && !isAttacked(b, row, 6, other(color))) {
        out.push({ from: [row, 4], to: [row, 6], castle: "k" });
      }
    }
    if (rights.q && !b[row][1] && !b[row][2] && !b[row][3]) {
      var rookQ = b[row][0];
      if (rookQ && rookQ.type === "r" && rookQ.color === color &&
          !isAttacked(b, row, 3, other(color)) && !isAttacked(b, row, 2, other(color))) {
        out.push({ from: [row, 4], to: [row, 2], castle: "q" });
      }
    }
  }

  function pseudoMoves(b, st, color) {
    var out = [];
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        var p = b[r][c];
        if (!p || p.color !== color) continue;
        switch (p.type) {
          case "p": pawnTo(b, st, r, c, color, out); break;
          case "n": stepTo(b, r, c, color, KNIGHT_OFFSETS, out); break;
          case "b": slideTo(b, r, c, color, DIAG_DIRS, out); break;
          case "r": slideTo(b, r, c, color, ORTHO_DIRS, out); break;
          case "q": slideTo(b, r, c, color, DIAG_DIRS.concat(ORTHO_DIRS), out); break;
          case "k": stepTo(b, r, c, color, KING_OFFSETS, out); break;
        }
      }
    }
    castleMoves(b, st, color, out);
    return out;
  }

  // ---------- make / unmake ----------

  function applyMove(b, st, m) {
    var piece = b[m.from[0]][m.from[1]];
    // Rights are saved as four flat booleans rather than a nested object -
    // this runs at every node of the search, and the object churn showed up.
    var undo = {
      piece: piece,
      captured: null,
      capturedAt: null,
      wk: st.castle.white.k, wq: st.castle.white.q,
      bk: st.castle.black.k, bq: st.castle.black.q,
      ep: st.ep,
      half: st.half,
      rook: null
    };

    var capSq = m.to;
    if (m.ep) capSq = [m.from[0], m.to[1]];   // the pawn taken en passant sits beside us
    var captured = b[capSq[0]][capSq[1]];
    if (captured) { undo.captured = captured; undo.capturedAt = capSq; b[capSq[0]][capSq[1]] = null; }

    b[m.from[0]][m.from[1]] = null;
    b[m.to[0]][m.to[1]] = m.promo ? { type: m.promo, color: piece.color } : piece;

    if (m.castle) {
      var row = m.from[0];
      var fromC = m.castle === "k" ? 7 : 0;
      var toC = m.castle === "k" ? 5 : 3;
      undo.rook = { from: [row, fromC], to: [row, toC], piece: b[row][fromC] };
      b[row][toC] = b[row][fromC];
      b[row][fromC] = null;
    }

    // Rights are lost by moving the king or a rook, or by having a rook taken.
    var rights = st.castle[piece.color];
    if (piece.type === "k") { rights.k = false; rights.q = false; }
    if (piece.type === "r") {
      if (m.from[1] === 7) rights.k = false;
      if (m.from[1] === 0) rights.q = false;
    }
    if (captured && captured.type === "r") {
      var oc = st.castle[captured.color];
      if (capSq[1] === 7) oc.k = false;
      if (capSq[1] === 0) oc.q = false;
    }

    st.ep = m.double ? [(m.from[0] + m.to[0]) / 2, m.to[1]] : null;
    st.half = (captured || piece.type === "p") ? 0 : st.half + 1;
    return undo;
  }

  function undoMove(b, st, m, u) {
    b[m.from[0]][m.from[1]] = u.piece;
    b[m.to[0]][m.to[1]] = null;
    if (u.captured) b[u.capturedAt[0]][u.capturedAt[1]] = u.captured;
    if (u.rook) {
      b[u.rook.from[0]][u.rook.from[1]] = u.rook.piece;
      b[u.rook.to[0]][u.rook.to[1]] = null;
    }
    st.castle.white.k = u.wk; st.castle.white.q = u.wq;
    st.castle.black.k = u.bk; st.castle.black.q = u.bq;
    st.ep = u.ep;
    st.half = u.half;
  }

  // A move is legal only if it does not leave your own king attacked.
  function legalMoves(b, st, color) {
    var pseudo = pseudoMoves(b, st, color);
    var out = [];
    for (var i = 0; i < pseudo.length; i++) {
      var u = applyMove(b, st, pseudo[i]);
      if (!inCheck(b, color)) out.push(pseudo[i]);
      undoMove(b, st, pseudo[i], u);
    }
    return out;
  }

  // ---------- draws ----------

  function insufficientMaterial(b) {
    var minor = [];
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        var p = b[r][c];
        if (!p || p.type === "k") continue;
        if (p.type === "p" || p.type === "q" || p.type === "r") return false;
        minor.push({ type: p.type, color: p.color, dark: isDark(r, c) });
      }
    }
    if (minor.length === 0) return true;                       // K v K
    if (minor.length === 1) return true;                       // K+minor v K
    if (minor.length === 2 && minor[0].type === "b" && minor[1].type === "b" &&
        minor[0].color !== minor[1].color && minor[0].dark === minor[1].dark) {
      return true;                                             // bishops on one colour
    }
    return false;
  }

  function positionKey(b, st, color) {
    var s = color + "|";
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        var p = b[r][c];
        s += p ? (p.color === "white" ? p.type.toUpperCase() : p.type) : ".";
      }
    }
    s += "|" + (st.castle.white.k ? "K" : "") + (st.castle.white.q ? "Q" : "") +
         (st.castle.black.k ? "k" : "") + (st.castle.black.q ? "q" : "");
    s += "|" + (st.ep ? st.ep.join(",") : "-");
    return s;
  }

  // What is the position, for the side about to move?
  function statusFor(b, st, color) {
    if (legalMoves(b, st, color).length === 0) {
      return inCheck(b, color) ? "checkmate" : "stalemate";
    }
    if (st.half >= 100) return "fifty";
    if (insufficientMaterial(b)) return "insufficient";
    if (repetition && repetition[positionKey(b, st, color)] >= 3) return "repetition";
    return null;
  }

  // ---------- engine ----------
  //
  // Alpha-beta over material and piece-square tables. Because move generation
  // is now fully legal, mate and stalemate are simply "no moves left", and the
  // engine both delivers mate and avoids walking into one.

  var CP = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
  var MATE = 100000;

  // Written from White's point of view (row 0 = Black's back rank).
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

  function orderMoves(b, list) {
    return list.map(function (m) {
      var t = b[m.to[0]][m.to[1]];
      return { m: m, s: (t ? CP[t.type] : 0) + (m.promo ? 800 : 0) };
    }).sort(function (a, z) { return z.s - a.s; }).map(function (x) { return x.m; });
  }

  function search(b, st, depth, alpha, beta, color, ply) {
    if (depth === 0) return color === "black" ? evaluate(b) : -evaluate(b);

    // Filter for legality inline rather than calling legalMoves() first.
    // legalMoves already makes and unmakes every move to test it, so calling
    // it and then making the moves again did the whole job twice.
    var list = orderMoves(b, pseudoMoves(b, st, color));
    var best = -Infinity, legal = 0;
    for (var i = 0; i < list.length; i++) {
      var u = applyMove(b, st, list[i]);
      if (inCheck(b, color)) { undoMove(b, st, list[i], u); continue; }
      legal++;
      var sc = -search(b, st, depth - 1, -beta, -alpha, other(color), ply + 1);
      undoMove(b, st, list[i], u);
      if (sc > best) best = sc;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    // Mate found sooner is worth more, so the engine actually finishes you off
    // instead of shuffling around in a won position.
    if (legal === 0) return inCheck(b, color) ? -(MATE - ply) : 0;
    return best;
  }

  // ---------- strength dial ----------

  var ELO_MIN = 250, ELO_MAX = 2000;

  function eloConfig(elo) {
    var t = (elo - ELO_MIN) / (ELO_MAX - ELO_MIN); // 0..1

    // Search depth is a whole number - you cannot look ahead 3.4 moves - so
    // picking it with a threshold gave the slider a few flat plateaus where
    // 1250 and 1550 played identically. Instead the depth is a FRACTION and
    // the leftover part is the chance of searching one ply deeper this move,
    // so average strength climbs with every single notch.
    var exact = 1 + 4 * Math.pow(t, 1.25);
    var base = Math.floor(exact);
    var depth = (Math.random() < exact - base) ? base + 1 : base;

    return {
      depth: Math.min(5, depth),
      exactDepth: exact,
      slack: Math.round(400 * Math.pow(1 - t, 2)),
      blunder: Math.max(0, 0.40 * Math.pow(1 - t, 1.6))
    };
  }

  function chooseMove(b, st, elo) {
    var cfg = eloConfig(elo);
    var list = legalMoves(b, st, "black");
    if (list.length === 0) return null;

    if (Math.random() < cfg.blunder) return window.ArcadeCommon.pick(list);

    var ordered = orderMoves(b, list);
    var scored = [], best = -Infinity;
    for (var i = 0; i < ordered.length; i++) {
      var u = applyMove(b, st, ordered[i]);
      var sc = -search(b, st, cfg.depth - 1, -Infinity, Infinity, "white", 1);
      undoMove(b, st, ordered[i], u);
      scored.push({ m: ordered[i], s: sc });
      if (sc > best) best = sc;
    }
    // A forced mate is never thrown away, however low the rating - but at low
    // ratings it may simply not have searched deep enough to see one.
    if (best >= MATE - 100) {
      var mates = scored.filter(function (x) { return x.s === best; });
      return window.ArcadeCommon.pick(mates).m;
    }
    var pool = scored.filter(function (x) { return x.s >= best - cfg.slack; });
    return window.ArcadeCommon.pick(pool).m;
  }

  // ---------- slider ----------

  var ELO_KEY = "arcade.chess.elo";
  var eloInput = document.getElementById("elo-slider");
  var eloLabel = document.getElementById("elo-value");
  var eloTier = document.getElementById("elo-tier");

  function currentElo() {
    return eloInput ? parseInt(eloInput.value, 10) : 1200;
  }

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

  // ---------- game flow ----------

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
    state = initialState();
    repetition = {};
    turn = "white";
    over = false;
    thinking = false;
    moves = 0;
    selected = null;
    resultBanner.innerHTML = "";
    notePosition();
    refreshHud();
    render();
  }

  function notePosition() {
    var key = positionKey(board, state, turn);
    repetition[key] = (repetition[key] || 0) + 1;
  }

  function refreshHud() {
    movesEl.textContent = moves;
    if (over) return;
    if (thinking) { turnStat.textContent = "Thinking…"; return; }
    var label = turn === "white"
      ? window.ArcadeI18n.t("common.yourTurn")
      : window.ArcadeI18n.t("common.cpuTurn");
    if (inCheck(board, turn)) label += " — Check!";
    turnStat.textContent = label;
  }

  var DRAW_TEXT = {
    stalemate: "Stalemate — it's a draw",
    fifty: "Draw — 50 moves with no capture or pawn move",
    insufficient: "Draw — not enough pieces left to mate",
    repetition: "Draw — same position three times"
  };

  // Called after a move, for whoever is about to play.
  function checkEnd() {
    var st = statusFor(board, state, turn);
    if (!st) return false;
    over = true;
    if (st === "checkmate") {
      // The side to move has no escape, so the OTHER side delivered mate.
      var youWon = turn === "black";
      turnStat.textContent = "Checkmate";
      resultBanner.innerHTML = youWon
        ? '<span class="overlay-win">Checkmate! ' + window.ArcadeI18n.t("common.youWin") + "</span>"
        : '<span class="overlay-lose">Checkmate — ' + window.ArcadeI18n.t("common.youLose") + "</span>";
    } else {
      turnStat.textContent = window.ArcadeI18n.t("common.tie");
      resultBanner.innerHTML = '<span class="overlay-win">' + DRAW_TEXT[st] + "</span>";
    }
    movesEl.textContent = moves;
    render();
    return true;
  }

  function render() {
    boardEl.innerHTML = "";
    var legalDests = [];
    if (selected) {
      legalMoves(board, state, "white").forEach(function (m) {
        if (m.from[0] === selected[0] && m.from[1] === selected[1]) legalDests.push(m.to);
      });
    }
    var checkedKing = over ? null : findKing(board, turn);
    var showCheck = checkedKing && inCheck(board, turn);
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        var cell = document.createElement("div");
        cell.className = "cell " + (isDark(r, c) ? "dark" : "light");
        if (selected && selected[0] === r && selected[1] === c) cell.className += " selected";
        if (legalDests.some(function (d) { return d[0] === r && d[1] === c; })) cell.className += " legal-move";
        if (showCheck && checkedKing[0] === r && checkedKing[1] === c) cell.className += " in-check";
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

  function playMove(m) {
    applyMove(board, state, m);
    moves++;
    turn = other(turn);
    notePosition();
  }

  function handleClick(r, c) {
    // Ignore clicks while the engine is searching, or a fast tapper could move
    // twice off one position and desync the board.
    if (over || thinking || turn !== "white") return;
    var piece = board[r][c];

    if (selected) {
      var mine = legalMoves(board, state, "white").filter(function (m) {
        return m.from[0] === selected[0] && m.from[1] === selected[1] &&
               m.to[0] === r && m.to[1] === c;
      });
      if (mine.length) {
        selected = null;
        playMove(mine[0]);
        render();
        refreshHud();
        if (checkEnd()) return;
        setTimeout(cpuTurn, 350);
        return;
      }
      if (piece && piece.color === "white") { selected = [r, c]; render(); return; }
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
    // Searching can take a moment on a phone, so hand the browser a frame to
    // paint "Thinking..." before we start crunching.
    thinking = true;
    refreshHud();
    setTimeout(function () {
      var chosen = chooseMove(board, state, currentElo());
      thinking = false;
      if (over) return;
      if (!chosen) { checkEnd(); return; }
      playMove(chosen);
      render();
      refreshHud();
      checkEnd();
    }, 20);
  }

  restartBtn.addEventListener("click", newGame);
  newGame();

  // Exposed for the automated rules tests; harmless in the page.
  window.__chess = {
    legalMoves: legalMoves, pseudoMoves: pseudoMoves, applyMove: applyMove,
    undoMove: undoMove, inCheck: inCheck, isAttacked: isAttacked,
    statusFor: statusFor, initialState: initialState, chooseMove: chooseMove,
    evaluate: evaluate, eloConfig: eloConfig, search: search,
    insufficientMaterial: insufficientMaterial, positionKey: positionKey,
    repetitionMap: function () { return repetition; }
  };
})();
