(function () {
  var GAME_ID = "air-hockey";
  var canvas = document.getElementById("board");
  var ctx = canvas.getContext("2d");
  var scoreEl = document.getElementById("score");
  var cpuScoreEl = document.getElementById("cpuScore");
  var bestEl = document.getElementById("best");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");
  var diffEl = document.getElementById("difficulty");

  var W = canvas.width, H = canvas.height;
  var PADDLE_R = 26;
  var PUCK_R = 13;
  var GOAL_W = 130;
  var WIN_SCORE = 5;
  var FRICTION = 0.995;

  // Difficulty tuning. puckSpeed = serve speed, maxPuck = speed cap, cpuSpeed =
  // paddle move speed, reactZone = how far down the CPU tracks the puck,
  // cpuError = aim wobble (bigger = weaker), impact = min hit speed.
  var DIFFICULTIES = {
    easy:   { puckSpeed: 3.2, maxPuck: 8,  cpuSpeed: 3.0, reactZone: 0.42, cpuError: 46, impact: 5.0 },
    medium: { puckSpeed: 4.2, maxPuck: 10, cpuSpeed: 4.5, reactZone: 0.50, cpuError: 20, impact: 6.0 },
    hard:   { puckSpeed: 5.4, maxPuck: 13, cpuSpeed: 6.2, reactZone: 0.64, cpuError: 4,  impact: 7.5 }
  };
  var cfg = DIFFICULTIES.medium;

  var player, cpu, puck, score, cpuScore, over, loopId, particles, trail;
  var pointerTarget = null;
  var frame = 0;

  function refreshHud() {
    scoreEl.textContent = score;
    cpuScoreEl.textContent = cpuScore;
    bestEl.textContent = window.ArcadeCommon.getBest(GAME_ID) || 0;
  }

  function resetPuck(dir) {
    puck = {
      x: W / 2, y: H / 2,
      vx: (Math.random() * 2 - 1) * cfg.puckSpeed * 0.6,
      vy: cfg.puckSpeed * (dir || (Math.random() < 0.5 ? 1 : -1))
    };
  }

  function newGame() {
    player = { x: W / 2, y: H - 70 };
    cpu = { x: W / 2, y: 70, aimErr: 0 };
    score = 0;
    cpuScore = 0;
    over = false;
    particles = [];
    trail = [];
    resultBanner.innerHTML = "";
    resetPuck();
    refreshHud();
    cancelAnimationFrame(loopId);
    loop();
  }

  function burst(x, y, color, n) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2;
      var s = 1 + Math.random() * 3.5;
      particles.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, color: color });
    }
  }

  function clampPlayer(x, y) {
    x = Math.max(PADDLE_R, Math.min(W - PADDLE_R, x));
    y = Math.max(H / 2 + PADDLE_R, Math.min(H - PADDLE_R, y));
    return { x: x, y: y };
  }

  function updatePlayer() {
    if (!pointerTarget) return;
    var c = clampPlayer(pointerTarget.x, pointerTarget.y);
    player.x = c.x;
    player.y = c.y;
  }

  function updateCpu() {
    // Refresh the aim wobble occasionally so weak CPUs drift off target.
    if (frame % 24 === 0) cpu.aimErr = (Math.random() * 2 - 1) * cfg.cpuError;
    var targetX = W / 2, targetY = 70;
    if (puck.y < H * cfg.reactZone) {
      targetX = puck.x + cpu.aimErr;
      targetY = Math.max(PADDLE_R, Math.min(H / 2 - PADDLE_R, puck.y - 10));
    }
    var speed = cfg.cpuSpeed;
    cpu.x += Math.max(-speed, Math.min(speed, targetX - cpu.x));
    cpu.y += Math.max(-speed, Math.min(speed, targetY - cpu.y));
    cpu.x = Math.max(PADDLE_R, Math.min(W - PADDLE_R, cpu.x));
    cpu.y = Math.max(PADDLE_R, Math.min(H / 2 - PADDLE_R, cpu.y));
  }

  function collidePaddle(paddle, color) {
    var dx = puck.x - paddle.x, dy = puck.y - paddle.y;
    var dist = Math.sqrt(dx * dx + dy * dy);
    var minDist = PADDLE_R + PUCK_R;
    if (dist < minDist && dist > 0) {
      var nx = dx / dist, ny = dy / dist;
      puck.x = paddle.x + nx * minDist;
      puck.y = paddle.y + ny * minDist;
      var speed = Math.sqrt(puck.vx * puck.vx + puck.vy * puck.vy);
      var impact = Math.min(cfg.maxPuck, Math.max(speed, cfg.impact));
      puck.vx = nx * impact;
      puck.vy = ny * impact;
      burst(puck.x, puck.y, color, 8);
    }
  }

  function update() {
    if (over) return;
    frame++;
    updatePlayer();
    updateCpu();

    puck.x += puck.vx;
    puck.y += puck.vy;
    puck.vx *= FRICTION;
    puck.vy *= FRICTION;

    // Cap runaway speed.
    var sp = Math.sqrt(puck.vx * puck.vx + puck.vy * puck.vy);
    if (sp > cfg.maxPuck) { var k = cfg.maxPuck / sp; puck.vx *= k; puck.vy *= k; }

    trail.push({ x: puck.x, y: puck.y });
    if (trail.length > 9) trail.shift();

    if (puck.x < PUCK_R) { puck.x = PUCK_R; puck.vx *= -1; }
    if (puck.x > W - PUCK_R) { puck.x = W - PUCK_R; puck.vx *= -1; }

    var goalLeft = W / 2 - GOAL_W / 2, goalRight = W / 2 + GOAL_W / 2;

    if (puck.y < PUCK_R) {
      if (puck.x > goalLeft && puck.x < goalRight) {
        score++;
        burst(puck.x, 0, "#29e0c9", 24);
        refreshHud();
        checkWin();
        if (!over) resetPuck(1);
      } else {
        puck.y = PUCK_R;
        puck.vy *= -1;
      }
    }
    if (puck.y > H - PUCK_R) {
      if (puck.x > goalLeft && puck.x < goalRight) {
        cpuScore++;
        burst(puck.x, H, "#ff5da2", 24);
        refreshHud();
        checkWin();
        if (!over) resetPuck(-1);
      } else {
        puck.y = H - PUCK_R;
        puck.vy *= -1;
      }
    }

    collidePaddle(player, "#29e0c9");
    collidePaddle(cpu, "#ff5da2");
  }

  function checkWin() {
    if (score >= WIN_SCORE) {
      over = true;
      var isBest = window.ArcadeCommon.setBest(GAME_ID, score);
      var msg = window.ArcadeI18n.t("common.youWin");
      if (isBest) msg += " 🏆";
      resultBanner.innerHTML = '<span class="overlay-win">' + msg + "</span>";
    } else if (cpuScore >= WIN_SCORE) {
      over = true;
      resultBanner.innerHTML = '<span class="overlay-lose">' + window.ArcadeI18n.t("common.youLose") + "</span>";
    }
  }

  function glowDisc(x, y, r, core, glow) {
    var grad = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 1, x, y, r);
    grad.addColorStop(0, "#ffffff");
    grad.addColorStop(0.35, core);
    grad.addColorStop(1, glow);
    ctx.shadowColor = core;
    ctx.shadowBlur = 22;
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  function draw() {
    // Rink background gradient.
    var bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#141a33");
    bg.addColorStop(0.5, "#0d1124");
    bg.addColorStop(1, "#141a33");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Glowing center line and circle.
    ctx.strokeStyle = "rgba(124,92,255,0.55)";
    ctx.shadowColor = "#7c5cff";
    ctx.shadowBlur = 12;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(W / 2, H / 2, 50, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(W / 2, H / 2, 6, 0, Math.PI * 2); ctx.stroke();
    ctx.shadowBlur = 0;

    // Glowing goals.
    var goalLeft = W / 2 - GOAL_W / 2, goalRight = W / 2 + GOAL_W / 2;
    ctx.lineWidth = 6;
    ctx.strokeStyle = "#29e0c9";
    ctx.shadowColor = "#29e0c9";
    ctx.shadowBlur = 18;
    ctx.beginPath(); ctx.moveTo(goalLeft, 3); ctx.lineTo(goalRight, 3); ctx.stroke();
    ctx.strokeStyle = "#ff5da2";
    ctx.shadowColor = "#ff5da2";
    ctx.beginPath(); ctx.moveTo(goalLeft, H - 3); ctx.lineTo(goalRight, H - 3); ctx.stroke();
    ctx.shadowBlur = 0;

    // Puck trail.
    trail.forEach(function (tp, i) {
      ctx.globalAlpha = (i / trail.length) * 0.5;
      ctx.fillStyle = "#dbe4ff";
      ctx.beginPath();
      ctx.arc(tp.x, tp.y, Math.max(0.1, PUCK_R * (i / trail.length)), 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    // Paddles.
    glowDisc(cpu.x, cpu.y, PADDLE_R, "#ff5da2", "rgba(255,93,162,0.15)");
    glowDisc(player.x, player.y, PADDLE_R, "#29e0c9", "rgba(41,224,201,0.15)");

    // Puck.
    glowDisc(puck.x, puck.y, PUCK_R, "#cfd8ff", "rgba(124,92,255,0.2)");

    // Particles.
    particles = particles.filter(function (p) { return p.life > 0; });
    particles.forEach(function (p) {
      p.x += p.vx; p.y += p.vy; p.vx *= 0.96; p.vy *= 0.96; p.life -= 0.03;
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.1, 3 * p.life), 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  function loop() {
    update();
    draw();
    if (!over) loopId = requestAnimationFrame(loop);
  }

  function setPointerFromEvent(clientX, clientY) {
    var rect = canvas.getBoundingClientRect();
    pointerTarget = {
      x: (clientX - rect.left) * (W / rect.width),
      y: (clientY - rect.top) * (H / rect.height)
    };
  }

  canvas.addEventListener("mousemove", function (e) { setPointerFromEvent(e.clientX, e.clientY); });
  canvas.addEventListener("touchmove", function (e) {
    e.preventDefault();
    setPointerFromEvent(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: false });
  canvas.addEventListener("touchstart", function (e) {
    setPointerFromEvent(e.touches[0].clientX, e.touches[0].clientY);
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
