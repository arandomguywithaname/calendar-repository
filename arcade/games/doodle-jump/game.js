(function () {
  var GAME_ID = "doodle-jump";
  var canvas = document.getElementById("board");
  var ctx = canvas.getContext("2d");
  var scoreEl = document.getElementById("score");
  var bestEl = document.getElementById("best");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");
  var diffEl = document.getElementById("difficulty");

  var W = canvas.width, H = canvas.height;
  var PLAYER_W = 32, PLAYER_H = 32;
  var PLAT_H = 12;

  // Difficulty tuning. platW = platform width, gapMin/gapMax = vertical spacing
  // between platforms, gravity/jump tune the bounce feel. Hard scrolls faster
  // with sparse, narrow platforms; easy is gentle with wide, frequent ones.
  var DIFFICULTIES = {
    easy:   { platW: 82, gapMin: 44, gapMax: 66, gravity: 0.26, jump: -10.2 },
    medium: { platW: 60, gapMin: 55, gapMax: 90, gravity: 0.32, jump: -10.5 },
    hard:   { platW: 46, gapMin: 66, gapMax: 100, gravity: 0.40, jump: -11.6 }
  };
  var cfg = DIFFICULTIES.medium;

  var player, platforms, score, over, height, loopId, particles, squash;
  var moveDir = 0;
  var PLAT_HUES = ["#3ddc84", "#29e0c9", "#7c5cff", "#ff5da2"];

  function refreshHud() {
    scoreEl.textContent = score;
    bestEl.textContent = window.ArcadeCommon.getBest(GAME_ID) || 0;
  }

  function makePlatform(y) {
    return {
      x: window.ArcadeCommon.randInt(0, W - cfg.platW),
      y: y,
      w: cfg.platW,
      color: window.ArcadeCommon.pick(PLAT_HUES)
    };
  }

  function buildPlatforms() {
    platforms = [];
    var y = H - 20;
    // Starting platform centered under the player.
    platforms.push({ x: W / 2 - cfg.platW / 2, y: y, w: cfg.platW, color: "#3ddc84" });
    y -= 70;
    while (y > -H) {
      platforms.push(makePlatform(y));
      y -= window.ArcadeCommon.randInt(cfg.gapMin, cfg.gapMax);
    }
  }

  function newGame() {
    player = { x: W / 2 - PLAYER_W / 2, y: H - 60, vy: cfg.jump, vx: 0 };
    score = 0;
    height = 0;
    over = false;
    particles = [];
    squash = 0;
    resultBanner.innerHTML = "";
    buildPlatforms();
    refreshHud();
    cancelAnimationFrame(loopId);
    loop();
  }

  function maybeExtendPlatforms() {
    var topY = platforms.reduce(function (min, p) { return Math.min(min, p.y); }, 0);
    while (topY > -H) {
      topY -= window.ArcadeCommon.randInt(cfg.gapMin, cfg.gapMax);
      platforms.push(makePlatform(topY));
    }
  }

  function spawnBurst(cx, cy, color) {
    for (var i = 0; i < 10; i++) {
      var ang = Math.PI + Math.random() * Math.PI; // spray downward-ish
      var spd = 1 + Math.random() * 3;
      particles.push({
        x: cx, y: cy,
        vx: Math.cos(ang) * spd, vy: Math.abs(Math.sin(ang)) * spd * 0.6 + 0.5,
        life: 1, color: color
      });
    }
  }

  function update() {
    if (over) return;

    var targetVx = moveDir * 4.5;
    player.vx += (targetVx - player.vx) * 0.25;
    player.x += player.vx;

    // Wrap around screen edges.
    if (player.x + PLAYER_W < 0) player.x = W;
    if (player.x > W) player.x = -PLAYER_W;

    player.vy += cfg.gravity;
    player.y += player.vy;
    if (squash > 0) squash -= 0.12;

    // Platform collision (only when falling).
    if (player.vy > 0) {
      for (var i = 0; i < platforms.length; i++) {
        var p = platforms[i];
        if (player.x + PLAYER_W * 0.7 > p.x && player.x + PLAYER_W * 0.3 < p.x + p.w &&
            player.y + PLAYER_H > p.y && player.y + PLAYER_H < p.y + PLAT_H + player.vy) {
          player.vy = cfg.jump;
          squash = 1;
          spawnBurst(player.x + PLAYER_W / 2, p.y, p.color);
          break;
        }
      }
    }

    // Camera scroll: keep the player in the upper part of the screen.
    var threshold = H * 0.4;
    if (player.y < threshold) {
      var dy = threshold - player.y;
      player.y = threshold;
      platforms.forEach(function (p) { p.y += dy; });
      particles.forEach(function (pt) { pt.y += dy; });
      height += dy;
      score = Math.floor(height / 10);
      refreshHud();
      platforms = platforms.filter(function (p) { return p.y < H + 30; });
      maybeExtendPlatforms();
    }

    if (player.y > H) {
      endGame();
    }
  }

  function endGame() {
    over = true;
    var isBest = window.ArcadeCommon.setBest(GAME_ID, score);
    var msg = window.ArcadeI18n.t("common.gameOver") + " — " + window.ArcadeI18n.t("common.score") + ": " + score;
    if (isBest && score > 0) msg += " 🏆";
    resultBanner.innerHTML = '<span class="overlay-lose">' + msg + "</span>";
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
    // Deep gradient sky with drifting glow orbs.
    var bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#161a30");
    bg.addColorStop(1, "#0c0f1e");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    var t = Date.now() / 1000;
    drawGlowOrb(W * 0.25 + Math.sin(t * 0.5) * 20, H * 0.3, 120, "rgba(124,92,255,0.18)");
    drawGlowOrb(W * 0.78 + Math.cos(t * 0.4) * 20, H * 0.7, 140, "rgba(41,224,201,0.14)");

    // Platforms: rounded neon bars with a glowing top edge.
    platforms.forEach(function (p) {
      var grad = ctx.createLinearGradient(p.x, p.y, p.x, p.y + PLAT_H);
      grad.addColorStop(0, "#ffffff");
      grad.addColorStop(0.35, p.color);
      grad.addColorStop(1, shade(p.color));
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 14;
      ctx.fillStyle = grad;
      roundRect(p.x, p.y, p.w, PLAT_H, 6);
      ctx.fill();
      ctx.shadowBlur = 0;
    });

    // Particle burst from bounces.
    particles = particles.filter(function (pt) { return pt.life > 0; });
    particles.forEach(function (pt) {
      pt.x += pt.vx; pt.y += pt.vy; pt.vy += 0.12; pt.life -= 0.035;
      ctx.globalAlpha = Math.max(0, pt.life);
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, Math.max(0.1, 3 * pt.life), 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    // Player with a squash-on-bounce wobble and a warm glow.
    var sx = 1 + squash * 0.25;
    var sy = 1 - squash * 0.25;
    ctx.save();
    ctx.translate(player.x + PLAYER_W / 2, player.y + PLAYER_H / 2);
    ctx.scale(sx, sy);
    ctx.shadowColor = "#ffd23f";
    ctx.shadowBlur = 18;
    ctx.font = PLAYER_H + "px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("🦘", 0, 2);
    ctx.restore();
    ctx.shadowBlur = 0;
    ctx.textBaseline = "alphabetic";
  }

  function shade(hex) {
    // Darken a #rrggbb color by ~45% for the gradient base.
    var n = parseInt(hex.slice(1), 16);
    var r = Math.round(((n >> 16) & 255) * 0.55);
    var g = Math.round(((n >> 8) & 255) * 0.55);
    var b = Math.round((n & 255) * 0.55);
    return "rgb(" + r + "," + g + "," + b + ")";
  }

  function drawGlowOrb(cx, cy, radius, color) {
    var grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    grad.addColorStop(0, color);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  function loop() {
    update();
    draw();
    if (!over) loopId = requestAnimationFrame(loop);
  }

  function setDir(d) { moveDir = d; }

  document.addEventListener("keydown", function (e) {
    if (e.key === "ArrowLeft") { e.preventDefault(); moveDir = -1; }
    if (e.key === "ArrowRight") { e.preventDefault(); moveDir = 1; }
  });
  document.addEventListener("keyup", function (e) {
    if (e.key === "ArrowLeft" && moveDir === -1) moveDir = 0;
    if (e.key === "ArrowRight" && moveDir === 1) moveDir = 0;
  });

  canvas.addEventListener("mousemove", function (e) {
    var rect = canvas.getBoundingClientRect();
    var x = (e.clientX - rect.left) * (W / rect.width);
    moveDir = x < player.x + PLAYER_W / 2 ? -1 : 1;
  });

  canvas.addEventListener("touchmove", function (e) {
    e.preventDefault();
    var rect = canvas.getBoundingClientRect();
    var x = (e.touches[0].clientX - rect.left) * (W / rect.width);
    moveDir = x < player.x + PLAYER_W / 2 ? -1 : 1;
  }, { passive: false });

  var touchCtrl = document.getElementById("touch-controls");
  touchCtrl.addEventListener("touchstart", function (e) {
    var btn = e.target.closest("[data-dir]");
    if (btn) setDir(btn.getAttribute("data-dir") === "left" ? -1 : 1);
  });
  touchCtrl.addEventListener("touchend", function () { setDir(0); });
  touchCtrl.addEventListener("mousedown", function (e) {
    var btn = e.target.closest("[data-dir]");
    if (btn) setDir(btn.getAttribute("data-dir") === "left" ? -1 : 1);
  });
  touchCtrl.addEventListener("mouseup", function () { setDir(0); });
  touchCtrl.addEventListener("mouseleave", function () { setDir(0); });

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
