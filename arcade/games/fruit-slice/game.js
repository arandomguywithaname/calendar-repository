(function () {
  var GAME_ID = "fruit-slice";
  var canvas = document.getElementById("board");
  var ctx = canvas.getContext("2d");
  var scoreEl = document.getElementById("score");
  var bestEl = document.getElementById("best");
  var livesEl = document.getElementById("lives");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");

  var W = canvas.width, H = canvas.height;
  var GRAVITY = 0.22;
  var FRUITS = ["🍉", "🍎", "🍊", "🍋", "🍓", "🍇", "🥝", "🍑"];
  var START_LIVES = 3;

  var objects, score, lives, over, startTime, spawnTimer, rafId;
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
    var isBomb = Math.random() < 0.16;
    var x = window.ArcadeCommon.randInt(60, W - 60);
    var vx = (Math.random() - 0.5) * 3;
    var launchStrength = 9.5 + Math.random() * 2 + Math.min(3, elapsedSec() / 20);
    objects.push({
      x: x,
      y: H + 20,
      vx: vx,
      vy: -launchStrength,
      r: 30,
      emoji: isBomb ? "💣" : window.ArcadeCommon.pick(FRUITS),
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
      var count = Math.random() < 0.3 ? 2 : 1;
      for (var i = 0; i < count; i++) spawnObject();
      var delay = Math.max(500, 1400 - elapsedSec() * 20);
      spawnTimer = setTimeout(tick, delay + Math.random() * 400);
    }
    tick();
  }

  function newGame() {
    objects = [];
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
        o.vy += GRAVITY;
        if (o.sliceT >= 1) objects.splice(i, 1);
        continue;
      }
      o.vy += GRAVITY;
      o.x += o.vx;
      o.y += o.vy;
      o.rot += o.rotSpeed;
      if (o.y - o.r > H + 40) {
        objects.splice(i, 1);
      }
    }
    if (trail.length) {
      var now = Date.now();
      trail = trail.filter(function (p) { return now - p.t < 150; });
    }
  }

  function draw() {
    ctx.fillStyle = "#101229";
    ctx.fillRect(0, 0, W, H);

    // trail
    if (trail.length > 1) {
      ctx.strokeStyle = "rgba(255,255,255,0.6)";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(trail[0].x, trail[0].y);
      for (var t = 1; t < trail.length; t++) ctx.lineTo(trail[t].x, trail[t].y);
      ctx.stroke();
    }

    objects.forEach(function (o) {
      ctx.save();
      ctx.translate(o.x, o.y);
      ctx.rotate(o.rot);
      if (o.sliced) {
        ctx.globalAlpha = 1 - o.sliceT;
        ctx.font = (o.r * 1.4) + "px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.save();
        ctx.translate(-6 - o.sliceT * 14, o.sliceT * 10);
        ctx.fillText(o.emoji, 0, 0);
        ctx.restore();
        ctx.save();
        ctx.translate(6 + o.sliceT * 14, o.sliceT * 10);
        ctx.fillText(o.emoji, 0, 0);
        ctx.restore();
      } else {
        ctx.font = (o.r * 1.4) + "px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(o.emoji, 0, 0);
      }
      ctx.restore();
    });
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
  newGame();
})();
