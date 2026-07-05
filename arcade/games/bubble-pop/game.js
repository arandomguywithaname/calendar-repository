(function () {
  var GAME_ID = "bubble-pop";
  var canvas = document.getElementById("board");
  var ctx = canvas.getContext("2d");
  var scoreEl = document.getElementById("score");
  var bestEl = document.getElementById("best");
  var timeEl = document.getElementById("time");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");
  var diffEl = document.getElementById("difficulty");

  var W = canvas.width, H = canvas.height;
  var DURATION = 45000;
  var COLORS = ["#ff5da2", "#7c5cff", "#29e0c9", "#3ddc84", "#ffb84d"];

  // Easy = slow, big, sparse; hard = fast, small, dense.
  var DIFFICULTIES = {
    easy:   { rMin: 22, rMax: 44, rFloor: 16, speedMul: 0.7, spawnBase: 860, spawnFloor: 300 },
    medium: { rMin: 14, rMax: 34, rFloor: 10, speedMul: 1.0, spawnBase: 650, spawnFloor: 130 },
    hard:   { rMin: 10, rMax: 24, rFloor: 8,  speedMul: 1.4, spawnBase: 470, spawnFloor: 90 }
  };
  var cfg = DIFFICULTIES.medium;

  var bubbles, particles, score, over, startTime, spawnTimer, rafId;

  function refreshHud() {
    scoreEl.textContent = score;
    bestEl.textContent = window.ArcadeCommon.getBest(GAME_ID) || 0;
    var remain = Math.max(0, DURATION - (Date.now() - startTime));
    timeEl.textContent = Math.ceil(remain / 1000);
  }

  function difficulty() {
    var t = (Date.now() - startTime) / DURATION; // 0..1
    return Math.min(1, t);
  }

  function spawnBubble() {
    var d = difficulty();
    var r = window.ArcadeCommon.randInt(cfg.rMin, cfg.rMax) - d * 8;
    r = Math.max(cfg.rFloor, r);
    var speed = (1.2 + d * 2.2 + (cfg.rMax - r) / cfg.rMax * 1.5) * cfg.speedMul;
    bubbles.push({
      x: window.ArcadeCommon.randInt(r, W - r),
      y: H + r,
      r: r,
      speed: speed + Math.random() * 0.6,
      color: window.ArcadeCommon.pick(COLORS),
      wobble: Math.random() * Math.PI * 2,
      popped: false,
      popT: 0
    });
  }

  function scoreFor(r) {
    return Math.max(1, Math.round(30 / r));
  }

  function spawnParticles(cx, cy, color) {
    for (var i = 0; i < 10; i++) {
      var ang = Math.random() * Math.PI * 2;
      var spd = 1 + Math.random() * 3;
      particles.push({ x: cx, y: cy, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, life: 1, color: color });
    }
  }

  function newGame() {
    bubbles = [];
    particles = [];
    score = 0;
    over = false;
    startTime = Date.now();
    resultBanner.innerHTML = "";
    refreshHud();
    cancelAnimationFrame(rafId);
    clearTimeout(spawnTimer);
    scheduleSpawns();
    loop();
  }

  function scheduleSpawns() {
    function tick() {
      if (over) return;
      spawnBubble();
      var d = difficulty();
      var delay = cfg.spawnBase - d * 400 + Math.random() * 200;
      spawnTimer = setTimeout(tick, Math.max(cfg.spawnFloor, delay));
    }
    tick();
  }

  function endGame() {
    over = true;
    clearTimeout(spawnTimer);
    var isBest = window.ArcadeCommon.setBest(GAME_ID, score);
    refreshHud();
    resultBanner.innerHTML = '<span class="overlay-win">' + window.ArcadeI18n.t("common.gameOver") +
      " — Score: " + score + (isBest ? " — New Best!" : "") + "</span>";
  }

  function update() {
    if (over) return;
    for (var i = bubbles.length - 1; i >= 0; i--) {
      var b = bubbles[i];
      if (b.popped) {
        b.popT += 0.08;
        if (b.popT >= 1) bubbles.splice(i, 1);
        continue;
      }
      b.wobble += 0.05;
      b.x += Math.sin(b.wobble) * 0.6;
      b.y -= b.speed;
      if (b.y + b.r < 0) bubbles.splice(i, 1);
    }
    for (var j = particles.length - 1; j >= 0; j--) {
      var p = particles[j];
      p.x += p.vx; p.y += p.vy; p.vx *= 0.94; p.vy *= 0.94; p.life -= 0.045;
      if (p.life <= 0) particles.splice(j, 1);
    }
    if (Date.now() - startTime >= DURATION) {
      endGame();
    }
  }

  function drawBackground() {
    ctx.fillStyle = "#0e1224";
    ctx.fillRect(0, 0, W, H);
    [{ x: W * 0.25, y: H * 0.3, c: "rgba(124,92,255,0.16)", r: 170 },
     { x: W * 0.78, y: H * 0.72, c: "rgba(41,224,201,0.13)", r: 190 }].forEach(function (o) {
      var g = ctx.createRadialGradient(o.x, o.y, 4, o.x, o.y, o.r);
      g.addColorStop(0, o.c); g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2); ctx.fill();
    });
  }

  function draw() {
    drawBackground();

    bubbles.forEach(function (b) {
      ctx.save();
      if (b.popped) {
        ctx.globalAlpha = 1 - b.popT;
        ctx.shadowColor = b.color;
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.arc(b.x, b.y, Math.max(0.1, b.r * (1 + b.popT * 0.8)), 0, Math.PI * 2);
        ctx.strokeStyle = b.color;
        ctx.lineWidth = 3;
        ctx.stroke();
      } else {
        ctx.shadowColor = b.color;
        ctx.shadowBlur = 16;
        ctx.beginPath();
        ctx.arc(b.x, b.y, Math.max(0.1, b.r), 0, Math.PI * 2);
        ctx.fillStyle = b.color + "44";
        ctx.fill();
        ctx.strokeStyle = b.color;
        ctx.lineWidth = 2.4;
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.arc(b.x - b.r * 0.35, b.y - b.r * 0.35, Math.max(0.1, b.r * 0.25), 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,0.7)";
        ctx.fill();
      }
      ctx.restore();
    });

    particles.forEach(function (p) {
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.1, 3.5 * p.life), 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  function loop() {
    update();
    draw();
    refreshHud();
    if (!over) rafId = requestAnimationFrame(loop);
  }

  canvas.addEventListener("click", function (e) {
    if (over) return;
    var rect = canvas.getBoundingClientRect();
    var x = (e.clientX - rect.left) * (W / rect.width);
    var y = (e.clientY - rect.top) * (H / rect.height);
    for (var i = bubbles.length - 1; i >= 0; i--) {
      var b = bubbles[i];
      if (b.popped) continue;
      var dx = x - b.x, dy = y - b.y;
      if (Math.sqrt(dx * dx + dy * dy) <= b.r) {
        b.popped = true;
        b.popT = 0;
        spawnParticles(b.x, b.y, b.color);
        score += scoreFor(b.r);
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
