(function () {
  var GAME_ID = "tetris-lite";
  var canvas = document.getElementById("board");
  var ctx = canvas.getContext("2d");
  var scoreEl = document.getElementById("score");
  var bestEl = document.getElementById("best");
  var linesEl = document.getElementById("lines");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");
  var touchControls = document.getElementById("touch-controls");

  var COLS = 10, ROWS = 20, CELL = 30;
  var BOX = 4;

  var SHAPES = {
    I: { cells: [[0, 1], [1, 1], [2, 1], [3, 1]], color: "#29e0c9" },
    O: { cells: [[1, 1], [2, 1], [1, 2], [2, 2]], color: "#ffb84d" },
    T: { cells: [[1, 1], [0, 2], [1, 2], [2, 2]], color: "#7c5cff" },
    S: { cells: [[1, 1], [2, 1], [0, 2], [1, 2]], color: "#3ddc84" },
    Z: { cells: [[0, 1], [1, 1], [1, 2], [2, 2]], color: "#ff5d5d" },
    J: { cells: [[0, 1], [0, 2], [1, 2], [2, 2]], color: "#5da2ff" },
    L: { cells: [[2, 1], [0, 2], [1, 2], [2, 2]], color: "#ff5da2" }
  };
  var TYPES = Object.keys(SHAPES);

  var grid, cur, score, linesCleared, over, dropTimer, dropDelay, paused;
  var LINE_SCORES = [0, 100, 300, 500, 800];

  function refreshHud() {
    scoreEl.textContent = score;
    bestEl.textContent = window.ArcadeCommon.getBest(GAME_ID) || 0;
    linesEl.textContent = linesCleared;
  }

  function emptyGrid() {
    var g = [];
    for (var r = 0; r < ROWS; r++) g.push(new Array(COLS).fill(null));
    return g;
  }

  function rotateCells(cells, rotIndex) {
    var out = cells;
    for (var i = 0; i < rotIndex % 4; i++) {
      out = out.map(function (c) { return [BOX - 1 - c[1], c[0]]; });
    }
    return out;
  }

  function pieceCells(piece) {
    var shape = SHAPES[piece.type];
    var rotated = rotateCells(shape.cells, piece.rot);
    return rotated.map(function (c) { return [c[0] + piece.x, c[1] + piece.y]; });
  }

  function collision(cells) {
    for (var i = 0; i < cells.length; i++) {
      var x = cells[i][0], y = cells[i][1];
      if (x < 0 || x >= COLS || y >= ROWS) return true;
      if (y >= 0 && grid[y][x]) return true;
    }
    return false;
  }

  function spawnPiece() {
    var type = window.ArcadeCommon.pick(TYPES);
    var piece = { type: type, rot: 0, x: 3, y: -1 };
    if (collision(pieceCells(piece))) {
      endGame();
      return null;
    }
    return piece;
  }

  function newGame() {
    grid = emptyGrid();
    score = 0;
    linesCleared = 0;
    over = false;
    paused = false;
    dropDelay = 700;
    resultBanner.innerHTML = "";
    cur = spawnPiece();
    refreshHud();
    draw();
    clearInterval(dropTimer);
    dropTimer = setInterval(tickDown, dropDelay);
  }

  function resetTimer() {
    clearInterval(dropTimer);
    dropTimer = setInterval(tickDown, dropDelay);
  }

  function tryMove(dx, dy) {
    if (over || !cur) return false;
    var moved = { type: cur.type, rot: cur.rot, x: cur.x + dx, y: cur.y + dy };
    if (collision(pieceCells(moved))) return false;
    cur = moved;
    draw();
    return true;
  }

  function tryRotate() {
    if (over || !cur) return;
    var newRot = (cur.rot + 1) % 4;
    var kicks = [0, -1, 1, -2, 2];
    for (var i = 0; i < kicks.length; i++) {
      var moved = { type: cur.type, rot: newRot, x: cur.x + kicks[i], y: cur.y };
      if (!collision(pieceCells(moved))) {
        cur = moved;
        draw();
        return;
      }
    }
  }

  function lockPiece() {
    var cells = pieceCells(cur);
    var color = SHAPES[cur.type].color;
    cells.forEach(function (c) {
      if (c[1] >= 0) grid[c[1]][c[0]] = color;
    });
    clearLines();
    cur = spawnPiece();
    draw();
  }

  function clearLines() {
    var full = [];
    for (var r = 0; r < ROWS; r++) {
      if (grid[r].every(function (v) { return v; })) full.push(r);
    }
    if (full.length === 0) return;
    full.forEach(function (r) {
      grid.splice(r, 1);
      grid.unshift(new Array(COLS).fill(null));
    });
    linesCleared += full.length;
    score += (LINE_SCORES[full.length] || full.length * 200);
    window.ArcadeCommon.toast(full.length >= 4 ? "TETRIS!" : "+" + (LINE_SCORES[full.length] || 0));
    var newDelay = Math.max(120, 700 - Math.floor(linesCleared / 5) * 60);
    if (newDelay !== dropDelay) {
      dropDelay = newDelay;
      resetTimer();
    }
    refreshHud();
  }

  function tickDown() {
    if (over || paused) return;
    if (!tryMove(0, 1)) {
      lockPiece();
    }
  }

  function hardDrop() {
    if (over || !cur) return;
    var dist = 0;
    while (tryMove(0, 1)) dist++;
    score += dist;
    lockPiece();
    refreshHud();
  }

  function endGame() {
    over = true;
    clearInterval(dropTimer);
    var isBest = window.ArcadeCommon.setBest(GAME_ID, score);
    refreshHud();
    resultBanner.innerHTML = '<span class="overlay-lose">' + window.ArcadeI18n.t("common.gameOver") +
      " — Score: " + score + (isBest ? " — New Best!" : "") + "</span>";
  }

  function ghostY() {
    if (!cur) return null;
    var testY = cur.y;
    while (!collision(pieceCells({ type: cur.type, rot: cur.rot, x: cur.x, y: testY + 1 }))) testY++;
    return testY;
  }

  function draw() {
    ctx.fillStyle = "#171b2e";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        ctx.strokeStyle = "#242a45";
        ctx.strokeRect(c * CELL, r * CELL, CELL, CELL);
        if (grid[r][c]) {
          ctx.fillStyle = grid[r][c];
          ctx.fillRect(c * CELL + 1, r * CELL + 1, CELL - 2, CELL - 2);
        }
      }
    }

    if (cur) {
      var gy = ghostY();
      if (gy !== null && gy !== cur.y) {
        var ghostCells = pieceCells({ type: cur.type, rot: cur.rot, x: cur.x, y: gy });
        ctx.strokeStyle = SHAPES[cur.type].color;
        ghostCells.forEach(function (c) {
          if (c[1] >= 0) ctx.strokeRect(c[0] * CELL + 2, c[1] * CELL + 2, CELL - 4, CELL - 4);
        });
      }
      var cells = pieceCells(cur);
      ctx.fillStyle = SHAPES[cur.type].color;
      cells.forEach(function (c) {
        if (c[1] >= 0) ctx.fillRect(c[0] * CELL + 1, c[1] * CELL + 1, CELL - 2, CELL - 2);
      });
    }
  }

  document.addEventListener("keydown", function (e) {
    var handled = true;
    switch (e.key) {
      case "ArrowLeft": tryMove(-1, 0); break;
      case "ArrowRight": tryMove(1, 0); break;
      case "ArrowDown": if (!tryMove(0, 1)) lockPiece(); break;
      case "ArrowUp": tryRotate(); break;
      case " ": hardDrop(); break;
      default: handled = false;
    }
    if (handled) e.preventDefault();
  });

  touchControls.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-act]");
    if (!btn) return;
    switch (btn.getAttribute("data-act")) {
      case "left": tryMove(-1, 0); break;
      case "right": tryMove(1, 0); break;
      case "down": if (!tryMove(0, 1)) lockPiece(); break;
      case "rotate": tryRotate(); break;
      case "drop": hardDrop(); break;
    }
  });

  restartBtn.addEventListener("click", newGame);
  newGame();
})();
