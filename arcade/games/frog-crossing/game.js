(function () {
  var GAME_ID = "frog-crossing";
  var canvas = document.getElementById("board");
  var ctx = canvas.getContext("2d");
  var scoreEl = document.getElementById("score");
  var bestEl = document.getElementById("best");
  var levelEl = document.getElementById("level");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");
  var diffEl = document.getElementById("difficulty");

  var COLS = 9, ROWS = 10, CELL = 50;
  var NEON = ["#ff5da2", "#7c5cff", "#29e0c9", "#ffd23f", "#5da2ff", "#3ddc84", "#ff5d5d"];

  // Per-difficulty tuning. "safeRows" are traffic lanes left empty (easy only),
  // gap controls how dense the traffic is, speedMul/growth the pace.
  var DIFFICULTIES = {
    easy: { speedMul: 0.55, growth: 0.08, gapMin: 210, gapMax: 300, safeRows: [1, 3, 5, 7] },
    medium: { speedMul: 1.0, growth: 0.16, gapMin: 150, gapMax: 210, safeRows: [] },
    hard: { speedMul: 1.6, growth: 0.24, gapMin: 100, gapMax: 145, safeRows: [] }
  };
  var cfg = DIFFICULTIES.medium;

  var frog, score, level, lanes, over, rafId, lastTime, particles;

  function refreshHud() {
    scoreEl.textContent = score;
    levelEl.textContent = level;
    var best = window.ArcadeCommon.getBest(GAME_ID);
    bestEl.textContent = best === null ? "-" : best;
  }

  function buildLanes() {
    lanes = [];
    var speedMul = cfg.speedMul * (1 + (level - 1) * cfg.growth);
    for (var r = 1; r <= 8; r++) {
      if (cfg.safeRows.indexOf(r) !== -1) { lanes.push({ row: r, speed: 0, obstacles: [] }); continue; }
      var dir = r % 2 === 0 ? 1 : -1;
      var baseSpeed = 40 + (r % 4) * 18;
      var speed = baseSpeed * speedMul * dir;
      var gap = window.ArcadeCommon.randInt(cfg.gapMin, cfg.gapMax);
      var color = NEON[(r + level) % NEON.length];
      var obstacles = [];
      var count = Math.ceil((COLS * CELL) / gap) + 1;
      for (var i = 0; i < count; i++) {
        obstacles.push({ x: i * gap + window.ArcadeCommon.randInt(0, 40), w: CELL * 1.5, color: color });
      }
      lanes.push({ row: r, speed: speed, obstacles: obstacles });
    }
  }

  function resetFrog() {
    frog = { row: ROWS - 1, col: Math.floor(COLS / 2) };
  }

  function newGame() {
    score = 0;
    level = 1;
    over = false;
    particles = [];
    resetFrog();
    buildLanes();
    resultBanner.innerHTML = "";
    refreshHud();
    lastTime = null;
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(loop);
  }

  function spawnParticles(cx, cy, color, count) {
    for (var i = 0; i < (count || 14); i++) {
      var ang = Math.random() * Math.PI * 2;
      var spd = 1 + Math.random() * 3.5;
      particles.push({ x: cx, y: cy, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, life: 1, color: color });
    }
  }

  function loop(ts) {
    if (lastTime === null) lastTime = ts;
    var dt = Math.min((ts - lastTime) / 1000, 0.05);
    lastTime = ts;
    if (!over) {
      lanes.forEach(function (lane) {
        lane.obstacles.forEach(function (ob) {
          ob.x += lane.speed * dt;
          var totalW = COLS * CELL;
          if (lane.speed > 0 && ob.x > totalW) ob.x -= totalW + 220;
          if (lane.speed < 0 && ob.x < -220) ob.x += totalW + 220;
        });
      });
      checkCollision();
    }
    draw();
    rafId = requestAnimationFrame(loop);
  }

  function checkCollision() {
    var lane = lanes.filter(function (l) { return l.row === frog.row; })[0];
    if (!lane) return;
    var frogX = frog.col * CELL;
    var hit = lane.obstacles.some(function (ob) {
      return frogX < ob.x + ob.w && frogX + CELL > ob.x;
    });
    if (hit) endGame();
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

  function drawVehicle(ob, laneRow, speed) {
    var vy = laneRow * CELL + CELL * 0.16;
    var vh = CELL * 0.68;
    var vx = ob.x, vw = ob.w;
    // Motion trail behind the vehicle (opposite the travel direction).
    var tdir = speed < 0 ? 1 : -1;
    for (var t = 1; t <= 3; t++) {
      ctx.globalAlpha = 0.12 / t;
      ctx.fillStyle = ob.color;
      roundRect(vx + tdir * t * 10, vy + 2, vw, vh - 4, 9);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // Glow body.
    ctx.save();
    ctx.shadowColor = ob.color;
    ctx.shadowBlur = 16;
    var grad = ctx.createLinearGradient(vx, vy, vx, vy + vh);
    grad.addColorStop(0, "#ffffff");
    grad.addColorStop(0.12, ob.color);
    grad.addColorStop(1, "rgba(0,0,0,0.35)");
    ctx.fillStyle = grad;
    roundRect(vx, vy, vw, vh, 9);
    ctx.fill();
    ctx.restore();
    // Windshield highlight.
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    var wsx = speed < 0 ? vx + 8 : vx + vw - 24;
    roundRect(wsx, vy + 6, 16, vh - 12, 4);
    ctx.fill();
    // Headlight streak.
    ctx.fillStyle = "rgba(255,255,220,0.85)";
    var hlx = speed < 0 ? vx - 2 : vx + vw - 2;
    ctx.fillRect(hlx, vy + vh / 2 - 3, 3, 6);
  }

  function draw() {
    var pulse = 0.5 + 0.5 * Math.sin(Date.now() / 260);
    ctx.fillStyle = "#0d1020";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (var r = 0; r < ROWS; r++) {
      var isGoal = r === 0;
      var isStart = r === ROWS - 1;
      if (isGoal || isStart) {
        var g = ctx.createLinearGradient(0, r * CELL, 0, r * CELL + CELL);
        g.addColorStop(0, "rgba(41,224,201,0.20)");
        g.addColorStop(1, "rgba(41,224,201,0.06)");
        ctx.fillStyle = g;
      } else {
        ctx.fillStyle = r % 2 === 0 ? "#191d33" : "#141828";
      }
      ctx.fillRect(0, r * CELL, canvas.width, CELL);
    }

    // Glowing lane dividers between road rows.
    ctx.save();
    ctx.strokeStyle = "rgba(124,92,255,0.55)";
    ctx.lineWidth = 2;
    ctx.shadowColor = "#7c5cff";
    ctx.shadowBlur = 8;
    ctx.setLineDash([16, 14]);
    for (var lr = 2; lr <= 8; lr++) {
      ctx.beginPath();
      ctx.moveTo(0, lr * CELL);
      ctx.lineTo(canvas.width, lr * CELL);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.restore();

    // Goal glow band.
    ctx.save();
    ctx.strokeStyle = "rgba(41,224,201," + (0.5 + pulse * 0.4) + ")";
    ctx.lineWidth = 3;
    ctx.shadowColor = "#29e0c9";
    ctx.shadowBlur = 14;
    ctx.strokeRect(1, 1, canvas.width - 2, CELL - 2);
    ctx.restore();

    lanes.forEach(function (lane) {
      lane.obstacles.forEach(function (ob) { drawVehicle(ob, lane.row, lane.speed); });
    });

    // Frog: glowing rounded body with eyes.
    var fx = frog.col * CELL + CELL / 2;
    var fy = frog.row * CELL + CELL / 2;
    var glow = ctx.createRadialGradient(fx, fy, 2, fx, fy, CELL * 0.7);
    glow.addColorStop(0, "rgba(61,220,132,0.7)");
    glow.addColorStop(1, "rgba(61,220,132,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(fx, fy, CELL * 0.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.shadowColor = "#3ddc84";
    ctx.shadowBlur = 18;
    var bg = ctx.createRadialGradient(fx - 5, fy - 6, 2, fx, fy, CELL * 0.42);
    bg.addColorStop(0, "#b6ffcf");
    bg.addColorStop(0.5, "#3ddc84");
    bg.addColorStop(1, "#1f9b57");
    ctx.fillStyle = bg;
    roundRect(fx - CELL * 0.36, fy - CELL * 0.36, CELL * 0.72, CELL * 0.72, 12);
    ctx.fill();
    ctx.restore();
    // Eyes.
    [-1, 1].forEach(function (side) {
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(fx + side * 8, fy - 9, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#0b1020";
      ctx.beginPath();
      ctx.arc(fx + side * 8, fy - 9, 2.4, 0, Math.PI * 2);
      ctx.fill();
    });

    // Particles.
    particles = particles.filter(function (p) { return p.life > 0; });
    particles.forEach(function (p) {
      p.x += p.vx; p.y += p.vy; p.vy += 0.06; p.life -= 0.03;
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3.5 * p.life, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  function move(dir) {
    if (over) return;
    if (dir === "up") frog.row = Math.max(0, frog.row - 1);
    else if (dir === "down") frog.row = Math.min(ROWS - 1, frog.row + 1);
    else if (dir === "left") frog.col = Math.max(0, frog.col - 1);
    else if (dir === "right") frog.col = Math.min(COLS - 1, frog.col + 1);
    if (frog.row === 0) {
      score++;
      level++;
      spawnParticles(frog.col * CELL + CELL / 2, CELL / 2, "#29e0c9", 22);
      window.ArcadeCommon.toast("🎉 Crossed!");
      refreshHud();
      resetFrog();
      buildLanes();
    }
    checkCollision();
  }

  function endGame() {
    if (over) return;
    over = true;
    spawnParticles(frog.col * CELL + CELL / 2, frog.row * CELL + CELL / 2, "#ff5d5d", 22);
    var improved = window.ArcadeCommon.setBest(GAME_ID, score);
    resultBanner.innerHTML = '<span class="overlay-lose">' + window.ArcadeI18n.t("common.gameOver") +
      " — " + window.ArcadeI18n.t("common.score") + ": " + score + (improved ? " 🏆" : "") + "</span>";
    refreshHud();
  }

  document.addEventListener("keydown", function (e) {
    var map = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };
    if (map[e.key]) { e.preventDefault(); move(map[e.key]); }
  });

  document.getElementById("touch-controls").addEventListener("click", function (e) {
    var btn = e.target.closest("[data-dir]");
    if (btn) move(btn.getAttribute("data-dir"));
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
