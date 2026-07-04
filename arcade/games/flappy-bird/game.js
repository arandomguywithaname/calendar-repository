(function () {
  var GAME_ID = "flappy-bird";
  var canvas = document.getElementById("board");
  var ctx = canvas.getContext("2d");
  var scoreEl = document.getElementById("score");
  var bestEl = document.getElementById("best");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");
  var flapBtn = document.getElementById("flap");

  var W = canvas.width, H = canvas.height;
  var BIRD_X = 70, BIRD_R = 14;
  var GRAVITY = 0.5;
  var FLAP_V = -8;
  var PIPE_W = 56;
  var GAP = 140;
  var PIPE_SPEED = 2.6;

  var bird, pipes, score, over, started, loopId, spawnTimer;

  function refreshHud() {
    scoreEl.textContent = score;
    bestEl.textContent = window.ArcadeCommon.getBest(GAME_ID) || 0;
  }

  function newGame() {
    bird = { y: H / 2, v: 0, rot: 0 };
    pipes = [];
    score = 0;
    over = false;
    started = false;
    spawnTimer = 0;
    resultBanner.innerHTML = "";
    refreshHud();
    cancelAnimationFrame(loopId);
    draw();
  }

  function spawnPipe() {
    var gapY = window.ArcadeCommon.randInt(60, H - 60 - GAP);
    pipes.push({ x: W, gapY: gapY, passed: false });
  }

  function update() {
    if (!started || over) return;

    bird.v += GRAVITY;
    bird.y += bird.v;
    bird.rot = Math.max(-0.5, Math.min(1.2, bird.v / 12));

    spawnTimer++;
    if (spawnTimer > 95) {
      spawnTimer = 0;
      spawnPipe();
    }

    pipes.forEach(function (p) { p.x -= PIPE_SPEED; });
    pipes = pipes.filter(function (p) { return p.x > -PIPE_W; });

    pipes.forEach(function (p) {
      if (!p.passed && p.x + PIPE_W < BIRD_X) {
        p.passed = true;
        score++;
        refreshHud();
      }
      if (BIRD_X + BIRD_R > p.x && BIRD_X - BIRD_R < p.x + PIPE_W) {
        if (bird.y - BIRD_R < p.gapY || bird.y + BIRD_R > p.gapY + GAP) {
          endGame();
        }
      }
    });

    if (bird.y - BIRD_R < 0 || bird.y + BIRD_R > H) {
      endGame();
    }
  }

  function endGame() {
    over = true;
    window.ArcadeCommon.setBest(GAME_ID, score);
    resultBanner.innerHTML = '<span class="overlay-lose">' + window.ArcadeI18n.t("common.gameOver") + "</span>";
  }

  function draw() {
    ctx.fillStyle = "#171b2e";
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = "#3ddc84";
    pipes.forEach(function (p) {
      ctx.fillRect(p.x, 0, PIPE_W, p.gapY);
      ctx.fillRect(p.x, p.gapY + GAP, PIPE_W, H - (p.gapY + GAP));
    });

    ctx.save();
    ctx.translate(BIRD_X, bird.y);
    ctx.rotate(bird.rot);
    ctx.font = "28px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("🐦", 0, 10);
    ctx.restore();

    if (!started && !over) {
      ctx.fillStyle = "#eef0fb";
      ctx.font = "bold 16px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Click / Space to start", W / 2, H / 2);
    }
  }

  function loop() {
    update();
    draw();
    if (!over) loopId = requestAnimationFrame(loop);
  }

  function flap() {
    if (over) return;
    if (!started) {
      started = true;
      loop();
    }
    bird.v = FLAP_V;
  }

  document.addEventListener("keydown", function (e) {
    if (e.key === " ") { e.preventDefault(); flap(); }
  });
  canvas.addEventListener("mousedown", flap);
  canvas.addEventListener("touchstart", function (e) { e.preventDefault(); flap(); }, { passive: false });
  flapBtn.addEventListener("click", flap);

  restartBtn.addEventListener("click", newGame);
  newGame();
})();
