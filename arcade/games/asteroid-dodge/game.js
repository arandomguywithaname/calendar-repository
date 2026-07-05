(function () {
  var GAME_ID = "asteroid-dodge";
  var canvas = document.getElementById("board");
  var ctx = canvas.getContext("2d");
  var scoreEl = document.getElementById("score");
  var bestEl = document.getElementById("best");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");
  var diffEl = document.getElementById("difficulty");

  var W = canvas.width, H = canvas.height;
  var SHIP_W = 30, SHIP_H = 32;
  var ROCK_COLORS = ["#ff5da2", "#7c5cff", "#29e0c9", "#ffb84d"];

  // Per-difficulty tuning: base fall speed, how fast speed ramps with time,
  // and spawn interval (base -> min as time passes).
  var DIFFICULTIES = {
    easy: { baseSpeed: 1.4, speedRamp: 0.06, spawnBase: 900, spawnMin: 360, spawnRamp: 8 },
    medium: { baseSpeed: 2.0, speedRamp: 0.12, spawnBase: 700, spawnMin: 200, spawnRamp: 12 },
    hard: { baseSpeed: 3.0, speedRamp: 0.26, spawnBase: 520, spawnMin: 120, spawnRamp: 20 }
  };
  var cfg = DIFFICULTIES.medium;

  var ship, asteroids, particles, stars, over, startTime, score, loopId, spawnTimer, lastFrame;

  function refreshHud() {
    scoreEl.textContent = score;
    bestEl.textContent = window.ArcadeCommon.getBest(GAME_ID) || 0;
  }

  function buildStars() {
    stars = [];
    for (var i = 0; i < 40; i++) {
      stars.push({ x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1.4 + 0.3, s: Math.random() * 0.6 + 0.2 });
    }
  }

  function newGame() {
    ship = { x: W / 2 - SHIP_W / 2 };
    asteroids = [];
    particles = [];
    if (!stars) buildStars();
    over = false;
    score = 0;
    startTime = performance.now();
    spawnTimer = 0;
    resultBanner.innerHTML = "";
    refreshHud();
    cancelAnimationFrame(loopId);
    lastFrame = performance.now();
    loop();
  }

  function spawnAsteroid(elapsedSec) {
    var size = window.ArcadeCommon.randInt(20, 42);
    var speed = cfg.baseSpeed + Math.min(7, elapsedSec * cfg.speedRamp) + Math.random() * 1.5;
    var verts = [];
    var n = window.ArcadeCommon.randInt(7, 10);
    for (var i = 0; i < n; i++) {
      verts.push(0.62 + Math.random() * 0.38);
    }
    asteroids.push({
      x: Math.random() * (W - size),
      y: -size,
      size: size,
      speed: speed,
      rot: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 0.06,
      color: window.ArcadeCommon.pick(ROCK_COLORS),
      verts: verts
    });
  }

  function spawnParticles(x, y, color) {
    for (var i = 0; i < 26; i++) {
      var ang = Math.random() * Math.PI * 2;
      var spd = 1 + Math.random() * 4.5;
      particles.push({ x: x, y: y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, life: 1, color: color });
    }
  }

  function update(dt) {
    if (over) return;
    var elapsedSec = (performance.now() - startTime) / 1000;
    score = Math.floor(elapsedSec * 10);
    refreshHud();

    spawnTimer += dt;
    var spawnInterval = Math.max(cfg.spawnMin, cfg.spawnBase - elapsedSec * cfg.spawnRamp);
    if (spawnTimer > spawnInterval) {
      spawnTimer = 0;
      spawnAsteroid(elapsedSec);
    }

    asteroids.forEach(function (a) { a.y += a.speed; a.rot += a.spin; });
    asteroids = asteroids.filter(function (a) { return a.y < H + 60; });

    var shipY = H - 50;
    for (var i = 0; i < asteroids.length; i++) {
      var a = asteroids[i];
      var cx = Math.max(ship.x, Math.min(a.x + a.size / 2, ship.x + SHIP_W));
      var cy = Math.max(shipY, Math.min(a.y + a.size / 2, shipY + SHIP_H));
      var dx = (a.x + a.size / 2) - cx;
      var dy = (a.y + a.size / 2) - cy;
      if (dx * dx + dy * dy < (a.size / 2) * (a.size / 2) * 0.85) {
        spawnParticles(ship.x + SHIP_W / 2, shipY + SHIP_H / 2, "#29e0c9");
        spawnParticles(a.x + a.size / 2, a.y + a.size / 2, a.color);
        endGame();
        return;
      }
    }
  }

  function endGame() {
    over = true;
    window.ArcadeCommon.setBest(GAME_ID, score);
    resultBanner.innerHTML = '<span class="overlay-lose">' + window.ArcadeI18n.t("common.gameOver") + " — " + window.ArcadeI18n.t("common.score") + ": " + score + "</span>";
  }

  function drawAsteroid(a) {
    ctx.save();
    ctx.translate(a.x + a.size / 2, a.y + a.size / 2);
    ctx.rotate(a.rot);
    ctx.shadowColor = a.color;
    ctx.shadowBlur = 16;
    var rad = a.size / 2;
    var g = ctx.createRadialGradient(-rad * 0.3, -rad * 0.3, 1, 0, 0, rad);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(0.35, a.color);
    g.addColorStop(1, "rgba(0,0,0,0.35)");
    ctx.fillStyle = g;
    ctx.beginPath();
    var n = a.verts.length;
    for (var i = 0; i < n; i++) {
      var ang = (i / n) * Math.PI * 2;
      var r = rad * a.verts[i];
      var px = Math.cos(ang) * r, py = Math.sin(ang) * r;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function draw() {
    ctx.fillStyle = "#05070f";
    ctx.fillRect(0, 0, W, H);
    var bg = ctx.createRadialGradient(W / 2, H, 20, W / 2, H, H);
    bg.addColorStop(0, "rgba(124,92,255,0.12)");
    bg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Parallax stars.
    if (!over) stars.forEach(function (s) { s.y += s.s; if (s.y > H) { s.y = 0; s.x = Math.random() * W; } });
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    stars.forEach(function (s) {
      ctx.globalAlpha = 0.3 + s.s;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    asteroids.forEach(drawAsteroid);

    // Glowing ship (triangle with thruster).
    if (!over) {
      var px = ship.x, py = H - 50;
      ctx.save();
      ctx.shadowColor = "#29e0c9";
      ctx.shadowBlur = 20;
      var sg = ctx.createLinearGradient(px, py, px, py + SHIP_H);
      sg.addColorStop(0, "#bff6ff");
      sg.addColorStop(1, "#29e0c9");
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.moveTo(px + SHIP_W / 2, py);
      ctx.lineTo(px + SHIP_W, py + SHIP_H);
      ctx.lineTo(px + SHIP_W / 2, py + SHIP_H - 8);
      ctx.lineTo(px, py + SHIP_H);
      ctx.closePath();
      ctx.fill();
      // Thruster flame.
      ctx.shadowColor = "#ffb84d";
      var flame = 6 + Math.random() * 6;
      ctx.fillStyle = "#ffd23f";
      ctx.beginPath();
      ctx.moveTo(px + SHIP_W / 2 - 4, py + SHIP_H - 6);
      ctx.lineTo(px + SHIP_W / 2, py + SHIP_H - 6 + flame);
      ctx.lineTo(px + SHIP_W / 2 + 4, py + SHIP_H - 6);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // Particles.
    particles = particles.filter(function (p) { return p.life > 0; });
    particles.forEach(function (p) {
      p.x += p.vx; p.y += p.vy; p.vx *= 0.95; p.vy *= 0.95; p.life -= 0.03;
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3.5 * p.life + 0.5, 0, Math.PI * 2);
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
    else finish();
  }

  function finish() {
    if (!particles.length) return;
    draw();
    requestAnimationFrame(finish);
  }

  function setShipX(x) {
    ship.x = Math.max(0, Math.min(W - SHIP_W, x - SHIP_W / 2));
  }

  canvas.addEventListener("mousemove", function (e) {
    var rect = canvas.getBoundingClientRect();
    setShipX((e.clientX - rect.left) * (W / rect.width));
  });

  canvas.addEventListener("touchmove", function (e) {
    e.preventDefault();
    var rect = canvas.getBoundingClientRect();
    setShipX((e.touches[0].clientX - rect.left) * (W / rect.width));
  }, { passive: false });

  var keys = {};
  document.addEventListener("keydown", function (e) {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") e.preventDefault();
    keys[e.key] = true;
  });
  document.addEventListener("keyup", function (e) { keys[e.key] = false; });

  setInterval(function () {
    if (over) return;
    if (keys.ArrowLeft) ship.x = Math.max(0, ship.x - 6);
    if (keys.ArrowRight) ship.x = Math.min(W - SHIP_W, ship.x + 6);
  }, 16);

  document.getElementById("touch-controls").addEventListener("click", function (e) {
    var btn = e.target.closest("[data-dir]");
    if (!btn || over) return;
    var d = btn.getAttribute("data-dir");
    ship.x = Math.max(0, Math.min(W - SHIP_W, ship.x + (d === "left" ? -30 : 30)));
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
