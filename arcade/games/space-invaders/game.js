(function () {
  var GAME_ID = "space-invaders";
  var canvas = document.getElementById("board");
  var ctx = canvas.getContext("2d");
  var scoreEl = document.getElementById("score");
  var livesEl = document.getElementById("lives");
  var bestEl = document.getElementById("best");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");
  var diffEl = document.getElementById("difficulty");

  var W = canvas.width, H = canvas.height;
  var ROWS = 4, COLS = 8;
  var ENEMY_W = 32, ENEMY_H = 22, ENEMY_GAP_X = 14, ENEMY_GAP_Y = 16;
  var PLAYER_W = 36, PLAYER_H = 20;
  var ROW_COLORS = ["#ff5da2", "#7c5cff", "#29e0c9", "#3ddc84"];

  // Per-difficulty tuning: enemy step speed, how often they shoot, descend amount,
  // and enemy bullet speed.
  var DIFFICULTIES = {
    easy: { moveBase: 760, shootChance: 0.16, stepDown: 12, bulletSpeed: 3.2 },
    medium: { moveBase: 540, shootChance: 0.42, stepDown: 16, bulletSpeed: 4.5 },
    hard: { moveBase: 320, shootChance: 0.75, stepDown: 22, bulletSpeed: 6.2 }
  };
  var cfg = DIFFICULTIES.medium;

  var player, bullets, enemyBullets, enemies, enemyDir, particles, frame;
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
          alive: true,
          color: ROW_COLORS[r % ROW_COLORS.length]
        });
      }
    }
    enemyDir = 1;
  }

  function newGame() {
    player = { x: W / 2 - PLAYER_W / 2 };
    bullets = [];
    enemyBullets = [];
    particles = [];
    frame = 0;
    score = 0;
    lives = 3;
    over = false;
    won = false;
    moveAccum = 0;
    resultBanner.innerHTML = "";
    buildEnemies();
    refreshHud();
    lastFrame = performance.now();
    cancelAnimationFrame(loopId);
    loop();
  }

  var moveAccum = 0;

  function spawnParticles(x, y, color, count) {
    for (var i = 0; i < (count || 16); i++) {
      var ang = Math.random() * Math.PI * 2;
      var spd = 1 + Math.random() * 3.5;
      particles.push({
        x: x, y: y,
        vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
        life: 1, color: color
      });
    }
  }

  function update(dt) {
    if (over) return;
    frame++;

    bullets.forEach(function (b) { b.py = b.y; b.y -= 9; });
    bullets = bullets.filter(function (b) { return b.y > -10; });

    enemyBullets.forEach(function (b) { b.py = b.y; b.y += cfg.bulletSpeed; });
    enemyBullets = enemyBullets.filter(function (b) { return b.y < H + 10; });

    var aliveEnemies = enemies.filter(function (e) { return e.alive; });
    var speedFactor = Math.max(0.3, aliveEnemies.length / (ROWS * COLS));
    moveAccum += dt;
    var interval = 150 + cfg.moveBase * speedFactor;
    if (moveAccum > interval) {
      moveAccum = 0;
      var hitEdge = false;
      aliveEnemies.forEach(function (e) {
        if (e.x + ENEMY_W + enemyDir * 16 > W || e.x + enemyDir * 16 < 0) hitEdge = true;
      });
      if (hitEdge) {
        enemyDir *= -1;
        enemies.forEach(function (e) { if (e.alive) e.y += cfg.stepDown; });
      } else {
        enemies.forEach(function (e) { if (e.alive) e.x += enemyDir * 16; });
      }
      if (aliveEnemies.length && Math.random() < cfg.shootChance) {
        var shooter = aliveEnemies[Math.floor(Math.random() * aliveEnemies.length)];
        enemyBullets.push({ x: shooter.x + ENEMY_W / 2, y: shooter.y + ENEMY_H, py: shooter.y + ENEMY_H });
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
          spawnParticles(e.x + ENEMY_W / 2, e.y + ENEMY_H / 2, e.color, 18);
          refreshHud();
        }
      });
    });
    bullets = bullets.filter(function (b) { return b.y > -50; });

    // enemy bullet vs player
    enemyBullets.forEach(function (b) {
      if (b.y > H - 40 && b.y < H - 40 + PLAYER_H && b.x > player.x && b.x < player.x + PLAYER_W) {
        b.y = H + 100;
        spawnParticles(player.x + PLAYER_W / 2, H - 40, "#ffd23f", 20);
        loseLife();
      }
    });
    enemyBullets = enemyBullets.filter(function (b) { return b.y < H + 50; });

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

  function drawInvader(e, wobble) {
    var x = e.x, y = e.y, w = ENEMY_W, h = ENEMY_H;
    ctx.save();
    ctx.shadowColor = e.color;
    ctx.shadowBlur = 14;
    ctx.fillStyle = e.color;
    // Body
    var by = y + 4;
    ctx.beginPath();
    ctx.moveTo(x + 4, by + h - 6);
    ctx.lineTo(x + 4, by + 4);
    ctx.quadraticCurveTo(x + w / 2, by - 6, x + w - 4, by + 4);
    ctx.lineTo(x + w - 4, by + h - 6);
    ctx.closePath();
    ctx.fill();
    // Legs (wobble to fake animation)
    ctx.fillRect(x + 4, by + h - 6, 6, 5 + wobble);
    ctx.fillRect(x + w - 10, by + h - 6, 6, 5 - wobble);
    ctx.fillRect(x + w / 2 - 3, by + h - 6, 6, 4);
    // Eyes
    ctx.restore();
    ctx.fillStyle = "#05070f";
    ctx.beginPath();
    ctx.arc(x + w / 2 - 6, y + 10, 2.4, 0, Math.PI * 2);
    ctx.arc(x + w / 2 + 6, y + 10, 2.4, 0, Math.PI * 2);
    ctx.fill();
  }

  function draw() {
    ctx.fillStyle = "#05070f";
    ctx.fillRect(0, 0, W, H);
    var bg = ctx.createRadialGradient(W / 2, 60, 20, W / 2, 60, H);
    bg.addColorStop(0, "rgba(124,92,255,0.10)");
    bg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    var wobble = Math.floor(frame / 20) % 2 === 0 ? 0 : 2;
    enemies.forEach(function (e) { if (e.alive) drawInvader(e, wobble); });

    // Player bullets: glowing cyan with trail.
    bullets.forEach(function (b) {
      ctx.save();
      ctx.shadowColor = "#29e0c9";
      ctx.shadowBlur = 12;
      var g = ctx.createLinearGradient(b.x, b.y - 12, b.x, b.y);
      g.addColorStop(0, "rgba(41,224,201,0)");
      g.addColorStop(1, "#bff6ff");
      ctx.strokeStyle = g;
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(b.x, b.y - 12);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.restore();
    });

    // Enemy bullets: glowing pink with trail.
    enemyBullets.forEach(function (b) {
      ctx.save();
      ctx.shadowColor = "#ff5da2";
      ctx.shadowBlur = 12;
      var g = ctx.createLinearGradient(b.x, b.y + 12, b.x, b.y);
      g.addColorStop(0, "rgba(255,93,162,0)");
      g.addColorStop(1, "#ffb0d3");
      ctx.strokeStyle = g;
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(b.x, b.y + 12);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.restore();
    });

    // Player ship: glowing gradient triangle.
    var px = player.x, py = H - 40;
    ctx.save();
    ctx.shadowColor = "#ffd23f";
    ctx.shadowBlur = 18;
    var pg = ctx.createLinearGradient(px, py, px, py + PLAYER_H);
    pg.addColorStop(0, "#fff4c2");
    pg.addColorStop(1, "#ffb300");
    ctx.fillStyle = pg;
    ctx.beginPath();
    ctx.moveTo(px + PLAYER_W / 2, py);
    ctx.lineTo(px + PLAYER_W, py + PLAYER_H);
    ctx.lineTo(px + PLAYER_W * 0.68, py + PLAYER_H);
    ctx.lineTo(px + PLAYER_W / 2, py + PLAYER_H - 6);
    ctx.lineTo(px + PLAYER_W * 0.32, py + PLAYER_H);
    ctx.lineTo(px, py + PLAYER_H);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Particles.
    particles = particles.filter(function (p) { return p.life > 0; });
    particles.forEach(function (p) {
      p.x += p.vx; p.y += p.vy; p.vx *= 0.94; p.vy *= 0.94; p.life -= 0.04;
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3 * p.life + 0.5, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  function loop(now) {
    now = now || performance.now();
    var dt = Math.min(50, now - lastFrame);
    lastFrame = now;
    update(dt);
    draw();
    if (!over) loopId = requestAnimationFrame(loop);
    else finish();
  }

  function finish() {
    if (!particles.length) return;
    draw();
    requestAnimationFrame(finish);
  }

  function fire() {
    if (over) return;
    if (bullets.length < 3) bullets.push({ x: player.x + PLAYER_W / 2, y: H - 40, py: H - 40 });
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

  window.ArcadeCommon.mountDifficulty(diffEl, GAME_ID, {
    defaultKey: "medium",
    onChange: function (level) {
      cfg = DIFFICULTIES[level] || DIFFICULTIES.medium;
      newGame();
    }
  });
})();
