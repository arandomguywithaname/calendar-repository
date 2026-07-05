(function () {
  var GAME_ID = "balance-ball";
  var canvas = document.getElementById("board");
  var ctx = canvas.getContext("2d");
  var scoreEl = document.getElementById("score");
  var bestEl = document.getElementById("best");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");
  var touchControls = document.getElementById("touch-controls");
  var diffEl = document.getElementById("difficulty");

  var W = canvas.width, H = canvas.height;
  var CENTER_X = W / 2, CENTER_Y = H / 2;
  var BASE_R = W / 2 - 14;
  var BALL_R = 14;
  var FRICTION = 0.985;
  var TILT_MAX = 1;
  var TILT_KEY_RATE = 0.045;
  var TILT_DECAY = 0.06;

  // Easy = gentle gravity, wide platform; hard = strong gravity, narrow platform.
  var DIFFICULTIES = {
    easy:   { accel: 0.42, platformR: BASE_R },
    medium: { accel: 0.55, platformR: BASE_R * 0.86 },
    hard:   { accel: 0.74, platformR: BASE_R * 0.68 }
  };
  var cfg = DIFFICULTIES.medium;
  var platformR = cfg.platformR;

  var ballX, ballY, ballVX, ballVY, tiltX, tiltY, over, startTime, elapsed, particles, trail, rafId;
  var keys = { up: false, down: false, left: false, right: false };
  var mouseActive = false;

  function refreshHud() {
    scoreEl.textContent = elapsed;
    bestEl.textContent = window.ArcadeCommon.getBest(GAME_ID) || 0;
  }

  function newGame() {
    platformR = cfg.platformR;
    ballX = CENTER_X + window.ArcadeCommon.randInt(-20, 20);
    ballY = CENTER_Y + window.ArcadeCommon.randInt(-20, 20);
    ballVX = 0;
    ballVY = 0;
    tiltX = 0;
    tiltY = 0;
    over = false;
    elapsed = 0;
    startTime = Date.now();
    mouseActive = false;
    particles = [];
    trail = [];
    resultBanner.innerHTML = "";
    refreshHud();
    cancelAnimationFrame(rafId);
    loop();
  }

  function spawnBurst(cx, cy) {
    for (var i = 0; i < 22; i++) {
      var ang = Math.random() * Math.PI * 2;
      var spd = 1.5 + Math.random() * 4;
      particles.push({ x: cx, y: cy, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, life: 1, color: window.ArcadeCommon.pick(["#ff5da2", "#7c5cff", "#29e0c9", "#ffd23f"]) });
    }
  }

  function endGame() {
    over = true;
    spawnBurst(ballX, ballY);
    var isBest = window.ArcadeCommon.setBest(GAME_ID, elapsed);
    resultBanner.innerHTML = '<span class="overlay-lose">' + window.ArcadeI18n.t("common.gameOver") +
      " — Survived " + elapsed + "s" + (isBest ? " — New Best!" : "") + "</span>";
  }

  function update() {
    if (over) return;

    if (!mouseActive) {
      if (keys.left) tiltX -= TILT_KEY_RATE;
      if (keys.right) tiltX += TILT_KEY_RATE;
      if (keys.up) tiltY -= TILT_KEY_RATE;
      if (keys.down) tiltY += TILT_KEY_RATE;
      if (!keys.left && !keys.right) tiltX *= (1 - TILT_DECAY);
      if (!keys.up && !keys.down) tiltY *= (1 - TILT_DECAY);
      tiltX = Math.max(-TILT_MAX, Math.min(TILT_MAX, tiltX));
      tiltY = Math.max(-TILT_MAX, Math.min(TILT_MAX, tiltY));
    }

    ballVX += tiltX * cfg.accel;
    ballVY += tiltY * cfg.accel;
    ballVX *= FRICTION;
    ballVY *= FRICTION;
    ballX += ballVX;
    ballY += ballVY;

    trail.push({ x: ballX, y: ballY });
    if (trail.length > 12) trail.shift();

    var dx = ballX - CENTER_X, dy = ballY - CENTER_Y;
    var dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > platformR - BALL_R) {
      endGame();
      return;
    }

    elapsed = Math.floor((Date.now() - startTime) / 1000);
    refreshHud();
  }

  function updateParticles() {
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.x += p.vx; p.y += p.vy; p.vx *= 0.96; p.vy *= 0.96; p.life -= 0.025;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  function draw() {
    ctx.fillStyle = "#0e1224";
    ctx.fillRect(0, 0, W, H);
    [{ x: W * 0.24, y: H * 0.24, c: "rgba(124,92,255,0.16)", r: 170 },
     { x: W * 0.78, y: H * 0.78, c: "rgba(41,224,201,0.13)", r: 180 }].forEach(function (o) {
      var g = ctx.createRadialGradient(o.x, o.y, 4, o.x, o.y, o.r);
      g.addColorStop(0, o.c); g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2); ctx.fill();
    });

    // Edge-danger factor for the platform rim glow.
    var dx = ballX - CENTER_X, dy = ballY - CENTER_Y;
    var dist = Math.sqrt(dx * dx + dy * dy);
    var danger = Math.min(1, dist / (platformR - BALL_R));
    var rimColor = danger > 0.75 ? "#ff5d5d" : "#ff5da2";

    // Platform with tilt shading.
    var grad = ctx.createLinearGradient(
      CENTER_X - tiltX * 60, CENTER_Y - tiltY * 60,
      CENTER_X + tiltX * 60, CENTER_Y + tiltY * 60
    );
    grad.addColorStop(0, "#232a48");
    grad.addColorStop(1, "#141830");
    ctx.beginPath();
    ctx.arc(CENTER_X, CENTER_Y, Math.max(0.1, platformR), 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.save();
    ctx.shadowColor = rimColor;
    ctx.shadowBlur = 18 + danger * 16;
    ctx.strokeStyle = rimColor;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();

    // Neon grid rings.
    ctx.strokeStyle = "rgba(124,92,255,0.28)";
    ctx.lineWidth = 1;
    for (var r = platformR / 3; r < platformR; r += platformR / 3) {
      ctx.beginPath();
      ctx.arc(CENTER_X, CENTER_Y, Math.max(0.1, r), 0, Math.PI * 2);
      ctx.stroke();
    }

    // Ball trail.
    trail.forEach(function (tp, i) {
      var a = (i / trail.length) * 0.4;
      ctx.globalAlpha = a;
      ctx.fillStyle = "#29e0c9";
      ctx.beginPath();
      ctx.arc(tp.x, tp.y, Math.max(0.1, BALL_R * (i / trail.length)), 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    // Ball with glow.
    if (!over) {
      ctx.save();
      ctx.shadowColor = "#29e0c9";
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.arc(ballX, ballY, BALL_R, 0, Math.PI * 2);
      var bgrad = ctx.createRadialGradient(ballX - 5, ballY - 5, 2, ballX, ballY, BALL_R);
      bgrad.addColorStop(0, "#ffffff");
      bgrad.addColorStop(1, "#29e0c9");
      ctx.fillStyle = bgrad;
      ctx.fill();
      ctx.restore();
    }

    // Particles.
    particles.forEach(function (p) {
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.1, 4 * p.life), 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  function loop() {
    update();
    updateParticles();
    draw();
    if (!over || particles.length) rafId = requestAnimationFrame(loop);
  }

  document.addEventListener("keydown", function (e) {
    var map = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };
    if (map[e.key]) { e.preventDefault(); keys[map[e.key]] = true; mouseActive = false; }
  });
  document.addEventListener("keyup", function (e) {
    var map = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };
    if (map[e.key]) { e.preventDefault(); keys[map[e.key]] = false; }
  });

  canvas.addEventListener("mousemove", function (e) {
    mouseActive = true;
    var rect = canvas.getBoundingClientRect();
    var x = (e.clientX - rect.left) * (W / rect.width);
    var y = (e.clientY - rect.top) * (H / rect.height);
    tiltX = Math.max(-TILT_MAX, Math.min(TILT_MAX, (x - CENTER_X) / platformR));
    tiltY = Math.max(-TILT_MAX, Math.min(TILT_MAX, (y - CENTER_Y) / platformR));
  });
  canvas.addEventListener("mouseleave", function () { mouseActive = false; });

  touchControls.addEventListener("touchstart", function (e) {
    var btn = e.target.closest("[data-dir]");
    if (!btn) return;
    e.preventDefault();
    mouseActive = false;
    keys[btn.getAttribute("data-dir")] = true;
  });
  touchControls.addEventListener("touchend", function (e) {
    var btn = e.target.closest("[data-dir]");
    if (!btn) return;
    keys[btn.getAttribute("data-dir")] = false;
  });
  touchControls.addEventListener("mousedown", function (e) {
    var btn = e.target.closest("[data-dir]");
    if (!btn) return;
    mouseActive = false;
    keys[btn.getAttribute("data-dir")] = true;
  });
  touchControls.addEventListener("mouseup", function (e) {
    var btn = e.target.closest("[data-dir]");
    if (!btn) return;
    keys[btn.getAttribute("data-dir")] = false;
  });
  touchControls.addEventListener("mouseleave", function () {
    keys.up = keys.down = keys.left = keys.right = false;
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
