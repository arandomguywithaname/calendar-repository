(function () {
  var GAME_ID = "peg-solitaire";
  var boardEl = document.getElementById("board");
  var pegsEl = document.getElementById("pegs");
  var bestEl = document.getElementById("best");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");

  // Classic English cross board. '.' = not part of the board, 'O' = valid hole.
  var SHAPE = [
    "..OOO..",
    "..OOO..",
    "OOOOOOO",
    "OOOOOOO",
    "OOOOOOO",
    "..OOO..",
    "..OOO.."
  ];
  var SIZE = 7;
  var CENTER = { r: 3, c: 3 };

  var board; // board[r][c] = null (invalid), true (peg), false (empty hole)
  var selected; // {r,c} or null
  var over;

  function refreshHud() {
    pegsEl.textContent = countPegs();
    var best = window.ArcadeCommon.getBest(GAME_ID);
    bestEl.textContent = best === null ? "-" : best;
  }

  function isValid(r, c) {
    return r >= 0 && r < SIZE && c >= 0 && c < SIZE && SHAPE[r].charAt(c) === "O";
  }

  function countPegs() {
    var n = 0;
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        if (board[r][c] === true) n++;
      }
    }
    return n;
  }

  function newGame() {
    board = [];
    for (var r = 0; r < SIZE; r++) {
      board.push([]);
      for (var c = 0; c < SIZE; c++) {
        if (!isValid(r, c)) {
          board[r].push(null);
        } else if (r === CENTER.r && c === CENTER.c) {
          board[r].push(false);
        } else {
          board[r].push(true);
        }
      }
    }
    selected = null;
    over = false;
    resultBanner.innerHTML = "";
    refreshHud();
    render();
  }

  var DIRS = [
    { dr: -1, dc: 0 }, { dr: 1, dc: 0 }, { dr: 0, dc: -1 }, { dr: 0, dc: 1 }
  ];

  // Returns the jump target {r,c} if a legal jump exists from (r,c) in a given
  // direction, else null. A legal jump: adjacent cell has a peg, and the cell
  // two steps away is a valid, empty hole.
  function jumpTarget(r, c, dir) {
    var mr = r + dir.dr, mc = c + dir.dc;
    var tr = r + dir.dr * 2, tc = c + dir.dc * 2;
    if (!isValid(mr, mc) || !isValid(tr, tc)) return null;
    if (board[mr][mc] !== true) return null;
    if (board[tr][tc] !== false) return null;
    return { r: tr, c: tc, mr: mr, mc: mc };
  }

  function legalMovesFrom(r, c) {
    if (board[r][c] !== true) return [];
    var moves = [];
    for (var i = 0; i < DIRS.length; i++) {
      var t = jumpTarget(r, c, DIRS[i]);
      if (t) moves.push(t);
    }
    return moves;
  }

  function anyLegalMoveExists() {
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        if (board[r][c] === true && legalMovesFrom(r, c).length > 0) return true;
      }
    }
    return false;
  }

  function render() {
    boardEl.innerHTML = "";
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        var cell = document.createElement("div");
        var val = board[r][c];
        if (val === null) {
          cell.className = "cell invalid";
        } else if (val === true) {
          cell.className = "cell peg";
          if (selected && selected.r === r && selected.c === c) cell.className += " selected";
          cell.textContent = "⚪";
        } else {
          cell.className = "cell hole";
        }
        (function (rr, cc) {
          cell.addEventListener("click", function () { handleClick(rr, cc); });
        })(r, c);
        boardEl.appendChild(cell);
      }
    }
  }

  function handleClick(r, c) {
    if (over || !isValid(r, c)) return;
    if (selected) {
      if (selected.r === r && selected.c === c) {
        selected = null;
        render();
        return;
      }
      var moves = legalMovesFrom(selected.r, selected.c);
      var match = null;
      for (var i = 0; i < moves.length; i++) {
        if (moves[i].r === r && moves[i].c === c) { match = moves[i]; break; }
      }
      if (match) {
        board[selected.r][selected.c] = false;
        board[match.mr][match.mc] = false;
        board[r][c] = true;
        selected = null;
        refreshHud();
        render();
        checkEnd();
        return;
      }
      if (board[r][c] === true) {
        selected = { r: r, c: c };
        render();
        return;
      }
      window.ArcadeCommon.toast("Not a legal jump");
      selected = null;
      render();
      return;
    }
    if (board[r][c] === true) {
      selected = { r: r, c: c };
      render();
    }
  }

  function checkEnd() {
    if (anyLegalMoveExists()) return;
    over = true;
    var pegs = countPegs();
    var improved = window.ArcadeCommon.setBestLowerIsBetter(GAME_ID, pegs);
    if (pegs === 1) {
      resultBanner.innerHTML = '<span class="overlay-win">' + window.ArcadeI18n.t("common.youWin") +
        " — 1 peg left! Perfect game" + (improved ? " 🏆" : "") + "</span>";
    } else {
      resultBanner.innerHTML = '<span class="overlay-lose">' + window.ArcadeI18n.t("common.gameOver") +
        " — " + pegs + " pegs left" + (improved ? " 🏆 new best!" : "") + "</span>";
    }
    refreshHud();
    render();
  }

  restartBtn.addEventListener("click", newGame);
  newGame();
})();
