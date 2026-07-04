(function () {
  var GAME_ID = "platform-jump";
  var canvas = document.getElementById("board");
  var ctx = canvas.getContext("2d");
  var timeEl = document.getElementById("time");
  var bestEl = document.getElementById("best");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");

  var W = canvas.width, H = canvas.height;
  var GRAVITY = 0.6;
  var JUMP_V = -12.5;
  var MOVE_SPEED = 3.6;
  var PLAYER_W = 26, PLAYER_H = 32;

  // Static level: ground segments (with a pit gap), floating platforms, and a flag goal.
  var groundY = H - 40;
  var solids = [
    { x: 0, y: groundY, w: 200, h: 40 },          // left ground
    { x: 340, y: groundY, w: 260, h: 40 },        // right ground
    { x: 220, y: groundY - 80, w: 90, h: 16 },    // platform bridging the pit
    { x: 420, y: groundY - 140, w: 100, h: 16 }   // elevated platform
  ];
  var flag = { x: 550, y: groundY - 40, w: 20, h: 40 };
  var startPos = { x: 30, y: groundY - PLAYER_H };

  var player, seconds, over, won, loopId, lastFrame, timerId;
  var moveDir = 0;

  function refreshHud() {
    timeEl.textContent = seconds;
    var best = window.ArcadeCommon.getBest(GAME_ID);
    bestEl.textContent = best === null ? "-" : best;
  }

  function resetPlayer() {
    player = { x: startPos.x, y: startPos.y, vx: 0, vy: 0, onGround: false };
  }

  function newGame() {
    resetPlayer();
    seconds = 0;
    over = false;
    won = false;
    resultBanner.innerHTML = "";
    refreshHud();
    clearInterval(timerId);
    timerId = setInterval(function () {
      if (over) return;
      seconds++;
      refreshHud();
    }, 1000);
    cancelAnimationFrame(loopId);
    lastFrame = performance.now();
    loop();
  }

  function update() {
    if (over) return;

    player.vx = moveDir * MOVE_SPEED;
    player.x += player.vx;
    player.x = Math.max(0, Math.min(W - PLAYER_W, player.x));

    player.vy += GRAVITY;
    player.y += player.vy;
    player.onGround = false;

    solids.forEach(function (s) {
      if (player.x + PLAYER_W > s.x && player.x < s.x + s.w) {
        // landing on top
        if (player.vy >= 0 && player.y + PLAYER_H - player.vy <= s.y + 1 && player.y + PLAYER_H >= s.y) {
          player.y = s.y - PLAYER_H;
          player.vy = 0;
          player.onGround = true;
        }
      }
    });

    // fell into pit / off screen
    if (player.y > H) {
      window.ArcadeCommon.toast("Fell! Restarting...");
      resetPlayer();
    }

    // reached flag
    if (player.x + PLAYER_W > flag.x && player.x < flag.x + flag.w &&
        player.y + PLAYER_H > flag.y && player.y < flag.y + flag.h) {
      winGame();
    }
  }

  function winGame() {
    over = true;
    won = true;
    clearInterval(timerId);
    var improved = window.ArcadeCommon.setBestLowerIsBetter(GAME_ID, seconds);
    resultBanner.innerHTML = '<span class="overlay-win">' + window.ArcadeI18n.t("common.youWin") + " — " + seconds + "s" + (improved ? " 🏆" : "") + "</span>";
    refreshHud();
  }

  function draw() {
    ctx.fillStyle = "#171b2e";
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = "#3a4166";
    solids.forEach(function (s) { ctx.fillRect(s.x, s.y, s.w, s.h); });

    ctx.font = "34px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("🚩", flag.x + flag.w / 2, flag.y + flag.h);

    ctx.font = (PLAYER_H) + "px sans-serif";
    ctx.fillText("🏃", player.x + PLAYER_W / 2, player.y + PLAYER_H);
  }

  function loop(now) {
    now = now || performance.now();
    update();
    draw();
    if (!over) loopId = requestAnimationFrame(loop);
  }

  function jump() {
    if (over) return;
    if (player.onGround) player.vy = JUMP_V;
  }

  document.addEventListener("keydown", function (e) {
    if (e.key === "ArrowLeft") { e.preventDefault(); moveDir = -1; }
    if (e.key === "ArrowRight") { e.preventDefault(); moveDir = 1; }
    if (e.key === " " || e.key === "ArrowUp") { e.preventDefault(); jump(); }
  });
  document.addEventListener("keyup", function (e) {
    if (e.key === "ArrowLeft" && moveDir === -1) moveDir = 0;
    if (e.key === "ArrowRight" && moveDir === 1) moveDir = 0;
  });

  var touchCtrl = document.getElementById("touch-controls");
  touchCtrl.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-dir]");
    if (!btn) return;
    var d = btn.getAttribute("data-dir");
    if (d === "jump") jump();
  });
  touchCtrl.addEventListener("touchstart", function (e) {
    var btn = e.target.closest("[data-dir]");
    if (!btn) return;
    var d = btn.getAttribute("data-dir");
    if (d === "left") moveDir = -1;
    else if (d === "right") moveDir = 1;
    else if (d === "jump") jump();
  });
  touchCtrl.addEventListener("touchend", function () { moveDir = 0; });
  touchCtrl.addEventListener("mousedown", function (e) {
    var btn = e.target.closest("[data-dir]");
    if (!btn) return;
    var d = btn.getAttribute("data-dir");
    if (d === "left") moveDir = -1;
    else if (d === "right") moveDir = 1;
  });
  touchCtrl.addEventListener("mouseup", function () { moveDir = 0; });
  touchCtrl.addEventListener("mouseleave", function () { moveDir = 0; });

  restartBtn.addEventListener("click", newGame);
  newGame();
})();
