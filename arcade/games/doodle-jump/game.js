(function () {
  var GAME_ID = "doodle-jump";
  var canvas = document.getElementById("board");
  var ctx = canvas.getContext("2d");
  var scoreEl = document.getElementById("score");
  var bestEl = document.getElementById("best");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");

  var W = canvas.width, H = canvas.height;
  var PLAYER_W = 32, PLAYER_H = 32;
  var PLAT_W = 60, PLAT_H = 12;
  var GRAVITY = 0.32;
  var JUMP_V = -10.5;

  var player, platforms, score, over, height, loopId;
  var moveDir = 0;

  function refreshHud() {
    scoreEl.textContent = score;
    bestEl.textContent = window.ArcadeCommon.getBest(GAME_ID) || 0;
  }

  function buildPlatforms() {
    platforms = [];
    var y = H - 20;
    // starting platform under player
    platforms.push({ x: W / 2 - PLAT_W / 2, y: y, w: PLAT_W });
    y -= 70;
    while (y > -H) {
      platforms.push({
        x: window.ArcadeCommon.randInt(0, W - PLAT_W),
        y: y,
        w: PLAT_W
      });
      y -= window.ArcadeCommon.randInt(55, 90);
    }
  }

  function newGame() {
    player = { x: W / 2 - PLAYER_W / 2, y: H - 60, vy: JUMP_V, vx: 0 };
    score = 0;
    height = 0;
    over = false;
    resultBanner.innerHTML = "";
    buildPlatforms();
    refreshHud();
    cancelAnimationFrame(loopId);
    loop();
  }

  function maybeExtendPlatforms() {
    var topY = platforms.reduce(function (min, p) { return Math.min(min, p.y); }, 0);
    while (topY > -H) {
      topY -= window.ArcadeCommon.randInt(55, 90);
      platforms.push({ x: window.ArcadeCommon.randInt(0, W - PLAT_W), y: topY, w: PLAT_W });
    }
  }

  function update() {
    if (over) return;

    var targetVx = moveDir * 4.5;
    player.vx += (targetVx - player.vx) * 0.25;
    player.x += player.vx;

    // wrap around screen edges
    if (player.x + PLAYER_W < 0) player.x = W;
    if (player.x > W) player.x = -PLAYER_W;

    player.vy += GRAVITY;
    player.y += player.vy;

    // platform collision (only when falling)
    if (player.vy > 0) {
      for (var i = 0; i < platforms.length; i++) {
        var p = platforms[i];
        if (player.x + PLAYER_W * 0.7 > p.x && player.x + PLAYER_W * 0.3 < p.x + p.w &&
            player.y + PLAYER_H > p.y && player.y + PLAYER_H < p.y + PLAT_H + player.vy) {
          player.vy = JUMP_V;
          break;
        }
      }
    }

    // camera scroll: keep player in upper half
    var threshold = H * 0.4;
    if (player.y < threshold) {
      var dy = threshold - player.y;
      player.y = threshold;
      platforms.forEach(function (p) { p.y += dy; });
      height += dy;
      score = Math.floor(height / 10);
      refreshHud();
      platforms = platforms.filter(function (p) { return p.y < H + 30; });
      maybeExtendPlatforms();
    }

    if (player.y > H) {
      endGame();
    }
  }

  function endGame() {
    over = true;
    window.ArcadeCommon.setBest(GAME_ID, score);
    resultBanner.innerHTML = '<span class="overlay-lose">' + window.ArcadeI18n.t("common.gameOver") + " — " + window.ArcadeI18n.t("common.score") + ": " + score + "</span>";
  }

  function draw() {
    ctx.fillStyle = "#171b2e";
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = "#3ddc84";
    platforms.forEach(function (p) {
      ctx.fillRect(p.x, p.y, p.w, PLAT_H);
    });

    ctx.font = (PLAYER_H) + "px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("🦘", player.x, player.y + PLAYER_H);
  }

  function loop() {
    update();
    draw();
    if (!over) loopId = requestAnimationFrame(loop);
  }

  function setDir(d) { moveDir = d; }

  document.addEventListener("keydown", function (e) {
    if (e.key === "ArrowLeft") { e.preventDefault(); moveDir = -1; }
    if (e.key === "ArrowRight") { e.preventDefault(); moveDir = 1; }
  });
  document.addEventListener("keyup", function (e) {
    if (e.key === "ArrowLeft" && moveDir === -1) moveDir = 0;
    if (e.key === "ArrowRight" && moveDir === 1) moveDir = 0;
  });

  canvas.addEventListener("mousemove", function (e) {
    var rect = canvas.getBoundingClientRect();
    var x = (e.clientX - rect.left) * (W / rect.width);
    moveDir = x < player.x + PLAYER_W / 2 ? -1 : 1;
  });

  canvas.addEventListener("touchmove", function (e) {
    e.preventDefault();
    var rect = canvas.getBoundingClientRect();
    var x = (e.touches[0].clientX - rect.left) * (W / rect.width);
    moveDir = x < player.x + PLAYER_W / 2 ? -1 : 1;
  }, { passive: false });

  var touchCtrl = document.getElementById("touch-controls");
  touchCtrl.addEventListener("touchstart", function (e) {
    var btn = e.target.closest("[data-dir]");
    if (btn) setDir(btn.getAttribute("data-dir") === "left" ? -1 : 1);
  });
  touchCtrl.addEventListener("touchend", function () { setDir(0); });
  touchCtrl.addEventListener("mousedown", function (e) {
    var btn = e.target.closest("[data-dir]");
    if (btn) setDir(btn.getAttribute("data-dir") === "left" ? -1 : 1);
  });
  touchCtrl.addEventListener("mouseup", function () { setDir(0); });
  touchCtrl.addEventListener("mouseleave", function () { setDir(0); });

  restartBtn.addEventListener("click", newGame);
  newGame();
})();
