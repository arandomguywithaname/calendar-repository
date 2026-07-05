(function () {
  var GAME_ID = "pong";
  var canvas = document.getElementById("board");
  var ctx = canvas.getContext("2d");
  var scoreEl = document.getElementById("score");
  var cpuScoreEl = document.getElementById("cpuScore");
  var bestEl = document.getElementById("best");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");
  var diffEl = document.getElementById("difficulty");

  var W = canvas.width, H = canvas.height;
  var WIN_SCORE = 7;

  // Per-difficulty tuning. paddleH = your paddle height, ballSpeed = launch speed,
  // accel = how much the ball speeds up on each paddle hit, cpuSpeed/cpuErr = CPU quality.
  var DIFFICULTIES = {
    easy: { paddleH: 96, ballSpeed: 3.2, accel: 1.0, cpuSpeed: 3.0, cpuErr: 55, maxSpeed: 8 },
    medium: { paddleH: 70, ballSpeed: 4.4, accel: 1.05, cpuSpeed: 4.4, cpuErr: 40, maxSpeed: 11 },
    hard: { paddleH: 52, ballSpeed: 5.6, accel: 1.09, cpuSpeed: 6.2, cpuErr: 18, maxSpeed: 15 }
  };
  var cfg = DIFFICULTIES.medium;

  var PADDLE_W = 12;
  var player, cpu, ball, trail, particles, score, cpuScore, over, loopId;

  function refreshHud() {
    scoreEl.textContent = score;
    cpuScoreEl.textContent = cpuScore;
    bestEl.textContent = window.ArcadeCommon.getBest(GAME_ID) || 0;
  }

  function resetBall(dir) {
    ball = {
      x: W / 2, y: H / 2,
      vx: cfg.ballSpeed * (dir || (Math.random() < 0.5 ? 1 : -1)),
      vy: (Math.random() * 4 - 2)
    };
    trail = [];
  }

  function newGame() {
    player = { y: H / 2 - cfg.paddleH / 2 };
    cpu = { y: H / 2 - cfg.paddleH / 2, err: 0 };
    score = 0;
    cpuScore = 0;
    over = false;
    particles = [];
    resultBanner.innerHTML = "";
    resetBall();
    refreshHud();
    cancelAnimationFrame(loopId);
    loop();
  }

  function spawnParticles(x, y, color, count) {
    for (var i = 0; i < (count || 14); i++) {
      var ang = Math.random() * Math.PI * 2;
      var spd = 1 + Math.random() * 3.5;
      particles.push({
        x: x, y: y,
        vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
        life: 1, color: color
      });
    }
  }

  function update() {
    if (over) return;

    trail.push({ x: ball.x, y: ball.y });
    if (trail.length > 14) trail.shift();

    ball.x += ball.vx;
    ball.y += ball.vy;

    if (ball.y < 6) { ball.y = 6; ball.vy *= -1; }
    if (ball.y > H - 6) { ball.y = H - 6; ball.vy *= -1; }

    var ph = cfg.paddleH;

    // Player paddle collision (left side)
    if (ball.x - 6 < PADDLE_W + 4 && ball.x - 6 > 4 &&
        ball.y > player.y && ball.y < player.y + ph && ball.vx < 0) {
      ball.x = PADDLE_W + 10;
      ball.vx *= -cfg.accel;
      var rel = (ball.y - (player.y + ph / 2)) / (ph / 2);
      ball.vy = rel * 5;
      spawnParticles(ball.x, ball.y, "#29e0c9", 12);
    }

    // CPU paddle collision (right side)
    if (ball.x + 6 > W - PADDLE_W - 4 && ball.x + 6 < W - 4 &&
        ball.y > cpu.y && ball.y < cpu.y + ph && ball.vx > 0) {
      ball.x = W - PADDLE_W - 10;
      ball.vx *= -cfg.accel;
      var rel2 = (ball.y - (cpu.y + ph / 2)) / (ph / 2);
      ball.vy = rel2 * 5;
      spawnParticles(ball.x, ball.y, "#ff5da2", 12);
    }

    // Cap speed
    var maxSpeed = cfg.maxSpeed;
    ball.vx = Math.max(-maxSpeed, Math.min(maxSpeed, ball.vx));
    ball.vy = Math.max(-maxSpeed, Math.min(maxSpeed, ball.vy));

    // Score
    if (ball.x < -10) {
      cpuScore++;
      spawnParticles(20, ball.y, "#ff5da2", 22);
      refreshHud();
      checkWin();
      if (!over) resetBall(1);
    } else if (ball.x > W + 10) {
      score++;
      spawnParticles(W - 20, ball.y, "#29e0c9", 22);
      refreshHud();
      checkWin();
      if (!over) resetBall(-1);
    }

    // CPU AI: track ball with lag/imperfection scaled by difficulty.
    cpu.err += (Math.random() - 0.5) * (cfg.cpuErr / 24);
    cpu.err = Math.max(-cfg.cpuErr, Math.min(cfg.cpuErr, cpu.err));
    var target = ball.y - ph / 2 + cpu.err;
    if (cpu.y < target) cpu.y = Math.min(cpu.y + cfg.cpuSpeed, target);
    else cpu.y = Math.max(cpu.y - cfg.cpuSpeed, target);
    cpu.y = Math.max(0, Math.min(H - ph, cpu.y));
  }

  function checkWin() {
    if (score >= WIN_SCORE) {
      over = true;
      window.ArcadeCommon.setBest(GAME_ID, score);
      resultBanner.innerHTML = '<span class="overlay-win">' + window.ArcadeI18n.t("common.youWin") + "</span>";
    } else if (cpuScore >= WIN_SCORE) {
      over = true;
      resultBanner.innerHTML = '<span class="overlay-lose">' + window.ArcadeI18n.t("common.youLose") + "</span>";
    }
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

  function glowPaddle(x, y, color) {
    var ph = cfg.paddleH;
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 22;
    var g = ctx.createLinearGradient(x, y, x + PADDLE_W, y + ph);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(0.4, color);
    g.addColorStop(1, color);
    ctx.fillStyle = g;
    roundRect(x, y, PADDLE_W, ph, 6);
    ctx.fill();
    ctx.restore();
  }

  function draw() {
    // Dark background with faint vertical glow.
    ctx.fillStyle = "#0b0e1c";
    ctx.fillRect(0, 0, W, H);
    var bg = ctx.createRadialGradient(W / 2, H / 2, 20, W / 2, H / 2, H);
    bg.addColorStop(0, "rgba(124,92,255,0.10)");
    bg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Center dashed glowing line.
    ctx.save();
    ctx.shadowColor = "#7c5cff";
    ctx.shadowBlur = 12;
    ctx.strokeStyle = "rgba(124,92,255,0.7)";
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 12]);
    ctx.beginPath();
    ctx.moveTo(W / 2, 0);
    ctx.lineTo(W / 2, H);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    glowPaddle(4, player.y, "#29e0c9");
    glowPaddle(W - PADDLE_W - 4, cpu.y, "#ff5da2");

    // Ball motion trail.
    trail.forEach(function (t, i) {
      var frac = i / trail.length;
      ctx.globalAlpha = frac * 0.5;
      ctx.fillStyle = "#eaf6ff";
      ctx.beginPath();
      ctx.arc(t.x, t.y, 6 * frac, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    // Glowing ball.
    ctx.save();
    var grad = ctx.createRadialGradient(ball.x, ball.y, 1, ball.x, ball.y, 16);
    grad.addColorStop(0, "#ffffff");
    grad.addColorStop(0.4, "#bff6ff");
    grad.addColorStop(1, "rgba(41,224,201,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowColor = "#29e0c9";
    ctx.shadowBlur = 18;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Particles.
    particles = particles.filter(function (p) { return p.life > 0; });
    particles.forEach(function (p) {
      p.x += p.vx; p.y += p.vy; p.vx *= 0.94; p.vy *= 0.94; p.life -= 0.05;
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3 * p.life + 0.5, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  function loop() {
    update();
    draw();
    if (!over) loopId = requestAnimationFrame(loop);
    else drawFinalParticles();
  }

  // Keep drawing a few frames so the scoring particle flash finishes after game over.
  function drawFinalParticles() {
    if (!particles.length) return;
    draw();
    requestAnimationFrame(drawFinalParticles);
  }

  function setPlayerY(y) {
    player.y = Math.max(0, Math.min(H - cfg.paddleH, y - cfg.paddleH / 2));
  }

  canvas.addEventListener("mousemove", function (e) {
    var rect = canvas.getBoundingClientRect();
    var y = (e.clientY - rect.top) * (H / rect.height);
    setPlayerY(y);
  });

  canvas.addEventListener("touchmove", function (e) {
    e.preventDefault();
    var rect = canvas.getBoundingClientRect();
    var y = (e.touches[0].clientY - rect.top) * (H / rect.height);
    setPlayerY(y);
  }, { passive: false });

  var keys = {};
  document.addEventListener("keydown", function (e) {
    if (e.key === "ArrowUp" || e.key === "ArrowDown") e.preventDefault();
    keys[e.key] = true;
  });
  document.addEventListener("keyup", function (e) { keys[e.key] = false; });

  setInterval(function () {
    if (over) return;
    if (keys.ArrowUp) player.y = Math.max(0, player.y - 6);
    if (keys.ArrowDown) player.y = Math.min(H - cfg.paddleH, player.y + 6);
  }, 16);

  document.getElementById("touch-controls").addEventListener("click", function (e) {
    var btn = e.target.closest("[data-dir]");
    if (!btn || over) return;
    var d = btn.getAttribute("data-dir");
    player.y = Math.max(0, Math.min(H - cfg.paddleH, player.y + (d === "up" ? -30 : 30)));
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
