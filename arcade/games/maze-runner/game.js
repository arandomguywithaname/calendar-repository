(function () {
  var GAME_ID = "maze-runner";
  var canvas = document.getElementById("board");
  var ctx = canvas.getContext("2d");
  var movesEl = document.getElementById("moves");
  var timeEl = document.getElementById("time");
  var bestEl = document.getElementById("best");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");
  var diffEl = document.getElementById("difficulty");

  var W = canvas.width, H = canvas.height;

  // Difficulty tuning. Bigger mazes with a tighter countdown are harder; the
  // timer counts down and hitting zero ends the run.
  var DIFFICULTIES = {
    easy:   { cols: 9,  rows: 9,  timeLimit: 90 },
    medium: { cols: 13, rows: 11, timeLimit: 60 },
    hard:   { cols: 17, rows: 15, timeLimit: 40 }
  };
  var cfg = DIFFICULTIES.medium;

  var cols, rows, cell, grid, player, exitPos, moves, timeLeft, over, won, timerId, rafId, trail, particles;

  function refreshHud() {
    movesEl.textContent = moves;
    timeEl.textContent = timeLeft;
    var best = window.ArcadeCommon.getBest(GAME_ID);
    bestEl.textContent = best === null ? "-" : best;
  }

  function makeGrid() {
    var g = [];
    for (var r = 0; r < rows; r++) {
      var row = [];
      for (var c = 0; c < cols; c++) {
        row.push({ top: true, right: true, bottom: true, left: true, visited: false });
      }
      g.push(row);
    }
    return g;
  }

  function generateMaze() {
    grid = makeGrid();
    var stack = [{ r: 0, c: 0 }];
    grid[0][0].visited = true;
    while (stack.length) {
      var cur = stack[stack.length - 1];
      var nbrs = [];
      var dirs = [
        { dr: -1, dc: 0, self: "top", other: "bottom" },
        { dr: 1, dc: 0, self: "bottom", other: "top" },
        { dr: 0, dc: -1, self: "left", other: "right" },
        { dr: 0, dc: 1, self: "right", other: "left" }
      ];
      dirs.forEach(function (d) {
        var nr = cur.r + d.dr, nc = cur.c + d.dc;
        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && !grid[nr][nc].visited) {
          nbrs.push({ r: nr, c: nc, dir: d });
        }
      });
      if (nbrs.length) {
        var pick = nbrs[Math.floor(Math.random() * nbrs.length)];
        grid[cur.r][cur.c][pick.dir.self] = false;
        grid[pick.r][pick.c][pick.dir.other] = false;
        grid[pick.r][pick.c].visited = true;
        stack.push({ r: pick.r, c: pick.c });
      } else {
        stack.pop();
      }
    }
  }

  function newGame() {
    cols = cfg.cols;
    rows = cfg.rows;
    cell = Math.min(Math.floor(W / cols), Math.floor(H / rows));
    generateMaze();
    player = { r: 0, c: 0 };
    exitPos = { r: rows - 1, c: cols - 1 };
    moves = 0;
    timeLeft = cfg.timeLimit;
    over = false;
    won = false;
    trail = [];
    particles = [];
    resultBanner.innerHTML = "";
    refreshHud();
    clearInterval(timerId);
    timerId = setInterval(function () {
      if (over) return;
      timeLeft--;
      if (timeLeft <= 0) { timeLeft = 0; lose(); }
      refreshHud();
    }, 1000);
    cancelAnimationFrame(rafId);
    loop();
  }

  function offsetX() { return (W - cols * cell) / 2; }
  function offsetY() { return (H - rows * cell) / 2; }

  function burst(x, y, color, n) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2;
      var s = 1 + Math.random() * 3.5;
      particles.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, color: color });
    }
  }

  function draw() {
    if (!grid) return;
    var t = Date.now() / 1000;

    // Deep gradient background with a glow orb near the exit.
    var bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, "#141833");
    bg.addColorStop(1, "#0a0d1c");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    var ox = offsetX(), oy = offsetY();
    var ex = ox + exitPos.c * cell + cell / 2, ey = oy + exitPos.r * cell + cell / 2;
    var eg = ctx.createRadialGradient(ex, ey, 0, ex, ey, cell * 2.2);
    eg.addColorStop(0, "rgba(61,220,132,0.28)");
    eg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = eg;
    ctx.fillRect(0, 0, W, H);

    // Breadcrumb trail.
    trail.forEach(function (p, i) {
      var a = 0.12 + (i / trail.length) * 0.25;
      ctx.globalAlpha = a;
      ctx.fillStyle = "#29e0c9";
      ctx.beginPath();
      ctx.arc(ox + p.c * cell + cell / 2, oy + p.r * cell + cell / 2, Math.max(0.1, cell * 0.14), 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    // Neon maze walls with a purple->cyan gradient and a pulsing glow.
    var wg = ctx.createLinearGradient(ox, oy, ox + cols * cell, oy + rows * cell);
    wg.addColorStop(0, "#7c5cff");
    wg.addColorStop(1, "#29e0c9");
    ctx.strokeStyle = wg;
    ctx.shadowColor = "#7c5cff";
    ctx.shadowBlur = 8 + 3 * Math.sin(t * 2);
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.beginPath();
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var x = ox + c * cell, y = oy + r * cell;
        var g = grid[r][c];
        if (g.top) { ctx.moveTo(x, y); ctx.lineTo(x + cell, y); }
        if (g.left) { ctx.moveTo(x, y); ctx.lineTo(x, y + cell); }
        if (g.bottom) { ctx.moveTo(x, y + cell); ctx.lineTo(x + cell, y + cell); }
        if (g.right) { ctx.moveTo(x + cell, y); ctx.lineTo(x + cell, y + cell); }
      }
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Exit flag and player, both glowing.
    ctx.font = Math.floor(cell * 0.7) + "px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "#3ddc84";
    ctx.shadowBlur = 14;
    ctx.fillText("🚩", ex, ey);
    var px = ox + player.c * cell + cell / 2, py = oy + player.r * cell + cell / 2;
    ctx.shadowColor = "#ffd23f";
    ctx.shadowBlur = 16;
    ctx.fillText("🙂", px, py);
    ctx.shadowBlur = 0;

    // Particles.
    particles = particles.filter(function (p) { return p.life > 0; });
    particles.forEach(function (p) {
      p.x += p.vx; p.y += p.vy; p.vy += 0.06; p.life -= 0.025;
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.1, 3 * p.life), 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
    ctx.textBaseline = "alphabetic";
  }

  function loop() {
    draw();
    rafId = requestAnimationFrame(loop);
  }

  function move(dir) {
    if (over) return;
    var g = grid[player.r][player.c];
    var nr = player.r, nc = player.c;
    if (dir === "up" && !g.top) nr--;
    else if (dir === "down" && !g.bottom) nr++;
    else if (dir === "left" && !g.left) nc--;
    else if (dir === "right" && !g.right) nc++;
    else return;
    trail.push({ r: player.r, c: player.c });
    if (trail.length > 40) trail.shift();
    player.r = nr;
    player.c = nc;
    moves++;
    refreshHud();
    if (player.r === exitPos.r && player.c === exitPos.c) {
      win();
    }
  }

  function win() {
    over = true;
    won = true;
    clearInterval(timerId);
    var elapsed = cfg.timeLimit - timeLeft;
    var ox = offsetX(), oy = offsetY();
    burst(ox + exitPos.c * cell + cell / 2, oy + exitPos.r * cell + cell / 2, "#3ddc84", 26);
    var improved = window.ArcadeCommon.setBestLowerIsBetter(GAME_ID, moves);
    resultBanner.innerHTML = '<span class="overlay-win">' + window.ArcadeI18n.t("common.youWin") +
      " — " + moves + " " + window.ArcadeI18n.t("common.moves") + ", " + elapsed + "s" + (improved ? " 🏆" : "") + "</span>";
    refreshHud();
  }

  function lose() {
    over = true;
    clearInterval(timerId);
    resultBanner.innerHTML = '<span class="overlay-lose">' + window.ArcadeI18n.t("common.gameOver") + "</span>";
  }

  document.addEventListener("keydown", function (e) {
    var map = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };
    if (map[e.key]) { e.preventDefault(); move(map[e.key]); }
  });

  document.getElementById("touch-controls").addEventListener("click", function (e) {
    var btn = e.target.closest("[data-dir]");
    if (btn) move(btn.getAttribute("data-dir"));
  });

  var touchStart = null;
  canvas.addEventListener("touchstart", function (e) { touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY }; });
  canvas.addEventListener("touchend", function (e) {
    if (!touchStart) return;
    var dx = e.changedTouches[0].clientX - touchStart.x;
    var dy = e.changedTouches[0].clientY - touchStart.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) > 20) {
      if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? "right" : "left");
      else move(dy > 0 ? "down" : "up");
    }
    touchStart = null;
  });

  restartBtn.addEventListener("click", newGame);

  // Difficulty selector - changing it restarts with the new tuning.
  window.ArcadeCommon.mountDifficulty(diffEl, GAME_ID, {
    defaultKey: "medium",
    onChange: function (level) {
      cfg = DIFFICULTIES[level] || DIFFICULTIES.medium;
      newGame();
    }
  });
})();
