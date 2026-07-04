(function () {
  var GAME_ID = "golf-putt";
  var canvas = document.getElementById("board");
  var ctx = canvas.getContext("2d");
  var scoreEl = document.getElementById("score");
  var bestEl = document.getElementById("best");
  var holeNumEl = document.getElementById("hole-num");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");

  var W = canvas.width, H = canvas.height;
  var BALL_R = 8;
  var HOLE_R = 14;
  var FRICTION = 0.985;
  var MAX_DRAG = 110;
  var POWER_SCALE = 0.16;

  var LEVELS = [
    {
      ball: { x: 50, y: H / 2 },
      hole: { x: W - 50, y: H / 2 },
      walls: [
        { x: 220, y: 0, w: 20, h: 230 },
        { x: 220, y: 300, w: 20, h: H - 300 }
      ]
    },
    {
      ball: { x: 50, y: 60 },
      hole: { x: W - 60, y: H - 60 },
      walls: [
        { x: 150, y: 60, w: 20, h: 240 },
        { x: 310, y: 60, w: 20, h: 240 }
      ]
    },
    {
      ball: { x: W / 2, y: H - 40 },
      hole: { x: W / 2, y: 40 },
      walls: [
        { x: 0, y: 160, w: 300, h: 20 },
        { x: 340, y: 160, w: W - 340, h: 20 },
        { x: 140, y: 60, w: 20, h: 80 },
        { x: 320, y: 220, w: 20, h: 80 }
      ]
    }
  ];

  var levelIndex, ball, hole, walls, strokes, totalStrokes, over, holed;
  var dragging = false, dragStart = null, dragCurrent = null;

  function refreshHud() {
    scoreEl.textContent = totalStrokes;
    holeNumEl.textContent = levelIndex + 1;
    var best = window.ArcadeCommon.getBest(GAME_ID);
    bestEl.textContent = best === null ? "-" : best;
  }

  function loadLevel(idx) {
    var lvl = LEVELS[idx];
    ball = { x: lvl.ball.x, y: lvl.ball.y, vx: 0, vy: 0 };
    hole = lvl.hole;
    walls = lvl.walls;
    strokes = 0;
    holed = false;
  }

  function newGame() {
    levelIndex = 0;
    totalStrokes = 0;
    over = false;
    resultBanner.innerHTML = "";
    loadLevel(0);
    refreshHud();
  }

  function toCanvasPos(e) {
    var rect = canvas.getBoundingClientRect();
    var cx = e.touches ? e.touches[0].clientX : e.clientX;
    var cy = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: (cx - rect.left) * (W / rect.width), y: (cy - rect.top) * (H / rect.height) };
  }

  function ballSpeed() { return Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy); }

  function update() {
    if (over || holed) return;
    var speed = ballSpeed();
    if (speed > 0.02) {
      ball.x += ball.vx;
      ball.y += ball.vy;
      ball.vx *= FRICTION;
      ball.vy *= FRICTION;

      if (ball.x < BALL_R) { ball.x = BALL_R; ball.vx *= -0.75; }
      if (ball.x > W - BALL_R) { ball.x = W - BALL_R; ball.vx *= -0.75; }
      if (ball.y < BALL_R) { ball.y = BALL_R; ball.vy *= -0.75; }
      if (ball.y > H - BALL_R) { ball.y = H - BALL_R; ball.vy *= -0.75; }

      walls.forEach(function (w) {
        var closestX = Math.max(w.x, Math.min(ball.x, w.x + w.w));
        var closestY = Math.max(w.y, Math.min(ball.y, w.y + w.h));
        var dx = ball.x - closestX, dy = ball.y - closestY;
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < BALL_R && dist > 0) {
          var nx = dx / dist, ny = dy / dist;
          ball.x = closestX + nx * BALL_R;
          ball.y = closestY + ny * BALL_R;
          var dot = ball.vx * nx + ball.vy * ny;
          ball.vx -= 2 * dot * nx;
          ball.vy -= 2 * dot * ny;
          ball.vx *= 0.8;
          ball.vy *= 0.8;
        } else if (dist === 0) {
          // ball center exactly on the rect edge line — nudge away
          ball.vx *= -0.8;
          ball.vy *= -0.8;
        }
      });
    } else {
      ball.vx = 0;
      ball.vy = 0;
    }

    var dHole = Math.sqrt((ball.x - hole.x) * (ball.x - hole.x) + (ball.y - hole.y) * (ball.y - hole.y));
    if (dHole < HOLE_R * 0.75 && !holed) {
      holed = true;
      ball.x = hole.x;
      ball.y = hole.y;
      ball.vx = 0;
      ball.vy = 0;
      totalStrokes += 0; // strokes already counted per putt
      refreshHud();
      setTimeout(nextHole, 900);
    }
  }

  function nextHole() {
    if (levelIndex >= LEVELS.length - 1) {
      finishGame();
      return;
    }
    levelIndex++;
    loadLevel(levelIndex);
    refreshHud();
  }

  function finishGame() {
    over = true;
    var improved = window.ArcadeCommon.setBestLowerIsBetter(GAME_ID, totalStrokes);
    resultBanner.innerHTML = '<span class="overlay-win">' + window.ArcadeI18n.t("common.youWin") +
      " — " + totalStrokes + " total strokes" + (improved ? " 🏆" : "") + "</span>";
    refreshHud();
  }

  function draw() {
    ctx.fillStyle = "#1c3b25";
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = "#274d31";
    walls.forEach(function (w) { ctx.fillRect(w.x, w.y, w.w, w.h); });
    ctx.strokeStyle = "#0f2417";
    ctx.lineWidth = 2;
    walls.forEach(function (w) { ctx.strokeRect(w.x, w.y, w.w, w.h); });

    ctx.beginPath();
    ctx.arc(hole.x, hole.y, HOLE_R, 0, Math.PI * 2);
    ctx.fillStyle = "#05131c";
    ctx.fill();
    ctx.strokeStyle = "#eef0fb";
    ctx.lineWidth = 2;
    ctx.stroke();

    if (dragging && dragCurrent && !holed) {
      var dx = ball.x - dragCurrent.x, dy = ball.y - dragCurrent.y;
      var dist = Math.min(Math.sqrt(dx * dx + dy * dy), MAX_DRAG);
      var angle = Math.atan2(dy, dx);
      var aimX = ball.x + Math.cos(angle) * dist;
      var aimY = ball.y + Math.sin(angle) * dist;
      ctx.beginPath();
      ctx.moveTo(ball.x, ball.y);
      ctx.lineTo(aimX, aimY);
      ctx.strokeStyle = "rgba(238,240,251,0.8)";
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
      // shot direction indicator (opposite of drag)
      ctx.beginPath();
      ctx.moveTo(ball.x, ball.y);
      ctx.lineTo(ball.x - Math.cos(angle) * dist, ball.y - Math.sin(angle) * dist);
      ctx.strokeStyle = "var(--accent-3)";
      ctx.strokeStyle = "#29e0c9";
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.strokeStyle = "#05131c";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
  }

  function startDrag(e) {
    if (over || holed || ballSpeed() > 0.05) return;
    var pos = toCanvasPos(e);
    var dx = pos.x - ball.x, dy = pos.y - ball.y;
    if (Math.sqrt(dx * dx + dy * dy) > 60) return; // must start drag near the ball
    dragging = true;
    dragStart = pos;
    dragCurrent = pos;
    e.preventDefault();
  }

  function moveDrag(e) {
    if (!dragging) return;
    dragCurrent = toCanvasPos(e);
    e.preventDefault();
  }

  function endDrag(e) {
    if (!dragging) return;
    dragging = false;
    var dx = ball.x - dragCurrent.x, dy = ball.y - dragCurrent.y;
    var dist = Math.min(Math.sqrt(dx * dx + dy * dy), MAX_DRAG);
    if (dist > 8) {
      var angle = Math.atan2(dy, dx);
      ball.vx = Math.cos(angle) * dist * POWER_SCALE;
      ball.vy = Math.sin(angle) * dist * POWER_SCALE;
      strokes++;
      totalStrokes++;
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
  newGame();
  loop();
})();
