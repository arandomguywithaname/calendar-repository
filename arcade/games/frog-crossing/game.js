(function () {
  var GAME_ID = "frog-crossing";
  var canvas = document.getElementById("board");
  var ctx = canvas.getContext("2d");
  var scoreEl = document.getElementById("score");
  var bestEl = document.getElementById("best");
  var levelEl = document.getElementById("level");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");

  var COLS = 9, ROWS = 10, CELL = 50;
  var CAR_EMOJI = ["🚗", "🚙", "🚕", "🚓", "🚌"];

  var frog, score, level, lanes, over, rafId, lastTime;

  function refreshHud() {
    scoreEl.textContent = score;
    levelEl.textContent = level;
    var best = window.ArcadeCommon.getBest(GAME_ID);
    bestEl.textContent = best === null ? "-" : best;
  }

  function buildLanes() {
    lanes = [];
    var speedMul = 1 + (level - 1) * 0.18;
    for (var r = 1; r <= 8; r++) {
      var dir = r % 2 === 0 ? 1 : -1;
      var baseSpeed = 40 + (r % 4) * 18;
      var speed = baseSpeed * speedMul * dir;
      var gap = window.ArcadeCommon.randInt(160, 220);
      var obstacles = [];
      var count = Math.ceil((COLS * CELL) / gap) + 1;
      for (var i = 0; i < count; i++) {
        obstacles.push({ x: i * gap + window.ArcadeCommon.randInt(0, 40), w: CELL * 1.5, emoji: window.ArcadeCommon.pick(CAR_EMOJI) });
      }
      lanes.push({ row: r, speed: speed, obstacles: obstacles });
    }
  }

  function resetFrog() {
    frog = { row: ROWS - 1, col: Math.floor(COLS / 2) };
  }

  function newGame() {
    score = 0;
    level = 1;
    over = false;
    resetFrog();
    buildLanes();
    resultBanner.innerHTML = "";
    refreshHud();
    lastTime = null;
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(loop);
  }

  function loop(ts) {
    if (lastTime === null) lastTime = ts;
    var dt = Math.min((ts - lastTime) / 1000, 0.05);
    lastTime = ts;
    if (!over) {
      lanes.forEach(function (lane) {
        lane.obstacles.forEach(function (ob) {
          ob.x += lane.speed * dt;
          var totalW = COLS * CELL;
          if (lane.speed > 0 && ob.x > totalW) ob.x -= totalW + 220;
          if (lane.speed < 0 && ob.x < -220) ob.x += totalW + 220;
        });
      });
      checkCollision();
    }
    draw();
    rafId = requestAnimationFrame(loop);
  }

  function checkCollision() {
    var lane = lanes.filter(function (l) { return l.row === frog.row; })[0];
    if (!lane) return;
    var frogX = frog.col * CELL;
    var hit = lane.obstacles.some(function (ob) {
      return frogX < ob.x + ob.w && frogX + CELL > ob.x;
    });
    if (hit) endGame(false);
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (var r = 0; r < ROWS; r++) {
      var isGoal = r === 0;
      var isStart = r === ROWS - 1;
      ctx.fillStyle = isGoal || isStart ? "#1f4a2e" : (r % 2 === 0 ? "#2a2f4a" : "#242945");
      ctx.fillRect(0, r * CELL, canvas.width, CELL);
    }
    lanes.forEach(function (lane) {
      ctx.font = (CELL * 0.7) + "px sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      lane.obstacles.forEach(function (ob) {
        ctx.save();
        if (lane.speed < 0) {
          ctx.translate(ob.x + ob.w, lane.row * CELL + CELL / 2);
          ctx.scale(-1, 1);
          ctx.fillText(ob.emoji, 4, 2);
        } else {
          ctx.fillText(ob.emoji, ob.x + 4, lane.row * CELL + CELL / 2 + 2);
        }
        ctx.restore();
      });
    });
    ctx.font = (CELL * 0.75) + "px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("🐸", frog.col * CELL + CELL / 2, frog.row * CELL + CELL / 2 + 2);
  }

  function move(dir) {
    if (over) return;
    if (dir === "up") frog.row = Math.max(0, frog.row - 1);
    else if (dir === "down") frog.row = Math.min(ROWS - 1, frog.row + 1);
    else if (dir === "left") frog.col = Math.max(0, frog.col - 1);
    else if (dir === "right") frog.col = Math.min(COLS - 1, frog.col + 1);
    if (frog.row === 0) {
      score++;
      level++;
      window.ArcadeCommon.toast("🎉 Crossed!");
      refreshHud();
      resetFrog();
      buildLanes();
    }
  }

  function endGame() {
    if (over) return;
    over = true;
    var improved = window.ArcadeCommon.setBest(GAME_ID, score);
    resultBanner.innerHTML = '<span class="overlay-lose">' + window.ArcadeI18n.t("common.gameOver") +
      " — " + window.ArcadeI18n.t("common.score") + ": " + score + (improved ? " 🏆" : "") + "</span>";
    refreshHud();
  }

  document.addEventListener("keydown", function (e) {
    var map = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };
    if (map[e.key]) { e.preventDefault(); move(map[e.key]); }
  });

  document.getElementById("touch-controls").addEventListener("click", function (e) {
    var btn = e.target.closest("[data-dir]");
    if (btn) move(btn.getAttribute("data-dir"));
  });

  restartBtn.addEventListener("click", newGame);
  newGame();
})();
