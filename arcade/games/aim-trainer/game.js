(function () {
  var GAME_ID = "aim-trainer";
  var canvas = document.getElementById("board");
  var ctx = canvas.getContext("2d");
  var scoreEl = document.getElementById("score");
  var bestEl = document.getElementById("best");
  var timeEl = document.getElementById("time");
  var avgEl = document.getElementById("avg");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");
  var diffEl = document.getElementById("difficulty");

  var W = canvas.width, H = canvas.height;

  // Easy = big targets, generous timer; hard = small targets, tight timer.
  var DIFFICULTIES = {
    easy:   { rMin: 28, rMax: 44, duration: 40000, maxTargets: 20 },
    medium: { rMin: 16, rMax: 26, duration: 30000, maxTargets: 20 },
    hard:   { rMin: 9,  rMax: 16, duration: 22000, maxTargets: 26 }
  };
  var cfg = DIFFICULTIES.medium;

  var target, particles, hits, times, spawnTime, startTime, over, rafId;

  function refreshHud() {
    scoreEl.textContent = hits;
    bestEl.textContent = window.ArcadeCommon.getBest(GAME_ID) || 0;
    var remain = Math.max(0, cfg.duration - (Date.now() - startTime));
    timeEl.textContent = (remain / 1000).toFixed(1);
    if (times.length) {
      var sum = times.reduce(function (a, b) { return a + b; }, 0);
      avgEl.textContent = Math.round(sum / times.length);
    } else {
      avgEl.textContent = "-";
    }
  }

  function spawnTarget() {
    var r = window.ArcadeCommon.randInt(cfg.rMin, cfg.rMax);
    target = {
      x: window.ArcadeCommon.randInt(r, W - r),
      y: window.ArcadeCommon.randInt(r, H - r),
      r: r
    };
    spawnTime = Date.now();
  }

  function spawnParticles(cx, cy, color) {
    for (var i = 0; i < 16; i++) {
      var ang = Math.random() * Math.PI * 2;
      var spd = 1.5 + Math.random() * 4;
      particles.push({ x: cx, y: cy, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, life: 1, color: color });
    }
  }

  function newGame() {
    hits = 0;
    times = [];
    particles = [];
    over = false;
    startTime = Date.now();
    resultBanner.innerHTML = "";
    spawnTarget();
    refreshHud();
    cancelAnimationFrame(rafId);
    loop();
  }

  function endGame() {
    over = true;
    target = null;
    var isBest = window.ArcadeCommon.setBest(GAME_ID, hits);
    refreshHud();
    var avgText = times.length ? Math.round(times.reduce(function (a, b) { return a + b; }, 0) / times.length) : "-";
    resultBanner.innerHTML = '<span class="overlay-win">' + window.ArcadeI18n.t("common.gameOver") +
      " — " + hits + " hits, avg " + avgText + "ms" + (isBest ? " — New Best!" : "") + "</span>";
  }

  function drawBackground() {
    ctx.fillStyle = "#0e1224";
    ctx.fillRect(0, 0, W, H);
    var orbs = [
      { x: W * 0.22, y: H * 0.28, c: "rgba(124,92,255,0.16)", r: 160 },
      { x: W * 0.8, y: H * 0.72, c: "rgba(41,224,201,0.13)", r: 180 }
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
    ctx.strokeStyle = "rgba(124,92,255,0.05)";
    ctx.lineWidth = 1;
    for (var gx = 0; gx < W; gx += 32) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke(); }
    for (var gy = 0; gy < H; gy += 32) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke(); }
  }

  function draw() {
    drawBackground();

    if (target) {
      var pulse = 0.5 + 0.5 * Math.sin(Date.now() / 180);
      ctx.save();
      ctx.shadowColor = "#ff5da2";
      ctx.shadowBlur = 18 + pulse * 8;
      var grad = ctx.createRadialGradient(target.x, target.y, 2, target.x, target.y, target.r);
      grad.addColorStop(0, "#ff9dc7");
      grad.addColorStop(0.6, "#ff5da2");
      grad.addColorStop(0.61, "#eef0fb");
      grad.addColorStop(0.8, "#ff5da2");
      grad.addColorStop(1, "#7c5cff");
      ctx.beginPath();
      ctx.arc(target.x, target.y, Math.max(0.1, target.r), 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.restore();
      ctx.beginPath();
      ctx.arc(target.x, target.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = "#eef0fb";
      ctx.fill();
    }

    particles = particles.filter(function (p) { return p.life > 0; });
    particles.forEach(function (p) {
      p.x += p.vx; p.y += p.vy; p.vx *= 0.95; p.vy *= 0.95; p.life -= 0.04;
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.1, 4 * p.life), 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  function loop() {
    if (over) return;
    refreshHud();
    draw();
    if (Date.now() - startTime >= cfg.duration) {
      endGame();
      return;
    }
    rafId = requestAnimationFrame(loop);
  }

  canvas.addEventListener("click", function (e) {
    if (over || !target) return;
    var rect = canvas.getBoundingClientRect();
    var x = (e.clientX - rect.left) * (W / rect.width);
    var y = (e.clientY - rect.top) * (H / rect.height);
    var dx = x - target.x, dy = y - target.y;
    if (Math.sqrt(dx * dx + dy * dy) <= target.r) {
      hits++;
      times.push(Date.now() - spawnTime);
      spawnParticles(target.x, target.y, "#29e0c9");
      if (hits >= cfg.maxTargets) {
        endGame();
        return;
      }
      spawnTarget();
      refreshHud();
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
