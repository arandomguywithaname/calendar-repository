(function () {
  var GAME_ID = "fruit-catcher";
  var canvas = document.getElementById("board");
  var ctx = canvas.getContext("2d");
  var scoreEl = document.getElementById("score");
  var livesEl = document.getElementById("lives");
  var bestEl = document.getElementById("best");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");

  var W = canvas.width, H = canvas.height;
  var BASKET_W = 64, BASKET_H = 24;
  var FRUITS = ["🍎", "🍋", "🍇", "🍉", "🍓", "🍒", "🥝", "🍑"];
  var BOMB = "💣";

  var basket, items, score, lives, over, startTime, spawnTimer, loopId, lastFrame;

  function refreshHud() {
    scoreEl.textContent = score;
    livesEl.textContent = lives;
    bestEl.textContent = window.ArcadeCommon.getBest(GAME_ID) || 0;
  }

  function newGame() {
    basket = { x: W / 2 - BASKET_W / 2 };
    items = [];
    score = 0;
    lives = 3;
    over = false;
    startTime = performance.now();
    spawnTimer = 0;
    resultBanner.innerHTML = "";
    refreshHud();
    cancelAnimationFrame(loopId);
    lastFrame = performance.now();
    loop();
  }

  function spawnItem(elapsedSec) {
    var isBomb = Math.random() < 0.16;
    var speed = 2 + Math.min(4.5, elapsedSec * 0.09) + Math.random() * 1.5;
    items.push({
      x: window.ArcadeCommon.randInt(20, W - 20),
      y: -20,
      speed: speed,
      icon: isBomb ? BOMB : window.ArcadeCommon.pick(FRUITS),
      bomb: isBomb
    });
  }

  function update(dt) {
    if (over) return;
    var elapsedSec = (performance.now() - startTime) / 1000;

    spawnTimer += dt;
    var interval = Math.max(360, 1000 - elapsedSec * 15);
    if (spawnTimer > interval) {
      spawnTimer = 0;
      spawnItem(elapsedSec);
    }

    items.forEach(function (it) { it.y += it.speed; });

    var basketY = H - 40;
    items = items.filter(function (it) {
      if (it.y > basketY - 10 && it.y < basketY + BASKET_H &&
          it.x > basket.x && it.x < basket.x + BASKET_W) {
        if (it.bomb) {
          loseLife();
        } else {
          score += 10;
          refreshHud();
        }
        return false;
      }
      if (it.y > H + 20) {
        if (!it.bomb) loseLife();
        return false;
      }
      return true;
    });
  }

  function loseLife() {
    lives--;
    refreshHud();
    if (lives <= 0) endGame();
  }

  function endGame() {
    over = true;
    window.ArcadeCommon.setBest(GAME_ID, score);
    resultBanner.innerHTML = '<span class="overlay-lose">' + window.ArcadeI18n.t("common.gameOver") + " — " + window.ArcadeI18n.t("common.score") + ": " + score + "</span>";
  }

  function draw() {
    ctx.fillStyle = "#171b2e";
    ctx.fillRect(0, 0, W, H);

    ctx.font = "26px sans-serif";
    ctx.textAlign = "center";
    items.forEach(function (it) { ctx.fillText(it.icon, it.x, it.y); });

    ctx.font = "32px sans-serif";
    ctx.fillText("🧺", basket.x + BASKET_W / 2, H - 40 + BASKET_H);
  }

  function loop(now) {
    now = now || performance.now();
    var dt = Math.min(50, now - lastFrame);
    lastFrame = now;
    update(dt);
    draw();
    if (!over) loopId = requestAnimationFrame(loop);
  }

  function setBasketX(x) {
    basket.x = Math.max(0, Math.min(W - BASKET_W, x - BASKET_W / 2));
  }

  canvas.addEventListener("mousemove", function (e) {
    var rect = canvas.getBoundingClientRect();
    setBasketX((e.clientX - rect.left) * (W / rect.width));
  });

  canvas.addEventListener("touchmove", function (e) {
    e.preventDefault();
    var rect = canvas.getBoundingClientRect();
    setBasketX((e.touches[0].clientX - rect.left) * (W / rect.width));
  }, { passive: false });

  var keys = {};
  document.addEventListener("keydown", function (e) {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") e.preventDefault();
    keys[e.key] = true;
  });
  document.addEventListener("keyup", function (e) { keys[e.key] = false; });

  setInterval(function () {
    if (over) return;
    if (keys.ArrowLeft) basket.x = Math.max(0, basket.x - 7);
    if (keys.ArrowRight) basket.x = Math.min(W - BASKET_W, basket.x + 7);
  }, 16);

  document.getElementById("touch-controls").addEventListener("click", function (e) {
    var btn = e.target.closest("[data-dir]");
    if (!btn || over) return;
    var d = btn.getAttribute("data-dir");
    basket.x = Math.max(0, Math.min(W - BASKET_W, basket.x + (d === "left" ? -40 : 40)));
  });

  restartBtn.addEventListener("click", newGame);
  newGame();
})();
