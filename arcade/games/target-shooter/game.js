(function () {
  var GAME_ID = "target-shooter";
  var canvas = document.getElementById("board");
  var ctx = canvas.getContext("2d");
  var scoreEl = document.getElementById("score");
  var timeEl = document.getElementById("time");
  var bestEl = document.getElementById("best");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");
  var diffEl = document.getElementById("difficulty");

  var W = canvas.width, H = canvas.height;
  var GAME_TIME = 30;

  // Per-difficulty tuning: easy = big, slow-shrinking, long-lived targets;
  // hard = small, fast-shrinking, short-lived targets worth more.
  var DIFFICULTIES = {
    easy:   { rMin: 30, rMax: 54, lifeMin: 1500, lifeMax: 2800, max: 4, spawnMin: 380, spawnMax: 720, shrink: 0.22 },
    medium: { rMin: 16, rMax: 40, lifeMin: 650,  lifeMax: 1600, max: 3, spawnMin: 450, spawnMax: 850, shrink: 0.45 },
    hard:   { rMin: 10, rMax: 26, lifeMin: 480,  lifeMax: 1050, max: 3, spawnMin: 340, spawnMax: 640, shrink: 0.62 }
  };
  var cfg = DIFFICULTIES.medium;

  var targets, particles, score, timeLeft, over, spawnTimer, tickTimer, loopId, lastFrame;

  function refreshHud() {
    scoreEl.textContent = score;
    timeEl.textContent = timeLeft;
    bestEl.textContent = window.ArcadeCommon.getBest(GAME_ID) || 0;
  }

  function newGame() {
    targets = [];
    particles = [];
    score = 0;
    timeLeft = GAME_TIME;
    over = false;
    resultBanner.innerHTML = "";
    refreshHud();
    clearInterval(tickTimer);
    tickTimer = setInterval(function () {
      if (over) return;
      timeLeft--;
      refreshHud();
      if (timeLeft <= 0) endGame();
    }, 1000);
    cancelAnimationFrame(loopId);
    lastFrame = performance.now();
    spawnTimer = 0;
    loop();
  }

  function spawnTarget() {
    var radius = window.ArcadeCommon.randInt(cfg.rMin, cfg.rMax);
    var lifetime = window.ArcadeCommon.randInt(cfg.lifeMin, cfg.lifeMax);
    var points = Math.max(5, Math.round((cfg.rMax + 6 - radius) * 2 + (cfg.lifeMax - lifetime) / 40));
    targets.push({
      x: window.ArcadeCommon.randInt(radius + 10, W - radius - 10),
      y: window.ArcadeCommon.randInt(radius + 10, H - radius - 10),
      radius: radius,
      lifetime: lifetime,
      born: performance.now(),
      points: points,
      hue: window.ArcadeCommon.pick(["#ff5da2", "#7c5cff", "#29e0c9", "#ffd23f"]),
      hit: false
    });
  }

  function spawnParticles(cx, cy, color, n) {
    for (var i = 0; i < (n || 14); i++) {
      var ang = Math.random() * Math.PI * 2;
      var spd = 1.5 + Math.random() * 3.5;
      particles.push({ x: cx, y: cy, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, life: 1, color: color });
    }
  }

  function update(dt) {
    if (over) return;
    spawnTimer += dt;
    var interval = window.ArcadeCommon.randInt(cfg.spawnMin, cfg.spawnMax);
    if (spawnTimer > interval && targets.length < cfg.max) {
      spawnTimer = 0;
      spawnTarget();
    }
    var now = performance.now();
    targets = targets.filter(function (t) {
      return !t.hit && (now - t.born) < t.lifetime;
    });
  }

  function drawBackground() {
    ctx.fillStyle = "#0e1224";
    ctx.fillRect(0, 0, W, H);
    // Glow orbs.
    var orbs = [
      { x: W * 0.2, y: H * 0.25, c: "rgba(124,92,255,0.16)", r: 150 },
      { x: W * 0.82, y: H * 0.75, c: "rgba(41,224,201,0.12)", r: 170 }
    ];
    orbs.forEach(function (o) {
      var g = ctx.createRadialGradient(o.x, o.y, 4, o.x, o.y, o.r);
      g.addColorStop(0, o.c);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
      ctx.fill();
    });
    // Faint grid.
    ctx.strokeStyle = "rgba(124,92,255,0.06)";
    ctx.lineWidth = 1;
    for (var gx = 0; gx < W; gx += 32) {
      ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke();
    }
    for (var gy = 0; gy < H; gy += 32) {
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke();
    }
  }

  function draw() {
    drawBackground();

    var now = performance.now();
    targets.forEach(function (t) {
      var progress = (now - t.born) / t.lifetime;
      var r = Math.max(0.1, t.radius * (1 - progress * cfg.shrink));
      var alpha = Math.max(0, 1 - progress * 0.85);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.shadowColor = t.hue;
      ctx.shadowBlur = 22;
      // Outer neon ring.
      ctx.beginPath();
      ctx.arc(t.x, t.y, r, 0, Math.PI * 2);
      ctx.fillStyle = t.hue;
      ctx.fill();
      ctx.shadowBlur = 0;
      // Inner light ring.
      ctx.beginPath();
      ctx.arc(t.x, t.y, Math.max(0.1, r * 0.62), 0, Math.PI * 2);
      ctx.fillStyle = "#eef0fb";
      ctx.fill();
      // Bullseye.
      ctx.beginPath();
      ctx.arc(t.x, t.y, Math.max(0.1, r * 0.28), 0, Math.PI * 2);
      ctx.fillStyle = t.hue;
      ctx.fill();
      ctx.restore();
    });

    // Particles.
    particles = particles.filter(function (p) { return p.life > 0; });
    particles.forEach(function (p) {
      p.x += p.vx; p.y += p.vy; p.vx *= 0.96; p.vy *= 0.96; p.life -= 0.035;
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.1, 4 * p.life), 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  function loop(now) {
    now = now || performance.now();
    var dt = Math.min(50, now - lastFrame);
    lastFrame = now;
    update(dt);
    draw();
    if (!over) loopId = requestAnimationFrame(loop);
  }

  function endGame() {
    over = true;
    clearInterval(tickTimer);
    var improved = window.ArcadeCommon.setBest(GAME_ID, score);
    resultBanner.innerHTML = '<span class="overlay-win">' + window.ArcadeI18n.t("common.gameOver") +
      " — " + window.ArcadeI18n.t("common.score") + ": " + score + (improved ? " 🏆" : "") + "</span>";
    refreshHud();
    // Keep drawing so particle bursts finish.
    draw();
  }

  canvas.addEventListener("click", function (e) {
    if (over) return;
    var rect = canvas.getBoundingClientRect();
    var x = (e.clientX - rect.left) * (W / rect.width);
    var y = (e.clientY - rect.top) * (H / rect.height);
    var now = performance.now();
    for (var i = targets.length - 1; i >= 0; i--) {
      var t = targets[i];
      if (t.hit) continue;
      var progress = (now - t.born) / t.lifetime;
      var r = t.radius * (1 - progress * cfg.shrink);
      var dx = x - t.x, dy = y - t.y;
      if (dx * dx + dy * dy <= r * r) {
        t.hit = true;
        score += t.points;
        spawnParticles(t.x, t.y, t.hue, 16);
        window.ArcadeCommon.toast("+" + t.points);
        refreshHud();
        break;
      }
    }
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
