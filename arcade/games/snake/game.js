(function () {
  var GAME_ID = "snake";
  var canvas = document.getElementById("board");
  var ctx = canvas.getContext("2d");
  var scoreEl = document.getElementById("score");
  var bestEl = document.getElementById("best");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");
  var diffEl = document.getElementById("difficulty");

  var GRID = 20;
  var CELLS = canvas.width / GRID;
  var snake, dir, nextDir, food, bonus, score, over, timer, particles, tickCount;

  // Per-difficulty tuning. "wrap" = pass through walls instead of dying,
  // "bonus" = occasional golden food worth extra points.
  var DIFFICULTIES = {
    easy: { speed: 150, wrap: true, bonus: false, foodPoints: 10 },
    medium: { speed: 100, wrap: false, bonus: false, foodPoints: 10 },
    hard: { speed: 65, wrap: false, bonus: true, foodPoints: 15 }
  };
  var cfg = DIFFICULTIES.medium;

  function refreshHud() {
    scoreEl.textContent = score;
    bestEl.textContent = window.ArcadeCommon.getBest(GAME_ID) || 0;
  }

  function randomEmptyCell() {
    var pos;
    do {
      pos = { x: window.ArcadeCommon.randInt(0, CELLS - 1), y: window.ArcadeCommon.randInt(0, CELLS - 1) };
    } while (
      snake.some(function (s) { return s.x === pos.x && s.y === pos.y; }) ||
      (bonus && bonus.x === pos.x && bonus.y === pos.y) ||
      (food && food.x === pos.x && food.y === pos.y)
    );
    return pos;
  }

  function newGame() {
    snake = [{ x: 8, y: 10 }, { x: 7, y: 10 }, { x: 6, y: 10 }];
    dir = { x: 1, y: 0 };
    nextDir = dir;
    score = 0;
    over = false;
    particles = [];
    bonus = null;
    tickCount = 0;
    food = randomEmptyCell();
    resultBanner.innerHTML = "";
    refreshHud();
    clearInterval(timer);
    timer = setInterval(tick, cfg.speed);
    draw();
  }

  function spawnParticles(cx, cy, color) {
    for (var i = 0; i < 10; i++) {
      var ang = Math.random() * Math.PI * 2;
      var spd = 1 + Math.random() * 2.5;
      particles.push({
        x: cx, y: cy,
        vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
        life: 1, color: color
      });
    }
  }

  function tick() {
    if (over) return;
    tickCount++;
    dir = nextDir;
    var head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };

    if (cfg.wrap) {
      head.x = (head.x + CELLS) % CELLS;
      head.y = (head.y + CELLS) % CELLS;
    } else if (head.x < 0 || head.y < 0 || head.x >= CELLS || head.y >= CELLS) {
      endGame();
      return;
    }
    if (snake.some(function (s) { return s.x === head.x && s.y === head.y; })) {
      endGame();
      return;
    }

    snake.unshift(head);

    var ate = false;
    if (head.x === food.x && head.y === food.y) {
      score += cfg.foodPoints;
      spawnParticles(food.x * GRID + GRID / 2, food.y * GRID + GRID / 2, "#ff5da2");
      food = randomEmptyCell();
      ate = true;
      refreshHud();
    }
    if (bonus && head.x === bonus.x && head.y === bonus.y) {
      score += 50;
      spawnParticles(bonus.x * GRID + GRID / 2, bonus.y * GRID + GRID / 2, "#ffd23f");
      window.ArcadeCommon.toast("+50 bonus!");
      bonus = null;
      ate = true;
      refreshHud();
    }
    if (!ate) snake.pop();

    // Hard mode: occasionally drop a golden bonus that expires.
    if (cfg.bonus && !bonus && Math.random() < 0.04) {
      bonus = randomEmptyCell();
      bonus.ttl = 40; // ticks before it disappears
    }
    if (bonus && bonus.ttl !== undefined) {
      bonus.ttl--;
      if (bonus.ttl <= 0) bonus = null;
    }

    draw();
  }

  function endGame() {
    over = true;
    clearInterval(timer);
    var isBest = window.ArcadeCommon.setBest(GAME_ID, score);
    refreshHud();
    var msg = window.ArcadeI18n.t("common.gameOver");
    if (isBest && score > 0) msg += " 🏆";
    resultBanner.innerHTML = '<span class="overlay-lose">' + msg + "</span>";
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
    // Background with subtle checkerboard grid.
    ctx.fillStyle = "#12162a";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (var gx = 0; gx < CELLS; gx++) {
      for (var gy = 0; gy < CELLS; gy++) {
        if ((gx + gy) % 2 === 0) {
          ctx.fillStyle = "rgba(255,255,255,0.02)";
          ctx.fillRect(gx * GRID, gy * GRID, GRID, GRID);
        }
      }
    }

    // Food: pulsing glowing orb.
    var pulse = 0.5 + 0.5 * Math.sin(Date.now() / 200);
    drawOrb(food.x, food.y, "#ff5da2", "#ff9dc7", 3 + pulse * 2);

    // Bonus golden food with a rotating sparkle.
    if (bonus) {
      var fade = bonus.ttl !== undefined && bonus.ttl < 12 ? (bonus.ttl % 2 === 0 ? 0.35 : 1) : 1;
      ctx.globalAlpha = fade;
      drawOrb(bonus.x, bonus.y, "#ffb700", "#ffe680", 5 + pulse * 3);
      ctx.globalAlpha = 1;
    }

    // Snake: rounded gradient segments, brighter toward the head.
    snake.forEach(function (s, i) {
      var frac = 1 - i / snake.length;
      var g = Math.round(120 + 100 * frac);
      var isHead = i === 0;
      ctx.fillStyle = isHead ? "#29e0c9" : "rgb(50," + g + ",132)";
      var pad = isHead ? 1 : 2;
      roundRect(s.x * GRID + pad, s.y * GRID + pad, GRID - pad * 2, GRID - pad * 2, isHead ? 7 : 5);
      ctx.fill();
    });

    // Eyes on the head, pointing in the travel direction.
    drawEyes();

    // Particles from eating.
    particles = particles.filter(function (p) { return p.life > 0; });
    particles.forEach(function (p) {
      p.x += p.vx; p.y += p.vy; p.life -= 0.06;
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3 * p.life, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
    if (particles.length && !over) requestAnimationFrame(draw);
  }

  function drawOrb(cx, cy, core, glow, glowRadius) {
    var px = cx * GRID + GRID / 2;
    var py = cy * GRID + GRID / 2;
    var grad = ctx.createRadialGradient(px, py, 1, px, py, GRID / 2 + glowRadius);
    grad.addColorStop(0, glow);
    grad.addColorStop(0.5, core);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(px, py, GRID / 2 + glowRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(px, py, GRID / 2 - 3, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawEyes() {
    var h = snake[0];
    var cx = h.x * GRID + GRID / 2;
    var cy = h.y * GRID + GRID / 2;
    var ox = dir.x, oy = dir.y;
    // Perpendicular offset so the two eyes sit side by side.
    var perpX = -oy, perpY = ox;
    var eyeDist = 4, forward = 3, r = 2.6;
    [-1, 1].forEach(function (side) {
      var ex = cx + perpX * eyeDist * side + ox * forward;
      var ey = cy + perpY * eyeDist * side + oy * forward;
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(ex, ey, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#0b1020";
      ctx.beginPath();
      ctx.arc(ex + ox * 1.1, ey + oy * 1.1, 1.3, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function setDir(x, y) {
    if (dir.x === -x && dir.y === -y) return;
    nextDir = { x: x, y: y };
  }

  document.addEventListener("keydown", function (e) {
    var map = {
      ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
      w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0]
    };
    var k = map[e.key];
    if (k) { e.preventDefault(); setDir(k[0], k[1]); }
  });

  document.getElementById("touch-controls").addEventListener("click", function (e) {
    var btn = e.target.closest("[data-dir]");
    if (!btn) return;
    var map = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
    var d = map[btn.getAttribute("data-dir")];
    setDir(d[0], d[1]);
  });

  var touchStart = null;
  canvas.addEventListener("touchstart", function (e) { touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY }; });
  canvas.addEventListener("touchend", function (e) {
    if (!touchStart) return;
    var dx = e.changedTouches[0].clientX - touchStart.x;
    var dy = e.changedTouches[0].clientY - touchStart.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) > 20) {
      if (Math.abs(dx) > Math.abs(dy)) setDir(dx > 0 ? 1 : -1, 0);
      else setDir(0, dy > 0 ? 1 : -1);
    }
    touchStart = null;
  });

  restartBtn.addEventListener("click", newGame);

  // Difficulty selector - changing it starts a fresh game at the new speed.
  window.ArcadeCommon.mountDifficulty(diffEl, GAME_ID, {
    defaultKey: "medium",
    onChange: function (level) {
      cfg = DIFFICULTIES[level] || DIFFICULTIES.medium;
      newGame();
    }
  });

  // Keep the food/bonus pulsing even while the snake isn't moving.
  setInterval(function () { if (!over) draw(); }, 120);
})();
