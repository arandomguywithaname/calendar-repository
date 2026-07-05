(function () {
  var GAME_ID = "platform-jump";
  var canvas = document.getElementById("board");
  var ctx = canvas.getContext("2d");
  var timeEl = document.getElementById("time");
  var bestEl = document.getElementById("best");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");
  var diffEl = document.getElementById("difficulty");

  var W = canvas.width, H = canvas.height;
  var PLAYER_W = 26, PLAYER_H = 32;
  var groundY = H - 40;

  // Difficulty tuning. Each level defines its own physics (gravity/jump/speed),
  // platform layout (wider = easier, narrower = harder), and flag position
  // (closer goal = easier). "float" solids are floating platforms (cyan glow).
  var DIFFICULTIES = {
    easy: {
      gravity: 0.5, jump: -11.8, moveSpeed: 3.9,
      solids: [
        { x: 0, y: groundY, w: 250, h: 40, ground: true },
        { x: 300, y: groundY, w: 300, h: 40, ground: true },
        { x: 235, y: groundY - 78, w: 120, h: 16 },
        { x: 400, y: groundY - 130, w: 130, h: 16 }
      ],
      flag: { x: 470, y: groundY - 40, w: 20, h: 40 },
      start: { x: 30, y: groundY - PLAYER_H }
    },
    medium: {
      gravity: 0.6, jump: -12.5, moveSpeed: 3.6,
      solids: [
        { x: 0, y: groundY, w: 200, h: 40, ground: true },
        { x: 340, y: groundY, w: 260, h: 40, ground: true },
        { x: 220, y: groundY - 80, w: 90, h: 16 },
        { x: 420, y: groundY - 140, w: 100, h: 16 }
      ],
      flag: { x: 550, y: groundY - 40, w: 20, h: 40 },
      start: { x: 30, y: groundY - PLAYER_H }
    },
    hard: {
      gravity: 0.72, jump: -13.2, moveSpeed: 3.9,
      solids: [
        { x: 0, y: groundY, w: 150, h: 40, ground: true },
        { x: 430, y: groundY, w: 170, h: 40, ground: true },
        { x: 180, y: groundY - 70, w: 56, h: 14 },
        { x: 280, y: groundY - 120, w: 52, h: 14 },
        { x: 372, y: groundY - 72, w: 52, h: 14 },
        { x: 480, y: groundY - 150, w: 58, h: 14 }
      ],
      flag: { x: 560, y: groundY - 40, w: 20, h: 40 },
      start: { x: 24, y: groundY - PLAYER_H }
    }
  };
  var cfg = DIFFICULTIES.medium;

  var player, seconds, over, won, loopId, timerId, particles, wasOnGround;
  var moveDir = 0;

  function refreshHud() {
    timeEl.textContent = seconds;
    var best = window.ArcadeCommon.getBest(GAME_ID);
    bestEl.textContent = best === null ? "-" : best;
  }

  function resetPlayer() {
    player = { x: cfg.start.x, y: cfg.start.y, vx: 0, vy: 0, onGround: false, face: 1 };
    wasOnGround = true;
  }

  function newGame() {
    resetPlayer();
    seconds = 0;
    over = false;
    won = false;
    particles = [];
    resultBanner.innerHTML = "";
    refreshHud();
    clearInterval(timerId);
    timerId = setInterval(function () {
      if (over) return;
      seconds++;
      refreshHud();
    }, 1000);
    cancelAnimationFrame(loopId);
    loop();
  }

  function burst(x, y, color, n, spread) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2;
      var s = 1 + Math.random() * (spread || 3);
      particles.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1, life: 1, color: color });
    }
  }

  function update() {
    if (over) return;

    player.vx = moveDir * cfg.moveSpeed;
    if (moveDir !== 0) player.face = moveDir;
    player.x += player.vx;
    player.x = Math.max(0, Math.min(W - PLAYER_W, player.x));

    player.vy += cfg.gravity;
    player.y += player.vy;
    player.onGround = false;

    cfg.solids.forEach(function (s) {
      if (player.x + PLAYER_W > s.x && player.x < s.x + s.w) {
        if (player.vy >= 0 && player.y + PLAYER_H - player.vy <= s.y + 1 && player.y + PLAYER_H >= s.y) {
          player.y = s.y - PLAYER_H;
          player.vy = 0;
          player.onGround = true;
        }
      }
    });

    // Landing dust.
    if (player.onGround && !wasOnGround) {
      burst(player.x + PLAYER_W / 2, player.y + PLAYER_H, "#7c5cff", 6, 2);
    }
    wasOnGround = player.onGround;

    // Fell into the pit / off screen.
    if (player.y > H) {
      window.ArcadeCommon.toast("Fell! Restarting...");
      resetPlayer();
    }

    // Reached the flag.
    if (player.x + PLAYER_W > cfg.flag.x && player.x < cfg.flag.x + cfg.flag.w &&
        player.y + PLAYER_H > cfg.flag.y && player.y < cfg.flag.y + cfg.flag.h) {
      winGame();
    }
  }

  function winGame() {
    over = true;
    won = true;
    clearInterval(timerId);
    burst(cfg.flag.x + cfg.flag.w / 2, cfg.flag.y + 6, "#3ddc84", 28, 4);
    var improved = window.ArcadeCommon.setBestLowerIsBetter(GAME_ID, seconds);
    resultBanner.innerHTML = '<span class="overlay-win">' + window.ArcadeI18n.t("common.youWin") + " — " + seconds + "s" + (improved ? " 🏆" : "") + "</span>";
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
    // Layered gradient sky with parallax glow orbs.
    var bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#1a1f3a");
    bg.addColorStop(1, "#0b0e1e");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    var t = Date.now() / 1000;
    drawOrb(120 + Math.sin(t * 0.4) * 30, 90, 130, "rgba(124,92,255,0.16)");
    drawOrb(460 + Math.cos(t * 0.3) * 30, 120, 150, "rgba(41,224,201,0.12)");

    // Pit danger glow at the bottom.
    var pit = ctx.createLinearGradient(0, groundY, 0, H);
    pit.addColorStop(0, "rgba(255,93,93,0)");
    pit.addColorStop(1, "rgba(255,93,93,0.18)");
    ctx.fillStyle = pit;
    ctx.fillRect(0, groundY, W, H - groundY);

    // Platforms: rounded neon bars with glow.
    cfg.solids.forEach(function (s) {
      var col = s.ground ? "#7c5cff" : "#29e0c9";
      var grad = ctx.createLinearGradient(s.x, s.y, s.x, s.y + s.h);
      grad.addColorStop(0, "#ffffff");
      grad.addColorStop(0.3, col);
      grad.addColorStop(1, s.ground ? "#3a2f7a" : "#136b60");
      ctx.shadowColor = col;
      ctx.shadowBlur = 14;
      ctx.fillStyle = grad;
      roundRect(s.x, s.y, s.w, s.h, s.ground ? 6 : 5);
      ctx.fill();
      ctx.shadowBlur = 0;
    });

    // Flag with glow.
    ctx.font = "34px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.shadowColor = "#3ddc84";
    ctx.shadowBlur = 16;
    ctx.fillText("🚩", cfg.flag.x + cfg.flag.w / 2, cfg.flag.y + cfg.flag.h);
    ctx.shadowBlur = 0;

    // Player with a warm glow, flipped to face travel direction.
    ctx.save();
    ctx.translate(player.x + PLAYER_W / 2, player.y + PLAYER_H / 2);
    ctx.scale(player.face, 1);
    ctx.shadowColor = "#ffd23f";
    ctx.shadowBlur = 16;
    ctx.font = PLAYER_H + "px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("🏃", 0, 2);
    ctx.restore();
    ctx.shadowBlur = 0;
    ctx.textBaseline = "alphabetic";

    // Particles.
    particles = particles.filter(function (p) { return p.life > 0; });
    particles.forEach(function (p) {
      p.x += p.vx; p.y += p.vy; p.vy += 0.12; p.life -= 0.03;
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.1, 3 * p.life), 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
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

  function loop() {
    update();
    draw();
    if (!over) loopId = requestAnimationFrame(loop);
  }

  function jump() {
    if (over) return;
    if (player.onGround) {
      player.vy = cfg.jump;
      burst(player.x + PLAYER_W / 2, player.y + PLAYER_H, "#29e0c9", 6, 2);
    }
  }

  document.addEventListener("keydown", function (e) {
    if (e.key === "ArrowLeft") { e.preventDefault(); moveDir = -1; }
    if (e.key === "ArrowRight") { e.preventDefault(); moveDir = 1; }
    if (e.key === " " || e.key === "ArrowUp") { e.preventDefault(); jump(); }
  });
  document.addEventListener("keyup", function (e) {
    if (e.key === "ArrowLeft" && moveDir === -1) moveDir = 0;
    if (e.key === "ArrowRight" && moveDir === 1) moveDir = 0;
  });

  var touchCtrl = document.getElementById("touch-controls");
  touchCtrl.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-dir]");
    if (!btn) return;
    if (btn.getAttribute("data-dir") === "jump") jump();
  });
  touchCtrl.addEventListener("touchstart", function (e) {
    var btn = e.target.closest("[data-dir]");
    if (!btn) return;
    var d = btn.getAttribute("data-dir");
    if (d === "left") moveDir = -1;
    else if (d === "right") moveDir = 1;
    else if (d === "jump") jump();
  });
  touchCtrl.addEventListener("touchend", function () { moveDir = 0; });
  touchCtrl.addEventListener("mousedown", function (e) {
    var btn = e.target.closest("[data-dir]");
    if (!btn) return;
    var d = btn.getAttribute("data-dir");
    if (d === "left") moveDir = -1;
    else if (d === "right") moveDir = 1;
  });
  touchCtrl.addEventListener("mouseup", function () { moveDir = 0; });
  touchCtrl.addEventListener("mouseleave", function () { moveDir = 0; });

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
