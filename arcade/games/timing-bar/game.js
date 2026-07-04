(function () {
  var GAME_ID = "timing-bar";
  var canvas = document.getElementById("board");
  var ctx = canvas.getContext("2d");
  var scoreEl = document.getElementById("score");
  var bestEl = document.getElementById("best");
  var roundEl = document.getElementById("round");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");
  var stopBtn = document.getElementById("stop");

  var W = canvas.width, H = canvas.height;
  var TOTAL_ROUNDS = 5;
  var BAR_MARGIN = 30;
  var BAR_Y = H / 2;
  var BAR_W = W - BAR_MARGIN * 2;
  var SPEED = 4.2; // px per frame, ramps up slightly each round

  var markerX, dir, speed, zone, round, score, roundOver, over, waitingNext, rafId;

  function refreshHud() {
    scoreEl.textContent = score;
    bestEl.textContent = window.ArcadeCommon.getBest(GAME_ID) || 0;
    roundEl.textContent = Math.min(round, TOTAL_ROUNDS);
  }

  function newZone() {
    var zoneW = window.ArcadeCommon.randInt(30, 55);
    var zoneX = window.ArcadeCommon.randInt(0, BAR_W - zoneW);
    return { x: zoneX, w: zoneW };
  }

  function newRound() {
    zone = newZone();
    markerX = 0;
    dir = 1;
    speed = SPEED + (round - 1) * 0.6;
    roundOver = false;
    waitingNext = false;
  }

  function newGame() {
    round = 1;
    score = 0;
    over = false;
    resultBanner.innerHTML = "";
    newRound();
    refreshHud();
    cancelAnimationFrame(rafId);
    loop();
  }

  function centerOf(z) { return z.x + z.w / 2; }

  function doStop() {
    if (over || roundOver || waitingNext) return;
    roundOver = true;
    var markerCenter = markerX;
    var zoneCenter = centerOf(zone);
    var dist = Math.abs(markerCenter - zoneCenter);
    var maxDist = BAR_W / 2;
    var accuracy = Math.max(0, 1 - dist / (zone.w * 1.5 + 40));
    var pts = Math.round(accuracy * 100);
    score += pts;
    refreshHud();
    window.ArcadeCommon.toast("+" + pts + (pts >= 90 ? " Perfect!" : ""));
    waitingNext = true;
    setTimeout(function () {
      round++;
      if (round > TOTAL_ROUNDS) {
        endGame();
      } else {
        newRound();
        refreshHud();
      }
    }, 700);
  }

  function endGame() {
    over = true;
    var isBest = window.ArcadeCommon.setBest(GAME_ID, score);
    resultBanner.innerHTML = '<span class="overlay-win">' + window.ArcadeI18n.t("common.gameOver") +
      " — Total: " + score + (isBest ? " — New Best!" : "") + "</span>";
  }

  function update() {
    if (over || roundOver) return;
    markerX += dir * speed;
    if (markerX >= BAR_W) { markerX = BAR_W; dir = -1; }
    if (markerX <= 0) { markerX = 0; dir = 1; }
  }

  function draw() {
    ctx.fillStyle = "#171b2e";
    ctx.fillRect(0, 0, W, H);

    // bar track
    ctx.fillStyle = "#242a45";
    ctx.fillRect(BAR_MARGIN, BAR_Y - 14, BAR_W, 28);
    ctx.strokeStyle = "#323a5c";
    ctx.strokeRect(BAR_MARGIN, BAR_Y - 14, BAR_W, 28);

    // target zone
    ctx.fillStyle = "#3ddc84";
    ctx.fillRect(BAR_MARGIN + zone.x, BAR_Y - 14, zone.w, 28);

    // marker
    ctx.fillStyle = "#ff5da2";
    ctx.fillRect(BAR_MARGIN + markerX - 3, BAR_Y - 24, 6, 48);
  }

  function loop() {
    if (over) { draw(); return; }
    update();
    draw();
    rafId = requestAnimationFrame(loop);
  }

  document.addEventListener("keydown", function (e) {
    if (e.code === "Space") { e.preventDefault(); doStop(); }
  });
  stopBtn.addEventListener("click", doStop);
  canvas.addEventListener("click", doStop);
  restartBtn.addEventListener("click", newGame);

  newGame();
})();
