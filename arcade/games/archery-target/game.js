(function () {
  var GAME_ID = "archery-target";
  var canvas = document.getElementById("board");
  var ctx = canvas.getContext("2d");
  var scoreEl = document.getElementById("score");
  var bestEl = document.getElementById("best");
  var arrowNumEl = document.getElementById("arrow-num");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");
  var diffEl = document.getElementById("difficulty");

  var W = canvas.width, H = canvas.height;
  var CX = W / 2, CY = H / 2;
  var TOTAL_ARROWS = 6;
  var RING_COLORS = ["#ffd24d", "#ffb84d", "#ff5da2", "#ff5d5d", "#7c5cff", "#4d8dff", "#29e0c9", "#3ddc84", "#eef0fb", "#a6acc9"];

  // Easy = little sway, big rings; hard = strong sway, small rings.
  var DIFFICULTIES = {
    easy:   { amp: 7,  ringStep: 20, freqMin: 0.8, freqMax: 1.6 },
    medium: { amp: 16, ringStep: 18, freqMin: 1.2, freqMax: 2.5 },
    hard:   { amp: 28, ringStep: 14, freqMin: 1.6, freqMax: 3.2 }
  };
  var cfg = DIFFICULTIES.medium;

  var RINGS, MAX_R;
  var mouseX = CX, mouseY = CY;
  var wobble = { phaseX: 0, phaseY: 0, freqX: 1, freqY: 1 };
  var arrowsShot, totalScore, shots, particles, over;

  function buildRings() {
    RINGS = [];
    for (var i = 0; i < 10; i++) {
      RINGS.push({ score: 10 - i, r: 16 + cfg.ringStep * i, color: RING_COLORS[i] });
    }
    MAX_R = RINGS[RINGS.length - 1].r;
  }

  function refreshHud() {
    scoreEl.textContent = totalScore;
    bestEl.textContent = window.ArcadeCommon.getBest(GAME_ID) || 0;
    arrowNumEl.textContent = arrowsShot;
  }

  function newRoundWobble() {
    wobble.phaseX = Math.random() * Math.PI * 2;
    wobble.phaseY = Math.random() * Math.PI * 2;
    wobble.freqX = cfg.freqMin + Math.random() * (cfg.freqMax - cfg.freqMin);
    wobble.freqY = cfg.freqMin + Math.random() * (cfg.freqMax - cfg.freqMin);
  }

  function newGame() {
    buildRings();
    arrowsShot = 0;
    totalScore = 0;
    shots = [];
    particles = [];
    over = false;
    resultBanner.innerHTML = "";
    newRoundWobble();
    refreshHud();
  }

  function scoreForDistance(dist) {
    for (var i = 0; i < RINGS.length; i++) {
      if (dist <= RINGS[i].r) return RINGS[i].score;
    }
    return 0;
  }

  function currentOffset(t) {
    return {
      x: Math.sin(t * wobble.freqX + wobble.phaseX) * cfg.amp,
      y: Math.cos(t * wobble.freqY + wobble.phaseY) * cfg.amp
    };
  }

  function spawnParticles(cx, cy, color) {
    for (var i = 0; i < 14; i++) {
      var ang = Math.random() * Math.PI * 2;
      var spd = 1 + Math.random() * 3.5;
      particles.push({ x: cx, y: cy, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, life: 1, color: color });
    }
  }

  function draw() {
    ctx.fillStyle = "#0e1224";
    ctx.fillRect(0, 0, W, H);
    [{ x: W * 0.25, y: H * 0.25, c: "rgba(124,92,255,0.14)", r: 160 },
     { x: W * 0.78, y: H * 0.78, c: "rgba(41,224,201,0.12)", r: 170 }].forEach(function (o) {
      var g = ctx.createRadialGradient(o.x, o.y, 4, o.x, o.y, o.r);
      g.addColorStop(0, o.c); g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2); ctx.fill();
    });

    // Outer glow halo behind the target.
    var halo = ctx.createRadialGradient(CX, CY, MAX_R * 0.6, CX, CY, MAX_R + 26);
    halo.addColorStop(0, "rgba(255,93,162,0.0)");
    halo.addColorStop(0.7, "rgba(255,93,162,0.18)");
    halo.addColorStop(1, "rgba(124,92,255,0)");
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(CX, CY, MAX_R + 26, 0, Math.PI * 2);
    ctx.fill();

    for (var i = RINGS.length - 1; i >= 0; i--) {
      ctx.beginPath();
      ctx.arc(CX, CY, Math.max(0.1, RINGS[i].r), 0, Math.PI * 2);
      ctx.fillStyle = RINGS[i].color;
      ctx.fill();
      ctx.strokeStyle = "rgba(14,18,36,0.6)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Bullseye glow.
    ctx.save();
    ctx.shadowColor = "#ffd24d"; ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.arc(CX, CY, Math.max(0.1, RINGS[0].r * 0.5), 0, Math.PI * 2);
    ctx.fillStyle = "#fff2b8";
    ctx.fill();
    ctx.restore();

    // Shot marks.
    shots.forEach(function (s) {
      ctx.save();
      ctx.shadowColor = "#ffffff"; ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = "#05131c";
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    });

    // Particles.
    particles = particles.filter(function (p) { return p.life > 0; });
    particles.forEach(function (p) {
      p.x += p.vx; p.y += p.vy; p.vx *= 0.95; p.vy *= 0.95; p.life -= 0.035;
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.1, 4 * p.life), 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    if (!over) {
      var t = performance.now() / 1000;
      var off = currentOffset(t);
      var rx = mouseX + off.x, ry = mouseY + off.y;
      var pulse = 0.5 + 0.5 * Math.sin(Date.now() / 160);
      ctx.save();
      ctx.shadowColor = "#29e0c9"; ctx.shadowBlur = 12 + pulse * 6;
      ctx.strokeStyle = "#29e0c9";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(rx - 12, ry);
      ctx.lineTo(rx + 12, ry);
      ctx.moveTo(rx, ry - 12);
      ctx.lineTo(rx, ry + 12);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(rx, ry, 8, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(41,224,201,0.8)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    }
  }

  function loop() {
    draw();
    requestAnimationFrame(loop);
  }

  function toCanvasPos(e) {
    var rect = canvas.getBoundingClientRect();
    return { x: (e.clientX - rect.left) * (W / rect.width), y: (e.clientY - rect.top) * (H / rect.height) };
  }

  canvas.addEventListener("mousemove", function (e) {
    var pos = toCanvasPos(e);
    mouseX = pos.x;
    mouseY = pos.y;
  });

  canvas.addEventListener("click", function () {
    if (over || arrowsShot >= TOTAL_ARROWS) return;
    var t = performance.now() / 1000;
    var off = currentOffset(t);
    var fx = mouseX + off.x, fy = mouseY + off.y;
    var dist = Math.sqrt((fx - CX) * (fx - CX) + (fy - CY) * (fy - CY));
    var pts = scoreForDistance(dist);
    shots.push({ x: fx, y: fy, score: pts });
    arrowsShot++;
    totalScore += pts;
    spawnParticles(fx, fy, pts >= 8 ? "#ffd24d" : (pts > 0 ? "#29e0c9" : "#ff5d5d"));
    window.ArcadeCommon.toast(pts > 0 ? "+" + pts : "Miss!");
    refreshHud();
    newRoundWobble();

    if (arrowsShot >= TOTAL_ARROWS) {
      over = true;
      var improved = window.ArcadeCommon.setBest(GAME_ID, totalScore);
      resultBanner.innerHTML = '<span class="overlay-win">' + window.ArcadeI18n.t("common.gameOver") +
        " — " + window.ArcadeI18n.t("common.score") + ": " + totalScore + "/60" + (improved ? " 🏆" : "") + "</span>";
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

  loop();
})();
