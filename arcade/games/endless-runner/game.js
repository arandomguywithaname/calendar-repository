(function () {
  var GAME_ID = "endless-runner";
  var canvas = document.getElementById("board");
  var ctx = canvas.getContext("2d");
  var scoreEl = document.getElementById("score");
  var bestEl = document.getElementById("best");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");
  var jumpBtn = document.getElementById("jump-btn");
  var diffEl = document.getElementById("difficulty");

  var W = canvas.width, H = canvas.height;
  var GROUND_Y = H - 46;
  var PLAYER_X = 70;
  var PLAYER_W = 34, PLAYER_H = 44;
  var OBST_COLORS = ["#ff5da2", "#7c5cff", "#29e0c9", "#ffd24d"];

  // Difficulty tuning. base/max = run speed range, rampMs = acceleration,
  // spawnBase/spawnMin/spawnRamp = obstacle frequency. Easy also jumps floatier
  // (higher jump, lower gravity) with a bigger collision margin = forgiving.
  var DIFFICULTIES = {
    easy:   { base: 4.0, max: 9,  rampMs: 3600, spawnBase: 1750, spawnMin: 800, spawnRamp: 30, jump: -14.2, gravity: 0.62, margin: 8 },
    medium: { base: 5.0, max: 13, rampMs: 2600, spawnBase: 1400, spawnMin: 550, spawnRamp: 20, jump: -13.5, gravity: 0.70, margin: 5 },
    hard:   { base: 6.4, max: 16, rampMs: 1800, spawnBase: 1050, spawnMin: 420, spawnRamp: 14, jump: -13.5, gravity: 0.80, margin: 3 }
  };
  var cfg = DIFFICULTIES.medium;

  var playerY, vy, onGround, wasOnGround, obstacles, elapsedMs, spawnTimer, distance, over, groundOffset, particles, squash;

  function refreshHud() {
    scoreEl.textContent = Math.floor(distance / 8);
    bestEl.textContent = window.ArcadeCommon.getBest(GAME_ID) || 0;
  }

  function newGame() {
    playerY = GROUND_Y - PLAYER_H;
    vy = 0;
    onGround = true;
    wasOnGround = true;
    obstacles = [];
    particles = [];
    elapsedMs = 0;
    spawnTimer = 0;
    distance = 0;
    groundOffset = 0;
    squash = 0;
    over = false;
    resultBanner.innerHTML = "";
    refreshHud();
  }

  function currentSpeed() { return Math.min(cfg.base + elapsedMs / cfg.rampMs, cfg.max); }
  function currentSpawnInterval() { return Math.max(cfg.spawnBase - elapsedMs / cfg.spawnRamp, cfg.spawnMin); }

  function burst(x, y, color, n, up) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2;
      var s = 1 + Math.random() * 4;
      particles.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - (up || 0), life: 1, color: color });
    }
  }

  function jump() {
    if (over) return;
    if (onGround) {
      vy = cfg.jump;
      onGround = false;
      burst(PLAYER_X, GROUND_Y, "#29e0c9", 6, 1);
    }
  }

  function spawnObstacle() {
    var variants = [
      { w: 22, h: 34 },
      { w: 30, h: 46 },
      { w: 44, h: 28 },
      { w: 20, h: 58 }
    ];
    var v = window.ArcadeCommon.pick(variants);
    obstacles.push({ x: W + v.w, w: v.w, h: v.h, color: window.ArcadeCommon.pick(OBST_COLORS) });
  }

  function update(dt) {
    if (over) return;
    elapsedMs += dt;
    var speed = currentSpeed();
    distance += speed;
    groundOffset = (groundOffset + speed) % 30;
    if (squash > 0) squash -= 0.12;

    vy += cfg.gravity;
    playerY += vy;
    if (playerY >= GROUND_Y - PLAYER_H) {
      playerY = GROUND_Y - PLAYER_H;
      vy = 0;
      onGround = true;
    }
    if (onGround && !wasOnGround) {
      squash = 1;
      burst(PLAYER_X, GROUND_Y, "#7c5cff", 6, 1);
    }
    wasOnGround = onGround;

    spawnTimer += dt;
    if (spawnTimer >= currentSpawnInterval()) {
      spawnTimer = 0;
      spawnObstacle();
    }

    obstacles.forEach(function (o) { o.x -= speed; });
    obstacles = obstacles.filter(function (o) { return o.x + o.w > -10; });

    var m = cfg.margin;
    var pLeft = PLAYER_X - PLAYER_W / 2, pRight = PLAYER_X + PLAYER_W / 2;
    var pTop = playerY, pBottom = playerY + PLAYER_H;
    for (var i = 0; i < obstacles.length; i++) {
      var o = obstacles[i];
      var oLeft = o.x, oRight = o.x + o.w;
      var oTop = GROUND_Y - o.h, oBottom = GROUND_Y;
      if (pLeft < oRight - m && pRight > oLeft + m && pTop < oBottom - 4 && pBottom > oTop + 4) {
        endGame();
        return;
      }
    }
    refreshHud();
  }

  function endGame() {
    over = true;
    burst(PLAYER_X, playerY + PLAYER_H / 2, "#ff5da2", 26, 2);
    var score = Math.floor(distance / 8);
    var improved = window.ArcadeCommon.setBest(GAME_ID, score);
    resultBanner.innerHTML = '<span class="overlay-lose">' + window.ArcadeI18n.t("common.gameOver") +
      " — " + window.ArcadeI18n.t("common.score") + ": " + score + (improved ? " 🏆" : "") + "</span>";
    refreshHud();
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
    // Night gradient sky.
    var grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "#1c2138");
    grad.addColorStop(1, "#0d1020");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    var t = Date.now() / 1000;
    // Parallax glow moons.
    drawOrb(W - 90 + Math.sin(t * 0.2) * 8, 70, 90, "rgba(124,92,255,0.18)");
    drawOrb(120, 60, 70, "rgba(41,224,201,0.12)");

    // Parallax scrolling neon skyline.
    var skyScroll = (distance * 0.3) % 80;
    ctx.fillStyle = "rgba(124,92,255,0.14)";
    for (var b = -1; b < W / 40 + 1; b++) {
      var bx = b * 80 - skyScroll;
      var bh = 26 + ((b * 37) % 5) * 9;
      ctx.fillRect(bx, GROUND_Y - bh, 34, bh);
      ctx.fillRect(bx + 44, GROUND_Y - bh * 0.6, 22, bh * 0.6);
    }

    // Ground with a glowing neon edge.
    ctx.fillStyle = "#191d30";
    ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
    ctx.strokeStyle = "#29e0c9";
    ctx.shadowColor = "#29e0c9";
    ctx.shadowBlur = 12;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, GROUND_Y);
    ctx.lineTo(W, GROUND_Y);
    ctx.stroke();
    ctx.shadowBlur = 0;
    // Dashed lane marks.
    ctx.strokeStyle = "rgba(238,240,251,0.3)";
    ctx.setLineDash([16, 14]);
    ctx.beginPath();
    ctx.moveTo(-30 + groundOffset, GROUND_Y + 14);
    ctx.lineTo(W, GROUND_Y + 14);
    ctx.stroke();
    ctx.setLineDash([]);

    // Obstacles: rounded neon blocks with glow.
    obstacles.forEach(function (o) {
      var oy = GROUND_Y - o.h;
      var og = ctx.createLinearGradient(o.x, oy, o.x, GROUND_Y);
      og.addColorStop(0, "#ffffff");
      og.addColorStop(0.3, o.color);
      og.addColorStop(1, shade(o.color));
      ctx.shadowColor = o.color;
      ctx.shadowBlur = 14;
      ctx.fillStyle = og;
      roundRect(o.x, oy, o.w, o.h, 5);
      ctx.fill();
      ctx.shadowBlur = 0;
    });

    // Player with squash-on-land and a warm glow.
    var sx = 1 + squash * 0.2, sy = 1 - squash * 0.2;
    ctx.save();
    ctx.translate(PLAYER_X, playerY + PLAYER_H / 2);
    ctx.scale(sx, sy);
    ctx.shadowColor = "#ffd23f";
    ctx.shadowBlur = 16;
    ctx.font = PLAYER_H + "px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("🏃", 0, 3);
    ctx.restore();
    ctx.shadowBlur = 0;
    ctx.textBaseline = "alphabetic";

    // Particles.
    particles = particles.filter(function (p) { return p.life > 0; });
    particles.forEach(function (p) {
      p.x += p.vx; p.y += p.vy; p.vy += 0.1; p.life -= 0.03;
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.1, 3 * p.life), 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  function shade(hex) {
    var n = parseInt(hex.slice(1), 16);
    var r = Math.round(((n >> 16) & 255) * 0.5);
    var g = Math.round(((n >> 8) & 255) * 0.5);
    var b = Math.round((n & 255) * 0.5);
    return "rgb(" + r + "," + g + "," + b + ")";
  }

  function drawOrb(cx, cy, radius, color) {
    var grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    grad.addColorStop(0, color);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  var lastTime = null;
  function loop(ts) {
    if (lastTime === null) lastTime = ts;
    var dt = Math.min(ts - lastTime, 40);
    lastTime = ts;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  document.addEventListener("keydown", function (e) {
    if (e.key === " " || e.key === "ArrowUp" || e.key === "Spacebar") {
      e.preventDefault();
      jump();
    }
  });
  canvas.addEventListener("mousedown", jump);
  canvas.addEventListener("touchstart", function (e) { e.preventDefault(); jump(); }, { passive: false });
  jumpBtn.addEventListener("click", jump);

  restartBtn.addEventListener("click", newGame);

  // Difficulty selector - changing it restarts with the new tuning.
  window.ArcadeCommon.mountDifficulty(diffEl, GAME_ID, {
    defaultKey: "medium",
    onChange: function (level) {
      cfg = DIFFICULTIES[level] || DIFFICULTIES.medium;
      newGame();
    }
  });
  requestAnimationFrame(loop);
})();
