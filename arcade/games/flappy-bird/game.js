(function () {
  var GAME_ID = "flappy-bird";
  var canvas = document.getElementById("board");
  var ctx = canvas.getContext("2d");
  var scoreEl = document.getElementById("score");
  var bestEl = document.getElementById("best");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");
  var flapBtn = document.getElementById("flap");
  var diffEl = document.getElementById("difficulty");

  var W = canvas.width, H = canvas.height;
  var BIRD_X = 70, BIRD_R = 14;
  var PIPE_W = 60;

  // Difficulty tuning. All timing is per-animation-frame (~60fps), never a
  // multi-second interval - gap = vertical opening, spawnEvery = frames
  // between pipes, speed = horizontal pixels/frame, gravity/flap tune feel.
  var DIFFICULTIES = {
    easy:   { gap: 175, speed: 2.0, gravity: 0.42, flap: -7.5, spawnEvery: 110 },
    medium: { gap: 140, speed: 2.7, gravity: 0.50, flap: -8.0, spawnEvery: 92 },
    hard:   { gap: 112, speed: 3.5, gravity: 0.56, flap: -8.5, spawnEvery: 74 }
  };
  var cfg = DIFFICULTIES.medium;

  var bird, pipes, score, over, started, loopId, spawnTimer, particles, trail;

  function refreshHud() {
    scoreEl.textContent = score;
    bestEl.textContent = window.ArcadeCommon.getBest(GAME_ID) || 0;
  }

  function newGame() {
    bird = { y: H / 2, v: 0, rot: 0 };
    pipes = [];
    particles = [];
    trail = [];
    score = 0;
    over = false;
    started = false;
    spawnTimer = 0;
    resultBanner.innerHTML = "";
    refreshHud();
    cancelAnimationFrame(loopId);
    loopId = requestAnimationFrame(loop);
  }

  function spawnPipe() {
    var gapY = window.ArcadeCommon.randInt(50, H - 50 - cfg.gap);
    pipes.push({ x: W, gapY: gapY, passed: false });
  }

  function burst(x, y, color, n) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2;
      var s = 1 + Math.random() * 3;
      particles.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, color: color });
    }
  }

  function update() {
    if (!started || over) return;

    bird.v += cfg.gravity;
    bird.y += bird.v;
    bird.rot = Math.max(-0.5, Math.min(1.2, bird.v / 12));

    trail.push({ x: BIRD_X, y: bird.y });
    if (trail.length > 12) trail.shift();

    spawnTimer++;
    if (spawnTimer >= cfg.spawnEvery) {
      spawnTimer = 0;
      spawnPipe();
    }

    pipes.forEach(function (p) { p.x -= cfg.speed; });
    pipes = pipes.filter(function (p) { return p.x > -PIPE_W; });

    pipes.forEach(function (p) {
      if (!p.passed && p.x + PIPE_W < BIRD_X) {
        p.passed = true;
        score++;
        burst(BIRD_X, bird.y, "#29e0c9", 8);
        refreshHud();
      }
      if (BIRD_X + BIRD_R > p.x && BIRD_X - BIRD_R < p.x + PIPE_W) {
        if (bird.y - BIRD_R < p.gapY || bird.y + BIRD_R > p.gapY + cfg.gap) {
          endGame();
        }
      }
    });

    if (bird.y - BIRD_R < 0 || bird.y + BIRD_R > H) endGame();
  }

  function endGame() {
    if (over) return;
    over = true;
    burst(BIRD_X, bird.y, "#ff5da2", 18);
    var isBest = window.ArcadeCommon.setBest(GAME_ID, score);
    refreshHud();
    var msg = window.ArcadeI18n.t("common.gameOver");
    if (isBest && score > 0) msg += " 🏆";
    resultBanner.innerHTML = '<span class="overlay-lose">' + msg + "</span>";
  }

  function neonPipe(x, y, w, h) {
    var grad = ctx.createLinearGradient(x, 0, x + w, 0);
    grad.addColorStop(0, "#1f9d6b");
    grad.addColorStop(0.5, "#3ddc84");
    grad.addColorStop(1, "#1f9d6b");
    ctx.shadowColor = "#3ddc84";
    ctx.shadowBlur = 14;
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w, h);
    ctx.shadowBlur = 0;
    // Bright rim highlight.
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.fillRect(x, y, 4, h);
  }

  function draw() {
    // Background with faint vertical grid lines for a neon-arcade feel.
    ctx.fillStyle = "#0e1224";
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(124,92,255,0.08)";
    ctx.lineWidth = 1;
    for (var gx = 0; gx < W; gx += 30) {
      ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke();
    }

    pipes.forEach(function (p) {
      neonPipe(p.x, 0, PIPE_W, p.gapY);
      neonPipe(p.x, p.gapY + cfg.gap, PIPE_W, H - (p.gapY + cfg.gap));
    });

    // Fading motion trail behind the bird.
    trail.forEach(function (tp, i) {
      var alpha = (i / trail.length) * 0.4;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "#ffd23f";
      ctx.beginPath();
      ctx.arc(tp.x, tp.y, BIRD_R * (i / trail.length), 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    // Glowing bird.
    ctx.save();
    ctx.translate(BIRD_X, bird.y);
    ctx.rotate(bird.rot);
    ctx.shadowColor = "#ffd23f";
    ctx.shadowBlur = 16;
    ctx.font = "28px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("🐦", 0, 10);
    ctx.restore();
    ctx.shadowBlur = 0;

    // Particles.
    particles = particles.filter(function (pt) { return pt.life > 0; });
    particles.forEach(function (pt) {
      pt.x += pt.vx; pt.y += pt.vy; pt.vy += 0.06; pt.life -= 0.03;
      ctx.globalAlpha = Math.max(0, pt.life);
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, Math.max(0.1, 3 * pt.life), 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    if (!started && !over) {
      ctx.fillStyle = "#eef0fb";
      ctx.font = "bold 16px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Click / Space to start", W / 2, H / 2 - 30);
    }
  }

  function loop() {
    update();
    draw();
    loopId = requestAnimationFrame(loop);
  }

  function flap() {
    if (over) return;
    if (!started) started = true;
    bird.v = cfg.flap;
  }

  document.addEventListener("keydown", function (e) {
    if (e.key === " " || e.key === "ArrowUp") { e.preventDefault(); flap(); }
  });
  canvas.addEventListener("mousedown", flap);
  canvas.addEventListener("touchstart", function (e) { e.preventDefault(); flap(); }, { passive: false });
  flapBtn.addEventListener("click", flap);
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
