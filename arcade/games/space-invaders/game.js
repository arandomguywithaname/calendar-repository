(function () {
  var GAME_ID = "space-invaders";
  var canvas = document.getElementById("board");
  var ctx = canvas.getContext("2d");
  var scoreEl = document.getElementById("score");
  var livesEl = document.getElementById("lives");
  var bestEl = document.getElementById("best");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");

  var W = canvas.width, H = canvas.height;
  var ROWS = 4, COLS = 8;
  var ENEMY_W = 32, ENEMY_H = 22, ENEMY_GAP_X = 14, ENEMY_GAP_Y = 16;
  var PLAYER_W = 34, PLAYER_H = 18;

  var player, bullets, enemyBullets, enemies, enemyDir, enemyStepTimer;
  var score, lives, over, won, loopId, lastFrame;

  function refreshHud() {
    scoreEl.textContent = score;
    livesEl.textContent = lives;
    bestEl.textContent = window.ArcadeCommon.getBest(GAME_ID) || 0;
  }

  function buildEnemies() {
    enemies = [];
    var offsetX = (W - (COLS * (ENEMY_W + ENEMY_GAP_X) - ENEMY_GAP_X)) / 2;
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        enemies.push({
          x: offsetX + c * (ENEMY_W + ENEMY_GAP_X),
          y: 40 + r * (ENEMY_H + ENEMY_GAP_Y),
          alive: true
        });
      }
    }
    enemyDir = 1;
  }

  function newGame() {
    player = { x: W / 2 - PLAYER_W / 2 };
    bullets = [];
    enemyBullets = [];
    score = 0;
    lives = 3;
    over = false;
    won = false;
    resultBanner.innerHTML = "";
    buildEnemies();
    refreshHud();
    lastFrame = performance.now();
    cancelAnimationFrame(loopId);
    loop();
  }

  var moveAccum = 0;
  var moveInterval = 550;

  function update(dt) {
    if (over) return;

    bullets.forEach(function (b) { b.y -= 8; });
    bullets = bullets.filter(function (b) { return b.y > -10; });

    enemyBullets.forEach(function (b) { b.y += 4.5; });
    enemyBullets = enemyBullets.filter(function (b) { return b.y < H + 10; });

    var aliveEnemies = enemies.filter(function (e) { return e.alive; });
    var speedFactor = Math.max(0.35, aliveEnemies.length / (ROWS * COLS));
    moveAccum += dt;
    var interval = 200 + moveInterval * speedFactor;
    if (moveAccum > interval) {
      moveAccum = 0;
      var hitEdge = false;
      aliveEnemies.forEach(function (e) {
        if (e.x + ENEMY_W + enemyDir * 16 > W || e.x + enemyDir * 16 < 0) hitEdge = true;
      });
      if (hitEdge) {
        enemyDir *= -1;
        enemies.forEach(function (e) { if (e.alive) e.y += 16; });
      } else {
        enemies.forEach(function (e) { if (e.alive) e.x += enemyDir * 16; });
      }
      // occasional enemy shot
      if (aliveEnemies.length && Math.random() < 0.5) {
        var shooter = aliveEnemies[Math.floor(Math.random() * aliveEnemies.length)];
        enemyBullets.push({ x: shooter.x + ENEMY_W / 2, y: shooter.y + ENEMY_H });
      }
    }

    // bullet vs enemy
    bullets.forEach(function (b) {
      enemies.forEach(function (e) {
        if (!e.alive) return;
        if (b.x > e.x && b.x < e.x + ENEMY_W && b.y > e.y && b.y < e.y + ENEMY_H) {
          e.alive = false;
          b.y = -100;
          score += 10;
          refreshHud();
        }
      });
    });
    bullets = bullets.filter(function (b) { return b.y > -50; });

    // enemy bullet vs player
    enemyBullets.forEach(function (b) {
      if (b.y > H - 40 && b.y < H - 40 + PLAYER_H && b.x > player.x && b.x < player.x + PLAYER_W) {
        b.y = H + 100;
        loseLife();
      }
    });
    enemyBullets = enemyBullets.filter(function (b) { return b.y < H + 50; });

    // enemies reach bottom
    for (var i = 0; i < enemies.length; i++) {
      if (enemies[i].alive && enemies[i].y + ENEMY_H > H - 50) {
        loseGame();
        return;
      }
    }

    if (enemies.every(function (e) { return !e.alive; })) {
      winGame();
    }
  }

  function loseLife() {
    lives--;
    refreshHud();
    if (lives <= 0) loseGame();
  }

  function winGame() {
    over = true;
    won = true;
    window.ArcadeCommon.setBest(GAME_ID, score);
    resultBanner.innerHTML = '<span class="overlay-win">' + window.ArcadeI18n.t("common.youWin") + "</span>";
  }

  function loseGame() {
    over = true;
    window.ArcadeCommon.setBest(GAME_ID, score);
    resultBanner.innerHTML = '<span class="overlay-lose">' + window.ArcadeI18n.t("common.gameOver") + "</span>";
  }

  function draw() {
    ctx.fillStyle = "#0f1220";
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = "#3ddc84";
    enemies.forEach(function (e) {
      if (!e.alive) return;
      ctx.font = "22px sans-serif";
      ctx.fillText("👾", e.x, e.y + ENEMY_H);
    });

    ctx.fillStyle = "#ffb84d";
    bullets.forEach(function (b) { ctx.fillRect(b.x - 2, b.y - 8, 4, 10); });

    ctx.fillStyle = "#ff5da2";
    enemyBullets.forEach(function (b) { ctx.fillRect(b.x - 2, b.y - 8, 4, 10); });

    ctx.font = "24px sans-serif";
    ctx.fillText("🚀", player.x, H - 40 + PLAYER_H);
  }

  function loop(now) {
    var dt = Math.min(50, now - lastFrame);
    lastFrame = now;
    update(dt);
    draw();
    if (!over) loopId = requestAnimationFrame(loop);
  }

  function fire() {
    if (over) return;
    if (bullets.length < 3) bullets.push({ x: player.x + PLAYER_W / 2, y: H - 40 });
  }

  var keys = {};
  document.addEventListener("keydown", function (e) {
    if (["ArrowLeft", "ArrowRight", " "].indexOf(e.key) !== -1) e.preventDefault();
    if (e.key === " " && !keys[" "]) fire();
    keys[e.key] = true;
  });
  document.addEventListener("keyup", function (e) { keys[e.key] = false; });

  setInterval(function () {
    if (over) return;
    if (keys.ArrowLeft) player.x = Math.max(0, player.x - 6);
    if (keys.ArrowRight) player.x = Math.min(W - PLAYER_W, player.x + 6);
  }, 16);

  document.getElementById("touch-controls").addEventListener("click", function (e) {
    var btn = e.target.closest("[data-dir]");
    if (!btn || over) return;
    var d = btn.getAttribute("data-dir");
    if (d === "left") player.x = Math.max(0, player.x - 30);
    else if (d === "right") player.x = Math.min(W - PLAYER_W, player.x + 30);
    else if (d === "fire") fire();
  });

  restartBtn.addEventListener("click", newGame);
  newGame();
})();
