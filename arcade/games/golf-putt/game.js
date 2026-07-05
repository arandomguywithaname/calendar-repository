(function () {
  var GAME_ID = "golf-putt";
  var canvas = document.getElementById("board");
  var ctx = canvas.getContext("2d");
  var scoreEl = document.getElementById("score");
  var bestEl = document.getElementById("best");
  var holeNumEl = document.getElementById("hole-num");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");
  var diffEl = document.getElementById("difficulty");

  var W = canvas.width, H = canvas.height;
  var BALL_R = 8;
  var MAX_DRAG = 110;

  // Easy = slower ball (more friction), bigger hole, gentle power;
  // hard = faster ball (less friction), smaller hole, extra walls.
  var DIFFICULTIES = {
    easy:   { friction: 0.975, holeR: 20, powerScale: 0.14, extraWalls: false },
    medium: { friction: 0.985, holeR: 14, powerScale: 0.16, extraWalls: false },
    hard:   { friction: 0.990, holeR: 10, powerScale: 0.185, extraWalls: true }
  };
  var cfg = DIFFICULTIES.medium;

  var LEVELS = [
    {
      ball: { x: 50, y: H / 2 },
      hole: { x: W - 50, y: H / 2 },
      walls: [
        { x: 220, y: 0, w: 20, h: 230 },
        { x: 220, y: 300, w: 20, h: H - 300 }
      ],
      extra: [
        { x: 330, y: 0, w: 18, h: 120 },
        { x: 330, y: 250, w: 18, h: H - 250 }
      ]
    },
    {
      ball: { x: 50, y: 60 },
      hole: { x: W - 60, y: H - 60 },
      walls: [
        { x: 150, y: 60, w: 20, h: 240 },
        { x: 310, y: 60, w: 20, h: 240 }
      ],
      extra: [
        { x: 230, y: 150, w: 18, h: 150 }
      ]
    },
    {
      ball: { x: W / 2, y: H - 40 },
      hole: { x: W / 2, y: 40 },
      walls: [
        { x: 0, y: 160, w: 300, h: 20 },
        { x: 340, y: 160, w: W - 340, h: 20 },
        { x: 140, y: 60, w: 20, h: 80 },
        { x: 320, y: 220, w: 20, h: 80 }
      ],
      extra: [
        { x: 60, y: 60, w: 18, h: 80 },
        { x: 400, y: 220, w: 18, h: 80 }
      ]
    }
  ];

  var levelIndex, ball, hole, walls, strokes, totalStrokes, over, holed, particles, trail;
  var dragging = false, dragStart = null, dragCurrent = null;

  function refreshHud() {
    scoreEl.textContent = totalStrokes;
    holeNumEl.textContent = levelIndex + 1;
    var best = window.ArcadeCommon.getBest(GAME_ID);
    bestEl.textContent = best === null ? "-" : best;
  }

  function loadLevel(idx) {
    var lvl = LEVELS[idx];
    ball = { x: lvl.ball.x, y: lvl.ball.y, vx: 0, vy: 0 };
    hole = lvl.hole;
    walls = lvl.walls.slice();
    if (cfg.extraWalls && lvl.extra) walls = walls.concat(lvl.extra);
    strokes = 0;
    holed = false;
    trail = [];
  }

  function newGame() {
    levelIndex = 0;
    totalStrokes = 0;
    over = false;
    particles = [];
    resultBanner.innerHTML = "";
    loadLevel(0);
    refreshHud();
  }

  function toCanvasPos(e) {
    var rect = canvas.getBoundingClientRect();
    var cx = e.touches ? e.touches[0].clientX : e.clientX;
    var cy = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: (cx - rect.left) * (W / rect.width), y: (cy - rect.top) * (H / rect.height) };
  }

  function ballSpeed() { return Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy); }

  function spawnConfetti(cx, cy) {
    var colors = ["#ff5da2", "#7c5cff", "#29e0c9", "#ffd23f", "#3ddc84"];
    for (var i = 0; i < 24; i++) {
      var ang = Math.random() * Math.PI * 2;
      var spd = 1.5 + Math.random() * 4;
      particles.push({ x: cx, y: cy, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, life: 1, color: window.ArcadeCommon.pick(colors) });
    }
  }

  function update() {
    for (var j = particles.length - 1; j >= 0; j--) {
      var p = particles[j];
      p.x += p.vx; p.y += p.vy; p.vx *= 0.95; p.vy *= 0.95; p.life -= 0.025;
      if (p.life <= 0) particles.splice(j, 1);
    }
    if (over || holed) return;
    var speed = ballSpeed();
    if (speed > 0.02) {
      trail.push({ x: ball.x, y: ball.y });
      if (trail.length > 14) trail.shift();
      ball.x += ball.vx;
      ball.y += ball.vy;
      ball.vx *= cfg.friction;
      ball.vy *= cfg.friction;

      if (ball.x < BALL_R) { ball.x = BALL_R; ball.vx *= -0.75; }
      if (ball.x > W - BALL_R) { ball.x = W - BALL_R; ball.vx *= -0.75; }
      if (ball.y < BALL_R) { ball.y = BALL_R; ball.vy *= -0.75; }
      if (ball.y > H - BALL_R) { ball.y = H - BALL_R; ball.vy *= -0.75; }

      walls.forEach(function (w) {
        var closestX = Math.max(w.x, Math.min(ball.x, w.x + w.w));
        var closestY = Math.max(w.y, Math.min(ball.y, w.y + w.h));
        var dx = ball.x - closestX, dy = ball.y - closestY;
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < BALL_R && dist > 0) {
          var nx = dx / dist, ny = dy / dist;
          ball.x = closestX + nx * BALL_R;
          ball.y = closestY + ny * BALL_R;
          var dot = ball.vx * nx + ball.vy * ny;
          ball.vx -= 2 * dot * nx;
          ball.vy -= 2 * dot * ny;
          ball.vx *= 0.8;
          ball.vy *= 0.8;
        } else if (dist === 0) {
          ball.vx *= -0.8;
          ball.vy *= -0.8;
        }
      });
    } else {
      ball.vx = 0;
      ball.vy = 0;
      if (trail.length) trail = [];
    }

    var dHole = Math.sqrt((ball.x - hole.x) * (ball.x - hole.x) + (ball.y - hole.y) * (ball.y - hole.y));
    if (dHole < cfg.holeR * 0.75 && !holed) {
      holed = true;
      ball.x = hole.x;
      ball.y = hole.y;
      ball.vx = 0;
      ball.vy = 0;
      spawnConfetti(hole.x, hole.y);
      refreshHud();
      setTimeout(nextHole, 900);
    }
  }

  function nextHole() {
    if (levelIndex >= LEVELS.length - 1) {
      finishGame();
      return;
    }
    levelIndex++;
    loadLevel(levelIndex);
    refreshHud();
  }

  function finishGame() {
    over = true;
    var improved = window.ArcadeCommon.setBestLowerIsBetter(GAME_ID, totalStrokes);
    resultBanner.innerHTML = '<span class="overlay-win">' + window.ArcadeI18n.t("common.youWin") +
      " — " + totalStrokes + " total strokes" + (improved ? " 🏆" : "") + "</span>";
    refreshHud();
  }

  function draw() {
    // Neon felt.
    ctx.fillStyle = "#0d2318";
    ctx.fillRect(0, 0, W, H);
    [{ x: W * 0.3, y: H * 0.35, c: "rgba(41,224,201,0.12)", r: 170 },
     { x: W * 0.75, y: H * 0.7, c: "rgba(61,220,132,0.12)", r: 190 }].forEach(function (o) {
      var g = ctx.createRadialGradient(o.x, o.y, 4, o.x, o.y, o.r);
      g.addColorStop(0, o.c); g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2); ctx.fill();
    });

    // Walls with neon glow.
    ctx.save();
    ctx.shadowColor = "#7c5cff"; ctx.shadowBlur = 12;
    walls.forEach(function (w) {
      var g = ctx.createLinearGradient(w.x, w.y, w.x + w.w, w.y + w.h);
      g.addColorStop(0, "#5a3fd6"); g.addColorStop(1, "#7c5cff");
      ctx.fillStyle = g;
      ctx.fillRect(w.x, w.y, w.w, w.h);
    });
    ctx.restore();

    // Hole with pulsing neon rim.
    var pulse = 0.5 + 0.5 * Math.sin(Date.now() / 220);
    ctx.beginPath();
    ctx.arc(hole.x, hole.y, cfg.holeR, 0, Math.PI * 2);
    ctx.fillStyle = "#04110a";
    ctx.fill();
    ctx.save();
    ctx.shadowColor = "#29e0c9"; ctx.shadowBlur = 14 + pulse * 8;
    ctx.strokeStyle = "#29e0c9";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();

    // Aim line.
    if (dragging && dragCurrent && !holed) {
      var dx = ball.x - dragCurrent.x, dy = ball.y - dragCurrent.y;
      var dist = Math.min(Math.sqrt(dx * dx + dy * dy), MAX_DRAG);
      var angle = Math.atan2(dy, dx);
      ctx.beginPath();
      ctx.moveTo(ball.x, ball.y);
      ctx.lineTo(ball.x + Math.cos(angle) * dist, ball.y + Math.sin(angle) * dist);
      ctx.strokeStyle = "rgba(238,240,251,0.7)";
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.save();
      ctx.shadowColor = "#29e0c9"; ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(ball.x, ball.y);
      ctx.lineTo(ball.x - Math.cos(angle) * dist, ball.y - Math.sin(angle) * dist);
      ctx.strokeStyle = "#29e0c9";
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.restore();
    }

    // Ball trail.
    trail.forEach(function (tp, i) {
      var a = (i / trail.length) * 0.4;
      ctx.globalAlpha = a;
      ctx.fillStyle = "#eef0fb";
      ctx.beginPath();
      ctx.arc(tp.x, tp.y, Math.max(0.1, BALL_R * (i / trail.length)), 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    // Ball with glow.
    ctx.save();
    ctx.shadowColor = "#ffffff"; ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.restore();

    // Confetti.
    particles.forEach(function (p) {
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    });
    ctx.globalAlpha = 1;
  }

  function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
  }

  function startDrag(e) {
    if (over || holed || ballSpeed() > 0.05) return;
    var pos = toCanvasPos(e);
    var dx = pos.x - ball.x, dy = pos.y - ball.y;
    if (Math.sqrt(dx * dx + dy * dy) > 60) return;
    dragging = true;
    dragStart = pos;
    dragCurrent = pos;
    e.preventDefault();
  }

  function moveDrag(e) {
    if (!dragging) return;
    dragCurrent = toCanvasPos(e);
    e.preventDefault();
  }

  function endDrag(e) {
    if (!dragging) return;
    dragging = false;
    var dx = ball.x - dragCurrent.x, dy = ball.y - dragCurrent.y;
    var dist = Math.min(Math.sqrt(dx * dx + dy * dy), MAX_DRAG);
    if (dist > 8) {
      var angle = Math.atan2(dy, dx);
      ball.vx = Math.cos(angle) * dist * cfg.powerScale;
      ball.vy = Math.sin(angle) * dist * cfg.powerScale;
      strokes++;
      totalStrokes++;
      refreshHud();
    }
    dragCurrent = null;
  }

  canvas.addEventListener("mousedown", startDrag);
  canvas.addEventListener("mousemove", moveDrag);
  window.addEventListener("mouseup", endDrag);
  canvas.addEventListener("touchstart", startDrag, { passive: false });
  canvas.addEventListener("touchmove", moveDrag, { passive: false });
  canvas.addEventListener("touchend", endDrag);

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
