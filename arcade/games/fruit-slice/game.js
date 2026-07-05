(function () {
  var GAME_ID = "fruit-slice";
  var canvas = document.getElementById("board");
  var ctx = canvas.getContext("2d");
  var scoreEl = document.getElementById("score");
  var bestEl = document.getElementById("best");
  var livesEl = document.getElementById("lives");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");
  var diffEl = document.getElementById("difficulty");

  var W = canvas.width, H = canvas.height;
  var FRUITS = ["🍉", "🍎", "🍊", "🍋", "🍓", "🍇", "🥝", "🍑"];
  var FRUIT_GLOW = { "🍉": "#ff5da2", "🍎": "#ff5d5d", "🍊": "#ffb84d", "🍋": "#ffe066", "🍓": "#ff5da2", "🍇": "#7c5cff", "🥝": "#3ddc84", "🍑": "#ff9dc7" };
  var START_LIVES = 3;

  // Easy = slow lobs, few bombs; hard = fast lobs, many bombs.
  var DIFFICULTIES = {
    easy:   { bombChance: 0.10, launchBase: 8.5,  gravity: 0.20, spawnBase: 1650, spawnFloor: 700, doubleChance: 0.20 },
    medium: { bombChance: 0.16, launchBase: 9.5,  gravity: 0.22, spawnBase: 1400, spawnFloor: 500, doubleChance: 0.30 },
    hard:   { bombChance: 0.25, launchBase: 10.5, gravity: 0.26, spawnBase: 1050, spawnFloor: 380, doubleChance: 0.45 }
  };
  var cfg = DIFFICULTIES.medium;

  var objects, particles, score, lives, over, startTime, spawnTimer, rafId;
  var trail = [];
  var dragging = false;
  var lastPt = null;

  function refreshHud() {
    scoreEl.textContent = score;
    bestEl.textContent = window.ArcadeCommon.getBest(GAME_ID) || 0;
    livesEl.textContent = lives;
  }

  function elapsedSec() { return (Date.now() - startTime) / 1000; }

  function spawnObject() {
    var isBomb = Math.random() < cfg.bombChance;
    var x = window.ArcadeCommon.randInt(60, W - 60);
    var vx = (Math.random() - 0.5) * 3;
    var launchStrength = cfg.launchBase + Math.random() * 2 + Math.min(3, elapsedSec() / 20);
    var emoji = isBomb ? "💣" : window.ArcadeCommon.pick(FRUITS);
    objects.push({
      x: x,
      y: H + 20,
      vx: vx,
      vy: -launchStrength,
      r: 30,
      emoji: emoji,
      glow: isBomb ? "#ff5d5d" : (FRUIT_GLOW[emoji] || "#3ddc84"),
      isBomb: isBomb,
      sliced: false,
      sliceT: 0,
      rot: 0,
      rotSpeed: (Math.random() - 0.5) * 0.1
    });
  }

  function scheduleSpawns() {
    function tick() {
      if (over) return;
      var count = Math.random() < cfg.doubleChance ? 2 : 1;
      for (var i = 0; i < count; i++) spawnObject();
      var delay = Math.max(cfg.spawnFloor, cfg.spawnBase - elapsedSec() * 20);
      spawnTimer = setTimeout(tick, delay + Math.random() * 400);
    }
    tick();
  }

  function spawnJuice(cx, cy, color) {
    for (var i = 0; i < 12; i++) {
      var ang = Math.random() * Math.PI * 2;
      var spd = 1.5 + Math.random() * 4;
      particles.push({ x: cx, y: cy, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, life: 1, color: color });
    }
  }

  function newGame() {
    objects = [];
    particles = [];
    score = 0;
    lives = START_LIVES;
    over = false;
    startTime = Date.now();
    resultBanner.innerHTML = "";
    trail = [];
    refreshHud();
    cancelAnimationFrame(rafId);
    clearTimeout(spawnTimer);
    scheduleSpawns();
    loop();
  }

  function endGame() {
    over = true;
    clearTimeout(spawnTimer);
    var isBest = window.ArcadeCommon.setBest(GAME_ID, score);
    refreshHud();
    resultBanner.innerHTML = '<span class="overlay-lose">' + window.ArcadeI18n.t("common.gameOver") +
      " — Score: " + score + (isBest ? " — New Best!" : "") + "</span>";
  }

  function update() {
    if (over) return;
    for (var i = objects.length - 1; i >= 0; i--) {
      var o = objects[i];
      if (o.sliced) {
        o.sliceT += 0.06;
        o.y += o.vy;
        o.vy += cfg.gravity;
        if (o.sliceT >= 1) objects.splice(i, 1);
        continue;
      }
      o.vy += cfg.gravity;
      o.x += o.vx;
      o.y += o.vy;
      o.rot += o.rotSpeed;
      if (o.y - o.r > H + 40) {
        objects.splice(i, 1);
      }
    }
    for (var j = particles.length - 1; j >= 0; j--) {
      var p = particles[j];
      p.x += p.vx; p.y += p.vy; p.vy += 0.15; p.life -= 0.04;
      if (p.life <= 0) particles.splice(j, 1);
    }
    if (trail.length) {
      var now = Date.now();
      trail = trail.filter(function (pt) { return now - pt.t < 160; });
    }
  }

  function drawBackground() {
    ctx.fillStyle = "#0e1224";
    ctx.fillRect(0, 0, W, H);
    [{ x: W * 0.25, y: H * 0.3, c: "rgba(124,92,255,0.16)", r: 180 },
     { x: W * 0.8, y: H * 0.75, c: "rgba(41,224,201,0.13)", r: 200 }].forEach(function (o) {
      var g = ctx.createRadialGradient(o.x, o.y, 4, o.x, o.y, o.r);
      g.addColorStop(0, o.c); g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2); ctx.fill();
    });
  }

  function draw() {
    drawBackground();

    // Glowing slice trail with tapering width.
    if (trail.length > 1) {
      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.shadowColor = "#29e0c9";
      ctx.shadowBlur = 16;
      for (var t = 1; t < trail.length; t++) {
        var frac = t / trail.length;
        ctx.strokeStyle = t % 2 === 0 ? "rgba(41,224,201,0.85)" : "rgba(124,92,255,0.85)";
        ctx.lineWidth = 1 + frac * 7;
        ctx.beginPath();
        ctx.moveTo(trail[t - 1].x, trail[t - 1].y);
        ctx.lineTo(trail[t].x, trail[t].y);
        ctx.stroke();
      }
      ctx.restore();
    }

    objects.forEach(function (o) {
      ctx.save();
      ctx.translate(o.x, o.y);
      ctx.rotate(o.rot);
      ctx.shadowColor = o.glow;
      ctx.shadowBlur = 18;
      ctx.font = (o.r * 1.4) + "px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      if (o.sliced) {
        ctx.globalAlpha = 1 - o.sliceT;
        ctx.save();
        ctx.translate(-6 - o.sliceT * 14, o.sliceT * 10);
        ctx.fillText(o.emoji, 0, 0);
        ctx.restore();
        ctx.save();
        ctx.translate(6 + o.sliceT * 14, o.sliceT * 10);
        ctx.fillText(o.emoji, 0, 0);
        ctx.restore();
      } else {
        ctx.fillText(o.emoji, 0, 0);
      }
      ctx.restore();
    });

    // Juice particles.
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
    draw();
    if (!over) rafId = requestAnimationFrame(loop);
  }

  function distToSeg(px, py, ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay;
    var len2 = dx * dx + dy * dy;
    var t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    var cx = ax + t * dx, cy = ay + t * dy;
    var ddx = px - cx, ddy = py - cy;
    return Math.sqrt(ddx * ddx + ddy * ddy);
  }

  function checkSlice(x1, y1, x2, y2) {
    if (over) return;
    for (var i = objects.length - 1; i >= 0; i--) {
      var o = objects[i];
      if (o.sliced) continue;
      var d = distToSeg(o.x, o.y, x1, y1, x2, y2);
      if (d <= o.r) {
        o.sliced = true;
        o.sliceT = 0;
        spawnJuice(o.x, o.y, o.glow);
        if (o.isBomb) {
          lives--;
          window.ArcadeCommon.toast("Boom! -1 life");
          objects.splice(i, 1);
          refreshHud();
          if (lives <= 0) { endGame(); return; }
        } else {
          score += 10;
          refreshHud();
        }
      }
    }
  }

  function getPos(e) {
    var rect = canvas.getBoundingClientRect();
    var cx = (e.touches ? e.touches[0].clientX : e.clientX);
    var cy = (e.touches ? e.touches[0].clientY : e.clientY);
    return {
      x: (cx - rect.left) * (W / rect.width),
      y: (cy - rect.top) * (H / rect.height)
    };
  }

  function pointerDown(e) {
    if (over) return;
    e.preventDefault();
    dragging = true;
    var p = getPos(e);
    lastPt = p;
    trail.push({ x: p.x, y: p.y, t: Date.now() });
  }
  function pointerMove(e) {
    if (!dragging || over) return;
    e.preventDefault();
    var p = getPos(e);
    trail.push({ x: p.x, y: p.y, t: Date.now() });
    if (lastPt) checkSlice(lastPt.x, lastPt.y, p.x, p.y);
    lastPt = p;
  }
  function pointerUp() {
    dragging = false;
    lastPt = null;
  }

  canvas.addEventListener("mousedown", pointerDown);
  canvas.addEventListener("mousemove", pointerMove);
  window.addEventListener("mouseup", pointerUp);
  canvas.addEventListener("touchstart", pointerDown, { passive: false });
  canvas.addEventListener("touchmove", pointerMove, { passive: false });
  canvas.addEventListener("touchend", pointerUp);

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
