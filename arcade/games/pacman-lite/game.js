(function () {
  var GAME_ID = "pacman-lite";
  var canvas = document.getElementById("board");
  var ctx = canvas.getContext("2d");
  var scoreEl = document.getElementById("score");
  var bestEl = document.getElementById("best");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");
  var diffEl = document.getElementById("difficulty");

  var CELLS = 15;
  var GRID = canvas.width / CELLS;

  var GHOST_SPAWNS = [
    { r: CELLS - 2, c: CELLS - 2, color: "#ff5d5d" },
    { r: 1, c: CELLS - 2, color: "#7c5cff" },
    { r: CELLS - 2, c: 1, color: "#29e0c9" }
  ];

  // Difficulty tuning. ghostCount = how many ghosts, ghostMs = ghost step speed
  // (lower = faster), chase = probability a ghost moves toward you (smarter).
  var DIFFICULTIES = {
    easy:   { ghostCount: 1, ghostMs: 560, chase: 0.45 },
    medium: { ghostCount: 2, ghostMs: 420, chase: 0.65 },
    hard:   { ghostCount: 3, ghostMs: 300, chase: 0.88 }
  };
  var cfg = DIFFICULTIES.medium;

  function isWall(r, c) {
    if (r < 0 || c < 0 || r >= CELLS || c >= CELLS) return true;
    if (r === 0 || r === CELLS - 1 || c === 0 || c === CELLS - 1) return true;
    if (r % 2 === 0 && c % 2 === 0 && r >= 2 && r <= CELLS - 3 && c >= 2 && c <= CELLS - 3) return true;
    return false;
  }

  var dots, player, ghosts, score, over, won, ghostTimer, particles, rafId;

  function buildDots() {
    var d = [];
    for (var r = 0; r < CELLS; r++) {
      d.push([]);
      for (var c = 0; c < CELLS; c++) {
        d[r].push(!isWall(r, c));
      }
    }
    return d;
  }

  function countDots() {
    var n = 0;
    for (var r = 0; r < CELLS; r++) {
      for (var c = 0; c < CELLS; c++) {
        if (dots[r][c]) n++;
      }
    }
    return n;
  }

  function refreshHud() {
    scoreEl.textContent = score;
    bestEl.textContent = window.ArcadeCommon.getBest(GAME_ID) || 0;
  }

  function newGame() {
    dots = buildDots();
    player = { r: 1, c: 1, dir: { x: 1, y: 0 } };
    dots[player.r][player.c] = false;
    ghosts = GHOST_SPAWNS.slice(0, cfg.ghostCount).map(function (g) {
      return { r: g.r, c: g.c, color: g.color };
    });
    ghosts.forEach(function (g) { dots[g.r][g.c] = false; });
    score = 0;
    over = false;
    won = false;
    particles = [];
    resultBanner.innerHTML = "";
    refreshHud();
    clearInterval(ghostTimer);
    ghostTimer = setInterval(tickGhosts, cfg.ghostMs);
    cancelAnimationFrame(rafId);
    render();
  }

  function burst(cx, cy, color, n) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2;
      var s = 1 + Math.random() * 2.5;
      particles.push({ x: cx, y: cy, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, color: color });
    }
  }

  function cellsEqual(a, b) { return a.r === b.r && a.c === b.c; }

  function checkCollision() {
    for (var i = 0; i < ghosts.length; i++) {
      if (cellsEqual(ghosts[i], player)) return true;
    }
    return false;
  }

  function endGame(win) {
    over = true;
    won = win;
    clearInterval(ghostTimer);
    var isBest = window.ArcadeCommon.setBest(GAME_ID, score);
    if (win) {
      resultBanner.innerHTML = '<span class="overlay-win">' + window.ArcadeI18n.t("common.youWin") + (isBest && score > 0 ? " 🏆" : "") + "</span>";
    } else {
      var px = player.c * GRID + GRID / 2, py = player.r * GRID + GRID / 2;
      burst(px, py, "#ffd166", 22);
      resultBanner.innerHTML = '<span class="overlay-lose">' + window.ArcadeI18n.t("common.gameOver") + "</span>";
    }
    refreshHud();
  }

  function movePlayer(dx, dy) {
    if (over) return;
    var nr = player.r + dy;
    var nc = player.c + dx;
    if (isWall(nr, nc)) return;
    player.r = nr;
    player.c = nc;
    player.dir = { x: dx, y: dy };
    if (dots[nr][nc]) {
      dots[nr][nc] = false;
      score += 10;
      burst(nc * GRID + GRID / 2, nr * GRID + GRID / 2, "#ffd166", 5);
      refreshHud();
    }
    if (checkCollision()) { endGame(false); return; }
    if (countDots() === 0) { endGame(true); return; }
  }

  function neighbors(cell) {
    var opts = [
      { r: cell.r - 1, c: cell.c, x: 0, y: -1 },
      { r: cell.r + 1, c: cell.c, x: 0, y: 1 },
      { r: cell.r, c: cell.c - 1, x: -1, y: 0 },
      { r: cell.r, c: cell.c + 1, x: 1, y: 0 }
    ];
    return opts.filter(function (o) { return !isWall(o.r, o.c); });
  }

  function tickGhosts() {
    if (over) return;
    ghosts.forEach(function (g) {
      var opts = neighbors(g);
      if (!opts.length) return;
      var choice;
      if (Math.random() < cfg.chase) {
        var best = null, bestDist = Infinity;
        opts.forEach(function (o) {
          var dist = Math.abs(o.r - player.r) + Math.abs(o.c - player.c);
          if (dist < bestDist) { bestDist = dist; best = [o]; }
          else if (dist === bestDist) { best.push(o); }
        });
        choice = window.ArcadeCommon.pick(best);
      } else {
        choice = window.ArcadeCommon.pick(opts);
      }
      g.r = choice.r;
      g.c = choice.c;
    });
    if (checkCollision()) { endGame(false); return; }
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function draw() {
    if (!dots) return;
    var t = Date.now() / 1000;

    var bg = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    bg.addColorStop(0, "#0e1224");
    bg.addColorStop(1, "#070a16");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Walls: neon gradient tiles with glow.
    for (var r = 0; r < CELLS; r++) {
      for (var c = 0; c < CELLS; c++) {
        if (isWall(r, c)) {
          var x = c * GRID, y = r * GRID;
          var wg = ctx.createLinearGradient(x, y, x, y + GRID);
          wg.addColorStop(0, "#3b48a8");
          wg.addColorStop(1, "#1c2456");
          ctx.shadowColor = "#4d63ff";
          ctx.shadowBlur = 6;
          ctx.fillStyle = wg;
          roundRect(x + 1, y + 1, GRID - 2, GRID - 2, 4);
          ctx.fill();
          ctx.shadowBlur = 0;
        } else if (dots[r][c]) {
          var pulse = 0.85 + 0.15 * Math.sin(t * 4 + (r + c));
          ctx.shadowColor = "#ffd166";
          ctx.shadowBlur = 6;
          ctx.fillStyle = "#ffe29a";
          ctx.beginPath();
          ctx.arc(c * GRID + GRID / 2, r * GRID + GRID / 2, Math.max(0.1, GRID * 0.1 * pulse), 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }
    }

    // Player: glowing pac with an animated chomp.
    var cx = player.c * GRID + GRID / 2;
    var cy = player.r * GRID + GRID / 2;
    var rad = GRID / 2 - 2;
    var dirAngle = 0;
    if (player.dir.x === 1) dirAngle = 0;
    else if (player.dir.x === -1) dirAngle = Math.PI;
    else if (player.dir.y === 1) dirAngle = Math.PI / 2;
    else if (player.dir.y === -1) dirAngle = -Math.PI / 2;
    var open = (0.06 + 0.18 * Math.abs(Math.sin(t * 8))) * Math.PI;
    ctx.shadowColor = "#ffd166";
    ctx.shadowBlur = 16;
    var pg = ctx.createRadialGradient(cx - 2, cy - 2, 1, cx, cy, rad);
    pg.addColorStop(0, "#fff2c0");
    pg.addColorStop(1, "#ffb703");
    ctx.fillStyle = pg;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, rad, dirAngle + open, dirAngle - open + Math.PI * 2);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;

    // Ghosts: glowing bodies with a wavy skirt and eyes tracking the player.
    ghosts.forEach(function (g, gi) {
      var gx = g.c * GRID + GRID / 2;
      var gy = g.r * GRID + GRID / 2 + Math.sin(t * 3 + gi) * 1.5;
      var gr = GRID / 2 - 2;
      ctx.shadowColor = g.color;
      ctx.shadowBlur = 14;
      var gg = ctx.createLinearGradient(gx, gy - gr, gx, gy + gr);
      gg.addColorStop(0, "#ffffff");
      gg.addColorStop(0.25, g.color);
      gg.addColorStop(1, shade(g.color));
      ctx.fillStyle = gg;
      ctx.beginPath();
      ctx.arc(gx, gy, gr, Math.PI, 0, false);
      // Wavy bottom.
      var feet = 4;
      for (var f = 0; f <= feet; f++) {
        var fx = gx + gr - (f / feet) * gr * 2;
        var fy = gy + gr - (f % 2 === 0 ? 0 : gr * 0.35);
        ctx.lineTo(fx, fy);
      }
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;

      // Eyes look toward the player.
      var dxp = player.c - g.c, dyp = player.r - g.r;
      var mag = Math.max(1, Math.abs(dxp) + Math.abs(dyp));
      var ex = (dxp / mag) * gr * 0.18, ey = (dyp / mag) * gr * 0.18;
      [-1, 1].forEach(function (side) {
        var eyeX = gx + side * gr * 0.35, eyeY = gy - gr * 0.1;
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(eyeX, eyeY, gr * 0.24, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#1c2138";
        ctx.beginPath();
        ctx.arc(eyeX + ex, eyeY + ey, gr * 0.11, 0, Math.PI * 2);
        ctx.fill();
      });
    });

    // Particles.
    particles = particles.filter(function (p) { return p.life > 0; });
    particles.forEach(function (p) {
      p.x += p.vx; p.y += p.vy; p.life -= 0.04;
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.1, 3 * p.life), 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  function shade(hex) {
    var n = parseInt(hex.slice(1), 16);
    var r = Math.round(((n >> 16) & 255) * 0.5);
    var g = Math.round(((n >> 8) & 255) * 0.5);
    var b = Math.round((n & 255) * 0.5);
    return "rgb(" + r + "," + g + "," + b + ")";
  }

  function render() {
    draw();
    rafId = requestAnimationFrame(render);
  }

  document.addEventListener("keydown", function (e) {
    var map = {
      ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0]
    };
    if (map[e.key]) { e.preventDefault(); movePlayer(map[e.key][0], map[e.key][1]); }
  });

  document.getElementById("touch-controls").addEventListener("click", function (e) {
    var btn = e.target.closest("[data-dir]");
    if (!btn) return;
    var map = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
    var d = map[btn.getAttribute("data-dir")];
    movePlayer(d[0], d[1]);
  });

  var touchStart = null;
  canvas.addEventListener("touchstart", function (e) { touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY }; });
  canvas.addEventListener("touchend", function (e) {
    if (!touchStart) return;
    var dx = e.changedTouches[0].clientX - touchStart.x;
    var dy = e.changedTouches[0].clientY - touchStart.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) > 20) {
      if (Math.abs(dx) > Math.abs(dy)) movePlayer(dx > 0 ? 1 : -1, 0);
      else movePlayer(0, dy > 0 ? 1 : -1);
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
