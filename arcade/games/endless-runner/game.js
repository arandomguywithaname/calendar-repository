(function () {
  var GAME_ID = "endless-runner";
  var canvas = document.getElementById("board");
  var ctx = canvas.getContext("2d");
  var scoreEl = document.getElementById("score");
  var bestEl = document.getElementById("best");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");
  var jumpBtn = document.getElementById("jump-btn");

  var W = canvas.width, H = canvas.height;
  var GROUND_Y = H - 46;
  var PLAYER_X = 70;
  var PLAYER_W = 34, PLAYER_H = 44;
  var GRAVITY = 0.7;
  var JUMP_VY = -13.5;

  var playerY, vy, onGround, obstacles, elapsedMs, spawnTimer, distance, over, groundOffset;

  function refreshHud() {
    scoreEl.textContent = Math.floor(distance / 8);
    bestEl.textContent = window.ArcadeCommon.getBest(GAME_ID) || 0;
  }

  function newGame() {
    playerY = GROUND_Y - PLAYER_H;
    vy = 0;
    onGround = true;
    obstacles = [];
    elapsedMs = 0;
    spawnTimer = 0;
    distance = 0;
    groundOffset = 0;
    over = false;
    resultBanner.innerHTML = "";
    refreshHud();
  }

  function currentSpeed() { return Math.min(5 + elapsedMs / 2600, 13); }
  function currentSpawnInterval() { return Math.max(1400 - elapsedMs / 20, 550); }

  function jump() {
    if (over) return;
    if (onGround) {
      vy = JUMP_VY;
      onGround = false;
    }
  }

  function spawnObstacle() {
    var variants = [
      { w: 22, h: 34 },
      { w: 30, h: 46 },
      { w: 44, h: 28 },
      { w: 20, h: 58 }
    ];
    var v = window.ArcadeCommon.pick(variants);
    obstacles.push({ x: W + v.w, w: v.w, h: v.h });
  }

  function update(dt) {
    if (over) return;
    elapsedMs += dt;
    var speed = currentSpeed();
    distance += speed;
    groundOffset = (groundOffset + speed) % 30;

    vy += GRAVITY;
    playerY += vy;
    if (playerY >= GROUND_Y - PLAYER_H) {
      playerY = GROUND_Y - PLAYER_H;
      vy = 0;
      onGround = true;
    }

    spawnTimer += dt;
    if (spawnTimer >= currentSpawnInterval()) {
      spawnTimer = 0;
      spawnObstacle();
    }

    obstacles.forEach(function (o) { o.x -= speed; });
    obstacles = obstacles.filter(function (o) { return o.x + o.w > -10; });

    var pLeft = PLAYER_X - PLAYER_W / 2, pRight = PLAYER_X + PLAYER_W / 2;
    var pTop = playerY, pBottom = playerY + PLAYER_H;
    for (var i = 0; i < obstacles.length; i++) {
      var o = obstacles[i];
      var oLeft = o.x, oRight = o.x + o.w;
      var oTop = GROUND_Y - o.h, oBottom = GROUND_Y;
      if (pLeft < oRight - 5 && pRight > oLeft + 5 && pTop < oBottom - 4 && pBottom > oTop + 4) {
        endGame();
        return;
      }
    }
    refreshHud();
  }

  function endGame() {
    over = true;
    var score = Math.floor(distance / 8);
    var improved = window.ArcadeCommon.setBest(GAME_ID, score);
    resultBanner.innerHTML = '<span class="overlay-lose">' + window.ArcadeI18n.t("common.gameOver") +
      " — " + window.ArcadeI18n.t("common.score") + ": " + score + (improved ? " 🏆" : "") + "</span>";
    refreshHud();
  }

  function draw() {
    var grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "#1c2138");
    grad.addColorStop(1, "#171b2e");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = "#2f3550";
    ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
    ctx.strokeStyle = "rgba(238,240,251,0.35)";
    ctx.lineWidth = 2;
    ctx.setLineDash([16, 14]);
    ctx.beginPath();
    ctx.moveTo(-30 + groundOffset, GROUND_Y);
    ctx.lineTo(W, GROUND_Y);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = "#ff5da2";
    obstacles.forEach(function (o) {
      ctx.fillRect(o.x, GROUND_Y - o.h, o.w, o.h);
    });

    ctx.font = (PLAYER_H) + "px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText("🏃", PLAYER_X, playerY + PLAYER_H + 6);
  }

  var lastTime = null;
  function loop(ts) {
    if (lastTime === null) lastTime = ts;
    var dt = Math.min(ts - lastTime, 40);
    lastTime = ts;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  document.addEventListener("keydown", function (e) {
    if (e.key === " " || e.key === "ArrowUp" || e.key === "Spacebar") {
      e.preventDefault();
      jump();
    }
  });
  canvas.addEventListener("mousedown", jump);
  canvas.addEventListener("touchstart", function (e) { e.preventDefault(); jump(); }, { passive: false });
  jumpBtn.addEventListener("click", jump);

  restartBtn.addEventListener("click", newGame);
  newGame();
  requestAnimationFrame(loop);
})();
