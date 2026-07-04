(function () {
  var GAME_ID = "plinko";
  var canvas = document.getElementById("board");
  var ctx = canvas.getContext("2d");
  var scoreEl = document.getElementById("score");
  var bestEl = document.getElementById("best");
  var W = canvas.width, H = canvas.height;

  var ROWS = 9;
  var PEG_SPACING = 46;
  var PEG_TOP = 70;
  var PEG_RADIUS = 5;
  var BALL_RADIUS = 8;
  var GRAVITY = 0.32;
  var DAMPING = 0.72;

  var pegs = [];
  var slots = [];
  var balls = [];
  var score = 0;

  function buildPegs() {
    pegs = [];
    for (var row = 0; row < ROWS; row++) {
      var count = row + 3;
      var rowWidth = (count - 1) * PEG_SPACING;
      var startX = W / 2 - rowWidth / 2;
      for (var i = 0; i < count; i++) {
        pegs.push({ x: startX + i * PEG_SPACING, y: PEG_TOP + row * PEG_SPACING * 0.86 });
      }
    }
  }

  var SLOT_VALUES = [100, 50, 20, 10, 5, 2, 5, 10, 20, 50, 100];

  function buildSlots() {
    slots = [];
    var n = SLOT_VALUES.length;
    var slotWidth = W / n;
    for (var i = 0; i < n; i++) {
      slots.push({ x: i * slotWidth, w: slotWidth, value: SLOT_VALUES[i] });
    }
  }

  function loadBest() { return window.ArcadeCommon.getBest(GAME_ID) || 0; }
  function refreshHud() {
    scoreEl.textContent = score;
    bestEl.textContent = loadBest();
  }

  function dropBall(x) {
    balls.push({
      x: x || (W / 2 + (Math.random() - 0.5) * 20),
      y: 20,
      vx: (Math.random() - 0.5) * 0.6,
      vy: 0,
      settled: false
    });
  }

  function updateBalls() {
    balls.forEach(function (b) {
      if (b.settled) return;
      b.vy += GRAVITY;
      b.x += b.vx;
      b.y += b.vy;

      if (b.x < BALL_RADIUS) { b.x = BALL_RADIUS; b.vx *= -DAMPING; }
      if (b.x > W - BALL_RADIUS) { b.x = W - BALL_RADIUS; b.vx *= -DAMPING; }

      pegs.forEach(function (p) {
        var dx = b.x - p.x, dy = b.y - p.y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        var minDist = BALL_RADIUS + PEG_RADIUS;
        if (dist < minDist && dist > 0) {
          var nx = dx / dist, ny = dy / dist;
          b.x = p.x + nx * minDist;
          b.y = p.y + ny * minDist;
          var dot = b.vx * nx + b.vy * ny;
          b.vx -= 2 * dot * nx;
          b.vy -= 2 * dot * ny;
          b.vx *= DAMPING;
          b.vy *= DAMPING;
          b.vx += (Math.random() - 0.5) * 0.5;
        }
      });

      var slotTop = H - 44;
      if (b.y >= slotTop) {
        b.y = slotTop;
        if (!b.settled) {
          b.settled = true;
          var slot = slots.find(function (s) { return b.x >= s.x && b.x < s.x + s.w; }) || slots[slots.length - 1];
          score += slot.value;
          window.ArcadeCommon.toast("+" + slot.value);
          if (window.ArcadeCommon.setBest(GAME_ID, score)) {}
          refreshHud();
          setTimeout(function () {
            var idx = balls.indexOf(b);
            if (idx !== -1) balls.splice(idx, 1);
          }, 500);
        }
      }
    });
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    ctx.fillStyle = "#242a45";
    pegs.forEach(function (p) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, PEG_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = "#7c5cff";
      ctx.fill();
    });

    var slotTop = H - 44;
    slots.forEach(function (s, i) {
      ctx.fillStyle = i % 2 === 0 ? "#1c2138" : "#242a45";
      ctx.fillRect(s.x, slotTop, s.w, 44);
      ctx.strokeStyle = "#323a5c";
      ctx.strokeRect(s.x, slotTop, s.w, 44);
      ctx.fillStyle = "#eef0fb";
      ctx.font = "bold 13px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(s.value, s.x + s.w / 2, slotTop + 26);
    });

    balls.forEach(function (b) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, BALL_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = "#ff5da2";
      ctx.fill();
    });
  }

  function loop() {
    updateBalls();
    draw();
    requestAnimationFrame(loop);
  }

  document.getElementById("drop").addEventListener("click", function () { dropBall(); });
  document.getElementById("drop5").addEventListener("click", function () {
    for (var i = 0; i < 5; i++) setTimeout(function () { dropBall(); }, i * 220);
  });
  document.getElementById("reset").addEventListener("click", function () {
    balls = [];
    score = 0;
    refreshHud();
  });
  canvas.addEventListener("click", function (e) {
    var rect = canvas.getBoundingClientRect();
    var x = (e.clientX - rect.left) * (W / rect.width);
    if (e.clientY - rect.top < PEG_TOP) dropBall(x);
  });

  buildPegs();
  buildSlots();
  refreshHud();
  loop();
})();
