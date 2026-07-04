(function () {
  var GAME_ID = "bubble-pop";
  var canvas = document.getElementById("board");
  var ctx = canvas.getContext("2d");
  var scoreEl = document.getElementById("score");
  var bestEl = document.getElementById("best");
  var timeEl = document.getElementById("time");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");

  var W = canvas.width, H = canvas.height;
  var DURATION = 45000;
  var COLORS = ["#ff5da2", "#7c5cff", "#29e0c9", "#3ddc84", "#ffb84d"];

  var bubbles, score, over, startTime, spawnTimer, rafId;

  function refreshHud() {
    scoreEl.textContent = score;
    bestEl.textContent = window.ArcadeCommon.getBest(GAME_ID) || 0;
    var remain = Math.max(0, DURATION - (Date.now() - startTime));
    timeEl.textContent = Math.ceil(remain / 1000);
  }

  function difficulty() {
    var t = (Date.now() - startTime) / DURATION; // 0..1
    return Math.min(1, t);
  }

  function spawnBubble() {
    var d = difficulty();
    var r = window.ArcadeCommon.randInt(14, 34) - d * 8;
    r = Math.max(10, r);
    var speed = 1.2 + d * 2.2 + (34 - r) / 34 * 1.5;
    bubbles.push({
      x: window.ArcadeCommon.randInt(r, W - r),
      y: H + r,
      r: r,
      speed: speed + Math.random() * 0.6,
      color: window.ArcadeCommon.pick(COLORS),
      wobble: Math.random() * Math.PI * 2,
      popped: false,
      popT: 0
    });
  }

  function scoreFor(r) {
    return Math.max(1, Math.round(30 / r));
  }

  function newGame() {
    bubbles = [];
    score = 0;
    over = false;
    startTime = Date.now();
    resultBanner.innerHTML = "";
    refreshHud();
    cancelAnimationFrame(rafId);
    clearInterval(spawnTimer);
    scheduleSpawns();
    loop();
  }

  function scheduleSpawns() {
    function tick() {
      if (over) return;
      spawnBubble();
      var d = difficulty();
      var delay = 650 - d * 400 + Math.random() * 200;
      spawnTimer = setTimeout(tick, Math.max(120, delay));
    }
    tick();
  }

  function endGame() {
    over = true;
    clearTimeout(spawnTimer);
    var isBest = window.ArcadeCommon.setBest(GAME_ID, score);
    refreshHud();
    resultBanner.innerHTML = '<span class="overlay-win">' + window.ArcadeI18n.t("common.gameOver") +
      " — Score: " + score + (isBest ? " — New Best!" : "") + "</span>";
  }

  function update() {
    if (over) return;
    for (var i = bubbles.length - 1; i >= 0; i--) {
      var b = bubbles[i];
      if (b.popped) {
        b.popT += 0.08;
        if (b.popT >= 1) bubbles.splice(i, 1);
        continue;
      }
      b.wobble += 0.05;
      b.x += Math.sin(b.wobble) * 0.6;
      b.y -= b.speed;
      if (b.y + b.r < 0) bubbles.splice(i, 1);
    }
    if (Date.now() - startTime >= DURATION) {
      endGame();
    }
  }

  function draw() {
    ctx.fillStyle = "#0f1220";
    ctx.fillRect(0, 0, W, H);

    bubbles.forEach(function (b) {
      ctx.save();
      if (b.popped) {
        ctx.globalAlpha = 1 - b.popT;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r * (1 + b.popT * 0.8), 0, Math.PI * 2);
        ctx.strokeStyle = b.color;
        ctx.lineWidth = 3;
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fillStyle = b.color + "55";
        ctx.fill();
        ctx.strokeStyle = b.color;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(b.x - b.r * 0.35, b.y - b.r * 0.35, b.r * 0.25, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,0.6)";
        ctx.fill();
      }
      ctx.restore();
    });
  }

  function loop() {
    update();
    draw();
    refreshHud();
    if (!over) rafId = requestAnimationFrame(loop);
  }

  canvas.addEventListener("click", function (e) {
    if (over) return;
    var rect = canvas.getBoundingClientRect();
    var x = (e.clientX - rect.left) * (W / rect.width);
    var y = (e.clientY - rect.top) * (H / rect.height);
    for (var i = bubbles.length - 1; i >= 0; i--) {
      var b = bubbles[i];
      if (b.popped) continue;
      var dx = x - b.x, dy = y - b.y;
      if (Math.sqrt(dx * dx + dy * dy) <= b.r) {
        b.popped = true;
        b.popT = 0;
        score += scoreFor(b.r);
        refreshHud();
        break;
      }
    }
  });

  restartBtn.addEventListener("click", newGame);
  newGame();
})();
