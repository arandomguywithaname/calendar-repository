(function () {
  var GAME_ID = "bubble-shooter";
  var canvas = document.getElementById("board");
  var ctx = canvas.getContext("2d");
  var scoreEl = document.getElementById("score");
  var bestEl = document.getElementById("best");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");
  var diffEl = document.getElementById("difficulty");

  var W = canvas.width, H = canvas.height;
  var COLS = 8;
  var ROWS = 9;
  var CELL = W / COLS;
  var GRID_TOP = 8;
  var BUBBLE_R = CELL / 2 - 4;
  var SHOOTER_X = W / 2, SHOOTER_Y = H - 40;
  var PROJ_SPEED = 9;
  var PALETTE = ["#ff5d5d", "#4d8dff", "#3ddc84", "#ffd24d", "#7c5cff", "#ff5da2"];
  var MIN_ANGLE = -170 * Math.PI / 180;
  var MAX_ANGLE = -10 * Math.PI / 180;

  // Difficulty tuning. colors = how many bubble colors are in play (fewer =
  // easier matches), startRows = how full the grid starts, dangerRow = the row
  // that triggers a loss (deeper = more shots before danger), dropEvery = shots
  // between ceiling drops that push everything down (0 = never).
  var DIFFICULTIES = {
    easy:   { colors: 3, startRows: 4, dangerRow: 8, dropEvery: 0 },
    medium: { colors: 5, startRows: 5, dangerRow: 7, dropEvery: 0 },
    hard:   { colors: 6, startRows: 6, dangerRow: 6, dropEvery: 10 }
  };
  var cfg = DIFFICULTIES.medium;

  var grid, score, over, won, aimAngle, currentColor, nextColor, projectile, particles, shots;

  function refreshHud() {
    scoreEl.textContent = score;
    bestEl.textContent = window.ArcadeCommon.getBest(GAME_ID) || 0;
  }

  function pickColor() {
    return PALETTE[window.ArcadeCommon.randInt(0, cfg.colors - 1)];
  }

  function cellCenter(r, c) {
    return { x: c * CELL + CELL / 2, y: GRID_TOP + r * CELL + CELL / 2 };
  }

  function initGrid() {
    grid = [];
    for (var r = 0; r < ROWS; r++) {
      var row = [];
      for (var c = 0; c < COLS; c++) {
        row.push(r < cfg.startRows ? pickColor() : null);
      }
      grid.push(row);
    }
  }

  function newGame() {
    initGrid();
    score = 0;
    over = false;
    won = false;
    shots = 0;
    particles = [];
    aimAngle = -Math.PI / 2;
    currentColor = pickColor();
    nextColor = pickColor();
    projectile = null;
    resultBanner.innerHTML = "";
    refreshHud();
  }

  function burst(x, y, color, n) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2;
      var s = 1 + Math.random() * 3.5;
      particles.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, color: color });
    }
  }

  function toCanvasPos(e) {
    var rect = canvas.getBoundingClientRect();
    var cx = e.touches ? e.touches[0].clientX : e.clientX;
    var cy = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: (cx - rect.left) * (W / rect.width), y: (cy - rect.top) * (H / rect.height) };
  }

  function setAimFromPoint(x, y) {
    var angle = Math.atan2(y - SHOOTER_Y, x - SHOOTER_X);
    if (angle > -0.02) angle = -0.02;
    aimAngle = Math.max(MIN_ANGLE, Math.min(MAX_ANGLE, angle));
  }

  function fire() {
    if (over || projectile) return;
    projectile = {
      x: SHOOTER_X,
      y: SHOOTER_Y,
      vx: Math.cos(aimAngle) * PROJ_SPEED,
      vy: Math.sin(aimAngle) * PROJ_SPEED,
      color: currentColor
    };
  }

  function emptyCellDist(r, c, x, y) {
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS || grid[r][c]) return Infinity;
    var center = cellCenter(r, c);
    var dx = center.x - x, dy = center.y - y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function findSnapCell(x, y) {
    var baseRow = Math.round((y - GRID_TOP - CELL / 2) / CELL);
    var baseCol = Math.round((x - CELL / 2) / CELL);
    var best = null, bestDist = Infinity;
    for (var dr = -1; dr <= 2; dr++) {
      for (var dc = -2; dc <= 2; dc++) {
        var r = baseRow + dr, c = baseCol + dc;
        var d = emptyCellDist(r, c, x, y);
        if (d < bestDist) { bestDist = d; best = { r: r, c: c }; }
      }
    }
    if (!best) return { r: Math.max(0, Math.min(ROWS - 1, baseRow)), c: Math.max(0, Math.min(COLS - 1, baseCol)) };
    return best;
  }

  function neighbors(r, c) {
    return [{ r: r - 1, c: c }, { r: r + 1, c: c }, { r: r, c: c - 1 }, { r: r, c: c + 1 }];
  }

  function floodMatch(r, c, color) {
    var visited = {};
    var stack = [{ r: r, c: c }];
    var group = [];
    while (stack.length) {
      var cell = stack.pop();
      var key = cell.r + "," + cell.c;
      if (visited[key]) continue;
      visited[key] = true;
      if (cell.r < 0 || cell.r >= ROWS || cell.c < 0 || cell.c >= COLS) continue;
      if (grid[cell.r][cell.c] !== color) continue;
      group.push(cell);
      neighbors(cell.r, cell.c).forEach(function (n) { stack.push(n); });
    }
    return group;
  }

  function removeFloating() {
    var connected = {};
    var stack = [];
    for (var c = 0; c < COLS; c++) {
      if (grid[0][c]) stack.push({ r: 0, c: c });
    }
    while (stack.length) {
      var cell = stack.pop();
      var key = cell.r + "," + cell.c;
      if (connected[key]) continue;
      if (cell.r < 0 || cell.r >= ROWS || cell.c < 0 || cell.c >= COLS) continue;
      if (!grid[cell.r][cell.c]) continue;
      connected[key] = true;
      neighbors(cell.r, cell.c).forEach(function (n) { stack.push(n); });
    }
    var removed = 0;
    for (var r = 0; r < ROWS; r++) {
      for (var cc = 0; cc < COLS; cc++) {
        if (grid[r][cc] && !connected[r + "," + cc]) {
          var ce = cellCenter(r, cc);
          burst(ce.x, ce.y, grid[r][cc], 6);
          grid[r][cc] = null;
          removed++;
        }
      }
    }
    return removed;
  }

  function addCeilingRow() {
    // Push every row down one and drop a fresh row from the ceiling.
    for (var r = ROWS - 1; r > 0; r--) grid[r] = grid[r - 1];
    var row = [];
    for (var c = 0; c < COLS; c++) row.push(pickColor());
    grid[0] = row;
  }

  function attachProjectile() {
    var cell = findSnapCell(projectile.x, projectile.y);
    var r = Math.max(0, Math.min(ROWS - 1, cell.r));
    var c = Math.max(0, Math.min(COLS - 1, cell.c));
    grid[r][c] = projectile.color;
    projectile = null;
    shots++;

    var group = floodMatch(r, c, grid[r][c]);
    if (group.length >= 3) {
      group.forEach(function (cell2) {
        var ce = cellCenter(cell2.r, cell2.c);
        burst(ce.x, ce.y, grid[cell2.r][cell2.c], 8);
        grid[cell2.r][cell2.c] = null;
      });
      score += group.length * 10;
      var floating = removeFloating();
      if (floating > 0) score += floating * 5;
      window.ArcadeCommon.toast("+" + (group.length * 10 + floating * 5));
      refreshHud();
    }

    // Hard mode: periodic ceiling drop ratchets up the pressure.
    if (cfg.dropEvery > 0 && shots % cfg.dropEvery === 0) addCeilingRow();

    var isEmpty = true;
    var danger = false;
    for (var rr = 0; rr < ROWS; rr++) {
      for (var cc = 0; cc < COLS; cc++) {
        if (grid[rr][cc]) {
          isEmpty = false;
          if (rr >= cfg.dangerRow) danger = true;
        }
      }
    }

    if (isEmpty) { finishGame(true); return; }
    if (danger) { finishGame(false); return; }

    currentColor = nextColor;
    nextColor = pickColor();
  }

  function finishGame(win) {
    over = true;
    won = win;
    var improved = window.ArcadeCommon.setBest(GAME_ID, score);
    resultBanner.innerHTML = win
      ? '<span class="overlay-win">' + window.ArcadeI18n.t("common.youWin") + (improved ? " 🏆" : "") + "</span>"
      : '<span class="overlay-lose">' + window.ArcadeI18n.t("common.youLose") + (improved ? " 🏆" : "") + "</span>";
    refreshHud();
  }

  function update() {
    if (!projectile) return;
    projectile.x += projectile.vx;
    projectile.y += projectile.vy;
    if (projectile.x < BUBBLE_R) { projectile.x = BUBBLE_R; projectile.vx *= -1; }
    if (projectile.x > W - BUBBLE_R) { projectile.x = W - BUBBLE_R; projectile.vx *= -1; }

    if (projectile.y - BUBBLE_R <= GRID_TOP) {
      attachProjectile();
      return;
    }
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        if (!grid[r][c]) continue;
        var center = cellCenter(r, c);
        var dx = projectile.x - center.x, dy = projectile.y - center.y;
        if (Math.sqrt(dx * dx + dy * dy) < CELL * 0.92) {
          attachProjectile();
          return;
        }
      }
    }
  }

  function drawBubble(x, y, color, glow) {
    if (glow) { ctx.shadowColor = color; ctx.shadowBlur = 10; }
    var grad = ctx.createRadialGradient(x - BUBBLE_R * 0.35, y - BUBBLE_R * 0.35, 1, x, y, BUBBLE_R);
    grad.addColorStop(0, "#ffffff");
    grad.addColorStop(0.28, color);
    grad.addColorStop(1, shade(color));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, BUBBLE_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    // Glossy highlight.
    ctx.beginPath();
    ctx.arc(x - BUBBLE_R * 0.32, y - BUBBLE_R * 0.32, BUBBLE_R * 0.28, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.fill();
  }

  function shade(hex) {
    var n = parseInt(hex.slice(1), 16);
    var r = Math.round(((n >> 16) & 255) * 0.45);
    var g = Math.round(((n >> 8) & 255) * 0.45);
    var b = Math.round((n & 255) * 0.45);
    return "rgb(" + r + "," + g + "," + b + ")";
  }

  function draw() {
    // Neon gradient background with glow orbs.
    var bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#181d33");
    bg.addColorStop(1, "#0c0f1e");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    var t = Date.now() / 1000;
    var og = ctx.createRadialGradient(W * 0.7, H * 0.25, 0, W * 0.7, H * 0.25, 160);
    og.addColorStop(0, "rgba(124,92,255,0.16)");
    og.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = og;
    ctx.fillRect(0, 0, W, H);

    // Glowing danger line.
    var dangerY = GRID_TOP + cfg.dangerRow * CELL;
    var pulse = 0.35 + 0.25 * Math.sin(t * 3);
    ctx.strokeStyle = "rgba(255,93,93," + pulse + ")";
    ctx.shadowColor = "#ff5d5d";
    ctx.shadowBlur = 10;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(0, dangerY);
    ctx.lineTo(W, dangerY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.shadowBlur = 0;

    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        if (grid[r][c]) {
          var center = cellCenter(r, c);
          drawBubble(center.x, center.y, grid[r][c], true);
        }
      }
    }

    // Aim line, glowing.
    if (!over) {
      ctx.strokeStyle = "rgba(238,240,251,0.55)";
      ctx.shadowColor = "#eef0fb";
      ctx.shadowBlur = 8;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 7]);
      ctx.beginPath();
      ctx.moveTo(SHOOTER_X, SHOOTER_Y);
      ctx.lineTo(SHOOTER_X + Math.cos(aimAngle) * 220, SHOOTER_Y + Math.sin(aimAngle) * 220);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.shadowBlur = 0;
    }

    // Particles.
    particles = particles.filter(function (p) { return p.life > 0; });
    particles.forEach(function (p) {
      p.x += p.vx; p.y += p.vy; p.vy += 0.08; p.life -= 0.035;
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.1, 3 * p.life), 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    if (projectile) drawBubble(projectile.x, projectile.y, projectile.color, true);
    if (!over) {
      drawBubble(SHOOTER_X, SHOOTER_Y, currentColor, true);
      ctx.fillStyle = "#a6acc9";
      ctx.font = "11px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Next", SHOOTER_X + 55, SHOOTER_Y - BUBBLE_R - 6);
      drawBubble(SHOOTER_X + 55, SHOOTER_Y, nextColor, true);
    }
  }

  function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
  }

  canvas.addEventListener("mousemove", function (e) {
    var pos = toCanvasPos(e);
    setAimFromPoint(pos.x, pos.y);
  });
  canvas.addEventListener("click", function (e) {
    var pos = toCanvasPos(e);
    setAimFromPoint(pos.x, pos.y);
    fire();
  });
  canvas.addEventListener("touchstart", function (e) {
    e.preventDefault();
    var pos = toCanvasPos(e);
    setAimFromPoint(pos.x, pos.y);
    fire();
  }, { passive: false });

  restartBtn.addEventListener("click", newGame);

  // Difficulty selector - changing it restarts with the new tuning.
  window.ArcadeCommon.mountDifficulty(diffEl, GAME_ID, {
    defaultKey: "medium",
    onChange: function (level) {
      cfg = DIFFICULTIES[level] || DIFFICULTIES.medium;
      newGame();
    }
  });
  loop();
})();
