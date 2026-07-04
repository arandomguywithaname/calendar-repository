(function () {
  var GAME_ID = "balance-ball";
  var canvas = document.getElementById("board");
  var ctx = canvas.getContext("2d");
  var scoreEl = document.getElementById("score");
  var bestEl = document.getElementById("best");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");
  var touchControls = document.getElementById("touch-controls");

  var W = canvas.width, H = canvas.height;
  var CENTER_X = W / 2, CENTER_Y = H / 2;
  var PLATFORM_R = W / 2 - 14;
  var BALL_R = 14;
  var ACCEL = 0.55;
  var FRICTION = 0.985;
  var TILT_MAX = 1;
  var TILT_KEY_RATE = 0.045;
  var TILT_DECAY = 0.06;

  var ballX, ballY, ballVX, ballVY, tiltX, tiltY, over, startTime, elapsed, rafId;
  var keys = { up: false, down: false, left: false, right: false };
  var mouseActive = false;

  function refreshHud() {
    scoreEl.textContent = elapsed;
    bestEl.textContent = window.ArcadeCommon.getBest(GAME_ID) || 0;
  }

  function newGame() {
    ballX = CENTER_X + window.ArcadeCommon.randInt(-30, 30);
    ballY = CENTER_Y + window.ArcadeCommon.randInt(-30, 30);
    ballVX = 0;
    ballVY = 0;
    tiltX = 0;
    tiltY = 0;
    over = false;
    elapsed = 0;
    startTime = Date.now();
    mouseActive = false;
    resultBanner.innerHTML = "";
    refreshHud();
    cancelAnimationFrame(rafId);
    loop();
  }

  function endGame() {
    over = true;
    var isBest = window.ArcadeCommon.setBest(GAME_ID, elapsed);
    resultBanner.innerHTML = '<span class="overlay-lose">' + window.ArcadeI18n.t("common.gameOver") +
      " — Survived " + elapsed + "s" + (isBest ? " — New Best!" : "") + "</span>";
  }

  function update() {
    if (over) return;

    if (!mouseActive) {
      if (keys.left) tiltX -= TILT_KEY_RATE;
      if (keys.right) tiltX += TILT_KEY_RATE;
      if (keys.up) tiltY -= TILT_KEY_RATE;
      if (keys.down) tiltY += TILT_KEY_RATE;
      if (!keys.left && !keys.right) tiltX *= (1 - TILT_DECAY);
      if (!keys.up && !keys.down) tiltY *= (1 - TILT_DECAY);
      tiltX = Math.max(-TILT_MAX, Math.min(TILT_MAX, tiltX));
      tiltY = Math.max(-TILT_MAX, Math.min(TILT_MAX, tiltY));
    }

    ballVX += tiltX * ACCEL;
    ballVY += tiltY * ACCEL;
    ballVX *= FRICTION;
    ballVY *= FRICTION;
    ballX += ballVX;
    ballY += ballVY;

    var dx = ballX - CENTER_X, dy = ballY - CENTER_Y;
    var dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > PLATFORM_R - BALL_R) {
      endGame();
      return;
    }

    elapsed = Math.floor((Date.now() - startTime) / 1000);
    refreshHud();
  }

  function draw() {
    ctx.fillStyle = "#171b2e";
    ctx.fillRect(0, 0, W, H);

    // platform with tilt shading
    var grad = ctx.createLinearGradient(
      CENTER_X - tiltX * 60, CENTER_Y - tiltY * 60,
      CENTER_X + tiltX * 60, CENTER_Y + tiltY * 60
    );
    grad.addColorStop(0, "#2b3252");
    grad.addColorStop(1, "#1c2138");
    ctx.beginPath();
    ctx.arc(CENTER_X, CENTER_Y, PLATFORM_R, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = "#ff5da2";
    ctx.lineWidth = 3;
    ctx.stroke();

    // grid rings for depth
    ctx.strokeStyle = "rgba(124,92,255,0.25)";
    ctx.lineWidth = 1;
    for (var r = PLATFORM_R / 3; r < PLATFORM_R; r += PLATFORM_R / 3) {
      ctx.beginPath();
      ctx.arc(CENTER_X, CENTER_Y, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    // ball
    ctx.beginPath();
    ctx.arc(ballX, ballY, BALL_R, 0, Math.PI * 2);
    var bgrad = ctx.createRadialGradient(ballX - 5, ballY - 5, 2, ballX, ballY, BALL_R);
    bgrad.addColorStop(0, "#ffffff");
    bgrad.addColorStop(1, "#29e0c9");
    ctx.fillStyle = bgrad;
    ctx.fill();
  }

  function loop() {
    update();
    draw();
    if (!over) rafId = requestAnimationFrame(loop);
    else draw();
  }

  document.addEventListener("keydown", function (e) {
    var map = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };
    if (map[e.key]) { e.preventDefault(); keys[map[e.key]] = true; mouseActive = false; }
  });
  document.addEventListener("keyup", function (e) {
    var map = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };
    if (map[e.key]) { e.preventDefault(); keys[map[e.key]] = false; }
  });

  canvas.addEventListener("mousemove", function (e) {
    mouseActive = true;
    var rect = canvas.getBoundingClientRect();
    var x = (e.clientX - rect.left) * (W / rect.width);
    var y = (e.clientY - rect.top) * (H / rect.height);
    tiltX = Math.max(-TILT_MAX, Math.min(TILT_MAX, (x - CENTER_X) / PLATFORM_R));
    tiltY = Math.max(-TILT_MAX, Math.min(TILT_MAX, (y - CENTER_Y) / PLATFORM_R));
  });
  canvas.addEventListener("mouseleave", function () { mouseActive = false; });

  touchControls.addEventListener("touchstart", function (e) {
    var btn = e.target.closest("[data-dir]");
    if (!btn) return;
    e.preventDefault();
    mouseActive = false;
    keys[btn.getAttribute("data-dir")] = true;
  });
  touchControls.addEventListener("touchend", function (e) {
    var btn = e.target.closest("[data-dir]");
    if (!btn) return;
    keys[btn.getAttribute("data-dir")] = false;
  });
  touchControls.addEventListener("mousedown", function (e) {
    var btn = e.target.closest("[data-dir]");
    if (!btn) return;
    mouseActive = false;
    keys[btn.getAttribute("data-dir")] = true;
  });
  touchControls.addEventListener("mouseup", function (e) {
    var btn = e.target.closest("[data-dir]");
    if (!btn) return;
    keys[btn.getAttribute("data-dir")] = false;
  });
  touchControls.addEventListener("mouseleave", function () {
    keys.up = keys.down = keys.left = keys.right = false;
  });

  restartBtn.addEventListener("click", newGame);
  newGame();
})();
