(function () {
  var GAME_ID = "basketball-shootout";
  var canvas = document.getElementById("board");
  var ctx = canvas.getContext("2d");
  var scoreEl = document.getElementById("score");
  var bestEl = document.getElementById("best");
  var shotNumEl = document.getElementById("shot-num");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");
  var diffEl = document.getElementById("difficulty");

  var W = canvas.width, H = canvas.height;
  var BALL_R = 16;
  var GRAVITY = 0.42;
  var MAX_DRAG = 130;
  var POWER_SCALE = 0.17;
  var TOTAL_SHOTS = 10;

  var HOOP_BASE_X = W / 2;
  var RIM_Y = 108;
  var FLOOR_Y = H - 30;
  var START = { x: W / 2, y: FLOOR_Y - BALL_R };

  // Easy = big stationary hoop; hard = smaller, moving hoop.
  var DIFFICULTIES = {
    easy:   { rimHalf: 42, moving: false, hoopSpeed: 0,     amp: 0 },
    medium: { rimHalf: 32, moving: false, hoopSpeed: 0,     amp: 0 },
    hard:   { rimHalf: 24, moving: true,  hoopSpeed: 0.028, amp: 95 }
  };
  var cfg = DIFFICULTIES.medium;

  var ball, particles, state, shotsTaken, makes, resolved, over, hoopX, hoopPhase;
  var dragging = false, dragCurrent = null;

  function refreshHud() {
    scoreEl.textContent = makes;
    bestEl.textContent = window.ArcadeCommon.getBest(GAME_ID) || 0;
    shotNumEl.textContent = shotsTaken;
  }

  function resetBall() {
    ball = { x: START.x, y: START.y, vx: 0, vy: 0 };
    state = "ready";
    resolved = false;
  }

  function newGame() {
    shotsTaken = 0;
    makes = 0;
    over = false;
    particles = [];
    hoopPhase = 0;
    hoopX = HOOP_BASE_X;
    resultBanner.innerHTML = "";
    resetBall();
    refreshHud();
  }

  function toCanvasPos(e) {
    var rect = canvas.getBoundingClientRect();
    var cx = e.touches ? e.touches[0].clientX : e.clientX;
    var cy = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: (cx - rect.left) * (W / rect.width), y: (cy - rect.top) * (H / rect.height) };
  }

  function spawnConfetti(cx, cy) {
    var colors = ["#ff5da2", "#7c5cff", "#29e0c9", "#ffd23f", "#3ddc84"];
    for (var i = 0; i < 22; i++) {
      var ang = Math.random() * Math.PI * 2;
      var spd = 2 + Math.random() * 4;
      particles.push({ x: cx, y: cy, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd - 2, life: 1, color: window.ArcadeCommon.pick(colors) });
    }
  }

  function update() {
    // Hoop motion (hard mode) always runs so aiming accounts for it.
    if (cfg.moving) {
      hoopPhase += cfg.hoopSpeed;
      hoopX = HOOP_BASE_X + Math.sin(hoopPhase) * cfg.amp;
    } else {
      hoopX = HOOP_BASE_X;
    }

    for (var j = particles.length - 1; j >= 0; j--) {
      var p = particles[j];
      p.x += p.vx; p.y += p.vy; p.vy += 0.14; p.life -= 0.02;
      if (p.life <= 0) particles.splice(j, 1);
    }

    if (state !== "flight") return;
    ball.vy += GRAVITY;
    ball.x += ball.vx;
    ball.y += ball.vy;

    if (ball.x < BALL_R) { ball.x = BALL_R; ball.vx *= -0.6; }
    if (ball.x > W - BALL_R) { ball.x = W - BALL_R; ball.vx *= -0.6; }

    if (!resolved && ball.vy > 0 && ball.y >= RIM_Y - 4 && ball.y <= RIM_Y + 10) {
      if (Math.abs(ball.x - hoopX) <= cfg.rimHalf - BALL_R * 0.6) {
        resolved = true;
        makes++;
        spawnConfetti(hoopX, RIM_Y);
        window.ArcadeCommon.toast("Swish! +1");
        refreshHud();
      }
    }

    if (ball.y > FLOOR_Y + 40 || ball.y < -400 || ball.x < -100 || ball.x > W + 100) {
      finishShot();
    }
  }

  function finishShot() {
    state = "resolved";
    if (shotsTaken >= TOTAL_SHOTS) {
      endGame();
      return;
    }
    setTimeout(function () {
      resetBall();
    }, 500);
  }

  function endGame() {
    over = true;
    var improved = window.ArcadeCommon.setBest(GAME_ID, makes);
    resultBanner.innerHTML = '<span class="overlay-win">' + window.ArcadeI18n.t("common.gameOver") +
      " — " + makes + "/" + TOTAL_SHOTS + " made" + (improved ? " 🏆" : "") + "</span>";
    refreshHud();
  }

  function draw() {
    var grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "#0e1224");
    grad.addColorStop(1, "#171b2e");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Glow orbs.
    [{ x: W * 0.5, y: RIM_Y, c: "rgba(255,138,61,0.14)", r: 150 },
     { x: W * 0.5, y: H * 0.75, c: "rgba(124,92,255,0.12)", r: 190 }].forEach(function (o) {
      var g = ctx.createRadialGradient(o.x, o.y, 4, o.x, o.y, o.r);
      g.addColorStop(0, o.c); g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2); ctx.fill();
    });

    // Floor with neon edge.
    ctx.fillStyle = "#241a2e";
    ctx.fillRect(0, FLOOR_Y, W, H - FLOOR_Y);
    ctx.save();
    ctx.shadowColor = "#7c5cff"; ctx.shadowBlur = 12;
    ctx.strokeStyle = "rgba(124,92,255,0.7)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, FLOOR_Y); ctx.lineTo(W, FLOOR_Y); ctx.stroke();
    ctx.restore();

    // Backboard.
    ctx.save();
    ctx.shadowColor = "#29e0c9"; ctx.shadowBlur = 10;
    ctx.fillStyle = "#eef0fb";
    ctx.fillRect(hoopX - 40, RIM_Y - 55, 80, 8);
    ctx.strokeStyle = "#ff5d5d"; ctx.lineWidth = 2;
    ctx.strokeRect(hoopX - 14, RIM_Y - 47, 28, 16);
    ctx.restore();

    // Rim with glow.
    ctx.save();
    ctx.shadowColor = "#ff8a3d"; ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.moveTo(hoopX - cfg.rimHalf, RIM_Y);
    ctx.lineTo(hoopX + cfg.rimHalf, RIM_Y);
    ctx.strokeStyle = "#ffb84d";
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.restore();

    // Net.
    ctx.strokeStyle = "rgba(238,240,251,0.55)";
    ctx.lineWidth = 1;
    for (var i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(hoopX + i * (cfg.rimHalf / 2.2), RIM_Y);
      ctx.lineTo(hoopX + i * (cfg.rimHalf / 3.2), RIM_Y + 26);
      ctx.stroke();
    }

    if (dragging && dragCurrent && state === "ready") {
      var dx = dragCurrent.x - ball.x, dy = dragCurrent.y - ball.y;
      var dist = Math.min(Math.sqrt(dx * dx + dy * dy), MAX_DRAG);
      var angle = Math.atan2(dy, dx);
      ctx.beginPath();
      ctx.moveTo(ball.x, ball.y);
      ctx.lineTo(ball.x + Math.cos(angle) * dist, ball.y + Math.sin(angle) * dist);
      ctx.strokeStyle = "rgba(238,240,251,0.5)";
      ctx.setLineDash([5, 5]);
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.save();
      ctx.shadowColor = "#29e0c9"; ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(ball.x, ball.y);
      ctx.lineTo(ball.x - Math.cos(angle) * dist, ball.y - Math.sin(angle) * dist);
      ctx.strokeStyle = "#29e0c9";
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.restore();
    }

    // Ball with glow.
    ctx.save();
    ctx.shadowColor = "#ff8a3d"; ctx.shadowBlur = 14;
    ctx.font = (BALL_R * 2) + "px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("🏀", ball.x, ball.y);
    ctx.restore();

    // Confetti.
    particles.forEach(function (p) {
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    });
    ctx.globalAlpha = 1;
  }

  function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
  }

  function startDrag(e) {
    if (over || state !== "ready") return;
    var pos = toCanvasPos(e);
    var dx = pos.x - ball.x, dy = pos.y - ball.y;
    if (Math.sqrt(dx * dx + dy * dy) > 90) return;
    dragging = true;
    dragCurrent = pos;
    e.preventDefault();
  }
  function moveDrag(e) {
    if (!dragging) return;
    dragCurrent = toCanvasPos(e);
    e.preventDefault();
  }
  function endDrag() {
    if (!dragging) return;
    dragging = false;
    var dx = dragCurrent.x - ball.x, dy = dragCurrent.y - ball.y;
    var dist = Math.min(Math.sqrt(dx * dx + dy * dy), MAX_DRAG);
    if (dist > 12) {
      var angle = Math.atan2(dy, dx);
      ball.vx = -Math.cos(angle) * dist * POWER_SCALE;
      ball.vy = -Math.sin(angle) * dist * POWER_SCALE;
      state = "flight";
      shotsTaken++;
      refreshHud();
    }
    dragCurrent = null;
  }

  canvas.addEventListener("mousedown", startDrag);
  canvas.addEventListener("mousemove", moveDrag);
  window.addEventListener("mouseup", endDrag);
  canvas.addEventListener("touchstart", startDrag, { passive: false });
  canvas.addEventListener("touchmove", moveDrag, { passive: false });
  canvas.addEventListener("touchend", endDrag);

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
