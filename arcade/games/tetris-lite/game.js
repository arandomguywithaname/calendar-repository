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
  var diffEl = document.getElementById("difficulty");

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

  // Per-difficulty tuning. startDelay = initial drop interval,
  // speedStep = ms shaved per speed-up, everyLines = lines between speed-ups.
  var DIFFICULTIES = {
    easy: { startDelay: 950, minDelay: 260, speedStep: 45, everyLines: 6 },
    medium: { startDelay: 700, minDelay: 120, speedStep: 60, everyLines: 5 },
    hard: { startDelay: 480, minDelay: 90, speedStep: 80, everyLines: 4 }
  };
  var cfg = DIFFICULTIES.medium;

  var grid, cur, score, linesCleared, over, dropTimer, dropDelay, paused, particles, flash, rafId;
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
    particles = [];
    flash = 0;
    dropDelay = cfg.startDelay;
    resultBanner.innerHTML = "";
    cur = spawnPiece();
    refreshHud();
    clearInterval(dropTimer);
    dropTimer = setInterval(tickDown, dropDelay);
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(render);
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
        return;
      }
    }
  }

  function spawnParticles(px, py, color) {
    for (var i = 0; i < 6; i++) {
      var ang = Math.random() * Math.PI * 2;
      var spd = 1 + Math.random() * 3;
      particles.push({ x: px, y: py, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd - 1, life: 1, color: color });
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
  }

  function clearLines() {
    var full = [];
    for (var r = 0; r < ROWS; r++) {
      if (grid[r].every(function (v) { return v; })) full.push(r);
    }
    if (full.length === 0) return;
    // Neon flash + particle burst across each cleared line.
    flash = 1;
    full.forEach(function (r) {
      for (var c = 0; c < COLS; c++) {
        spawnParticles(c * CELL + CELL / 2, r * CELL + CELL / 2, grid[r][c] || "#ffffff");
      }
    });
    full.forEach(function (r) {
      grid.splice(r, 1);
      grid.unshift(new Array(COLS).fill(null));
    });
    linesCleared += full.length;
    score += (LINE_SCORES[full.length] || full.length * 200);
    window.ArcadeCommon.toast(full.length >= 4 ? "TETRIS!" : "+" + (LINE_SCORES[full.length] || 0));
    var newDelay = Math.max(cfg.minDelay, cfg.startDelay - Math.floor(linesCleared / cfg.everyLines) * cfg.speedStep);
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

  function drawBlock(cx, cy, color, active) {
    var x = cx * CELL, y = cy * CELL;
    ctx.save();
    if (active) { ctx.shadowColor = color; ctx.shadowBlur = 14; }
    var grad = ctx.createLinearGradient(x, y, x, y + CELL);
    grad.addColorStop(0, "#ffffff");
    grad.addColorStop(0.14, color);
    grad.addColorStop(1, "rgba(0,0,0,0.4)");
    ctx.fillStyle = grad;
    ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
    ctx.restore();
    // Inner highlight.
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.fillRect(x + 3, y + 3, CELL - 6, 4);
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 1.5, y + 1.5, CELL - 3, CELL - 3);
  }

  function draw() {
    ctx.fillStyle = "#0f1326";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Glowing grid.
    ctx.strokeStyle = "rgba(124,92,255,0.16)";
    ctx.lineWidth = 1;
    for (var r = 0; r <= ROWS; r++) {
      ctx.beginPath(); ctx.moveTo(0, r * CELL); ctx.lineTo(canvas.width, r * CELL); ctx.stroke();
    }
    for (var c = 0; c <= COLS; c++) {
      ctx.beginPath(); ctx.moveTo(c * CELL, 0); ctx.lineTo(c * CELL, canvas.height); ctx.stroke();
    }

    for (var rr = 0; rr < ROWS; rr++) {
      for (var cc = 0; cc < COLS; cc++) {
        if (grid[rr][cc]) drawBlock(cc, rr, grid[rr][cc], false);
      }
    }

    if (cur) {
      var gy = ghostY();
      if (gy !== null && gy !== cur.y) {
        var ghostCells = pieceCells({ type: cur.type, rot: cur.rot, x: cur.x, y: gy });
        ctx.save();
        ctx.shadowColor = SHAPES[cur.type].color;
        ctx.shadowBlur = 6;
        ctx.strokeStyle = SHAPES[cur.type].color;
        ctx.globalAlpha = 0.55;
        ctx.lineWidth = 2;
        ghostCells.forEach(function (c) {
          if (c[1] >= 0) ctx.strokeRect(c[0] * CELL + 3, c[1] * CELL + 3, CELL - 6, CELL - 6);
        });
        ctx.restore();
      }
      var cells = pieceCells(cur);
      cells.forEach(function (c) {
        if (c[1] >= 0) drawBlock(c[0], c[1], SHAPES[cur.type].color, true);
      });
    }

    // Line-clear flash overlay.
    if (flash > 0) {
      ctx.fillStyle = "rgba(255,255,255," + flash * 0.4 + ")";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      flash = Math.max(0, flash - 0.08);
    }

    // Particles.
    particles = particles.filter(function (p) { return p.life > 0; });
    particles.forEach(function (p) {
      p.x += p.vx; p.y += p.vy; p.vy += 0.15; p.life -= 0.03;
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3 * p.life, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  function render() {
    draw();
    rafId = requestAnimationFrame(render);
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

  window.ArcadeCommon.mountDifficulty(diffEl, GAME_ID, {
    defaultKey: "medium",
    onChange: function (level) {
      cfg = DIFFICULTIES[level] || DIFFICULTIES.medium;
      newGame();
    }
  });
})();
