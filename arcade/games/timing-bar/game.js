(function () {
  var GAME_ID = "timing-bar";
  var canvas = document.getElementById("board");
  var ctx = canvas.getContext("2d");
  var scoreEl = document.getElementById("score");
  var bestEl = document.getElementById("best");
  var roundEl = document.getElementById("round");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");
  var stopBtn = document.getElementById("stop");
  var diffEl = document.getElementById("difficulty");

  var W = canvas.width, H = canvas.height;
  var TOTAL_ROUNDS = 5;
  var BAR_MARGIN = 30;
  var BAR_Y = H / 2;
  var BAR_W = W - BAR_MARGIN * 2;

  // Easy = slow marker, wide zone; hard = fast marker, narrow zone.
  var DIFFICULTIES = {
    easy:   { speed: 3.0, ramp: 0.4, zoneMin: 55, zoneMax: 82 },
    medium: { speed: 4.2, ramp: 0.6, zoneMin: 30, zoneMax: 55 },
    hard:   { speed: 6.2, ramp: 0.9, zoneMin: 16, zoneMax: 30 }
  };
  var cfg = DIFFICULTIES.medium;

  var markerX, dir, speed, zone, round, score, roundOver, over, waitingNext, particles, flash, rafId;

  function refreshHud() {
    scoreEl.textContent = score;
    bestEl.textContent = window.ArcadeCommon.getBest(GAME_ID) || 0;
    roundEl.textContent = Math.min(round, TOTAL_ROUNDS);
  }

  function newZone() {
    var zoneW = window.ArcadeCommon.randInt(cfg.zoneMin, cfg.zoneMax);
    var zoneX = window.ArcadeCommon.randInt(0, BAR_W - zoneW);
    return { x: zoneX, w: zoneW };
  }

  function newRound() {
    zone = newZone();
    markerX = 0;
    dir = 1;
    speed = cfg.speed + (round - 1) * cfg.ramp;
    roundOver = false;
    waitingNext = false;
  }

  function newGame() {
    round = 1;
    score = 0;
    over = false;
    particles = [];
    flash = 0;
    resultBanner.innerHTML = "";
    newRound();
    refreshHud();
    cancelAnimationFrame(rafId);
    loop();
  }

  function centerOf(z) { return z.x + z.w / 2; }

  function spawnParticles(cx, cy, color) {
    for (var i = 0; i < 18; i++) {
      var ang = Math.random() * Math.PI * 2;
      var spd = 1.5 + Math.random() * 4;
      particles.push({ x: cx, y: cy, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, life: 1, color: color });
    }
  }

  function doStop() {
    if (over || roundOver || waitingNext) return;
    roundOver = true;
    var markerCenter = markerX;
    var zoneCenter = centerOf(zone);
    var dist = Math.abs(markerCenter - zoneCenter);
    var accuracy = Math.max(0, 1 - dist / (zone.w * 1.5 + 40));
    var pts = Math.round(accuracy * 100);
    score += pts;
    refreshHud();
    var perfect = pts >= 90;
    if (perfect) flash = 1;
    spawnParticles(BAR_MARGIN + markerX, BAR_Y, perfect ? "#3ddc84" : "#ff5da2");
    window.ArcadeCommon.toast("+" + pts + (perfect ? " Perfect!" : ""));
    waitingNext = true;
    setTimeout(function () {
      round++;
      if (round > TOTAL_ROUNDS) {
        endGame();
      } else {
        newRound();
        refreshHud();
      }
    }, 700);
  }

  function endGame() {
    over = true;
    var isBest = window.ArcadeCommon.setBest(GAME_ID, score);
    resultBanner.innerHTML = '<span class="overlay-win">' + window.ArcadeI18n.t("common.gameOver") +
      " — Total: " + score + (isBest ? " — New Best!" : "") + "</span>";
  }

  function update() {
    if (over || roundOver) return;
    markerX += dir * speed;
    if (markerX >= BAR_W) { markerX = BAR_W; dir = -1; }
    if (markerX <= 0) { markerX = 0; dir = 1; }
  }

  function draw() {
    ctx.fillStyle = "#0e1224";
    ctx.fillRect(0, 0, W, H);
    // Glow orbs.
    [{ x: W * 0.25, y: H * 0.5, c: "rgba(124,92,255,0.18)", r: 120 },
     { x: W * 0.78, y: H * 0.5, c: "rgba(41,224,201,0.14)", r: 130 }].forEach(function (o) {
      var g = ctx.createRadialGradient(o.x, o.y, 2, o.x, o.y, o.r);
      g.addColorStop(0, o.c); g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2); ctx.fill();
    });

    if (flash > 0) {
      ctx.fillStyle = "rgba(61,220,132," + (flash * 0.15) + ")";
      ctx.fillRect(0, 0, W, H);
      flash = Math.max(0, flash - 0.05);
    }

    // Bar track.
    ctx.fillStyle = "#1a2038";
    ctx.fillRect(BAR_MARGIN, BAR_Y - 14, BAR_W, 28);
    ctx.strokeStyle = "#323a5c";
    ctx.strokeRect(BAR_MARGIN, BAR_Y - 14, BAR_W, 28);

    // Target zone with glow.
    ctx.save();
    ctx.shadowColor = "#3ddc84";
    ctx.shadowBlur = 18;
    var zg = ctx.createLinearGradient(BAR_MARGIN + zone.x, 0, BAR_MARGIN + zone.x + zone.w, 0);
    zg.addColorStop(0, "#2bbf6e"); zg.addColorStop(0.5, "#5dffa0"); zg.addColorStop(1, "#2bbf6e");
    ctx.fillStyle = zg;
    ctx.fillRect(BAR_MARGIN + zone.x, BAR_Y - 14, zone.w, 28);
    ctx.restore();

    // Marker with glow.
    ctx.save();
    ctx.shadowColor = "#ff5da2";
    ctx.shadowBlur = 16;
    ctx.fillStyle = "#ff9dc7";
    ctx.fillRect(BAR_MARGIN + markerX - 3, BAR_Y - 26, 6, 52);
    ctx.restore();

    // Particles.
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
    if (over) { draw(); return; }
    update();
    draw();
    rafId = requestAnimationFrame(loop);
  }

  document.addEventListener("keydown", function (e) {
    if (e.code === "Space") { e.preventDefault(); doStop(); }
  });
  stopBtn.addEventListener("click", doStop);
  canvas.addEventListener("click", doStop);
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
