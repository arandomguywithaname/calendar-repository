(function () {
  var GAME_ID = "archery-target";
  var canvas = document.getElementById("board");
  var ctx = canvas.getContext("2d");
  var scoreEl = document.getElementById("score");
  var bestEl = document.getElementById("best");
  var arrowNumEl = document.getElementById("arrow-num");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");

  var W = canvas.width, H = canvas.height;
  var CX = W / 2, CY = H / 2;
  var RING_STEP = 18;
  var RINGS = [
    { score: 10, r: 16, color: "#ffd24d" },
    { score: 9, r: 16 + RING_STEP, color: "#ffb84d" },
    { score: 8, r: 16 + RING_STEP * 2, color: "#ff5da2" },
    { score: 7, r: 16 + RING_STEP * 3, color: "#ff5d5d" },
    { score: 6, r: 16 + RING_STEP * 4, color: "#7c5cff" },
    { score: 5, r: 16 + RING_STEP * 5, color: "#4d8dff" },
    { score: 4, r: 16 + RING_STEP * 6, color: "#29e0c9" },
    { score: 3, r: 16 + RING_STEP * 7, color: "#3ddc84" },
    { score: 2, r: 16 + RING_STEP * 8, color: "#eef0fb" },
    { score: 1, r: 16 + RING_STEP * 9, color: "#a6acc9" }
  ];
  var MAX_R = RINGS[RINGS.length - 1].r;
  var TOTAL_ARROWS = 6;

  var mouseX = CX, mouseY = CY;
  var wobble = { phaseX: 0, phaseY: 0, freqX: 1, freqY: 1, amp: 16 };
  var arrowsShot, totalScore, shots, over;

  function refreshHud() {
    scoreEl.textContent = totalScore;
    bestEl.textContent = window.ArcadeCommon.getBest(GAME_ID) || 0;
    arrowNumEl.textContent = arrowsShot;
  }

  function newRoundWobble() {
    wobble.phaseX = Math.random() * Math.PI * 2;
    wobble.phaseY = Math.random() * Math.PI * 2;
    wobble.freqX = 1.2 + Math.random() * 1.3;
    wobble.freqY = 1.2 + Math.random() * 1.3;
  }

  function newGame() {
    arrowsShot = 0;
    totalScore = 0;
    shots = [];
    over = false;
    resultBanner.innerHTML = "";
    newRoundWobble();
    refreshHud();
  }

  function scoreForDistance(dist) {
    for (var i = 0; i < RINGS.length; i++) {
      if (dist <= RINGS[i].r) return RINGS[i].score;
    }
    return 0;
  }

  function currentOffset(t) {
    return {
      x: Math.sin(t * wobble.freqX + wobble.phaseX) * wobble.amp,
      y: Math.cos(t * wobble.freqY + wobble.phaseY) * wobble.amp
    };
  }

  function draw() {
    ctx.fillStyle = "#20263f";
    ctx.fillRect(0, 0, W, H);

    for (var i = RINGS.length - 1; i >= 0; i--) {
      ctx.beginPath();
      ctx.arc(CX, CY, RINGS[i].r, 0, Math.PI * 2);
      ctx.fillStyle = RINGS[i].color;
      ctx.fill();
      ctx.strokeStyle = "#171b2e";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    ctx.fillStyle = "#171b2e";
    ctx.font = "bold 11px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("10", CX, CY + 4);

    shots.forEach(function (s) {
      ctx.beginPath();
      ctx.arc(s.x, s.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = "#05131c";
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });

    if (!over) {
      var t = performance.now() / 1000;
      var off = currentOffset(t);
      var rx = mouseX + off.x, ry = mouseY + off.y;
      ctx.beginPath();
      ctx.moveTo(rx - 12, ry);
      ctx.lineTo(rx + 12, ry);
      ctx.moveTo(rx, ry - 12);
      ctx.lineTo(rx, ry + 12);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(rx, ry, 8, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,255,255,0.7)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  function loop() {
    draw();
    requestAnimationFrame(loop);
  }

  function toCanvasPos(e) {
    var rect = canvas.getBoundingClientRect();
    return { x: (e.clientX - rect.left) * (W / rect.width), y: (e.clientY - rect.top) * (H / rect.height) };
  }

  canvas.addEventListener("mousemove", function (e) {
    var pos = toCanvasPos(e);
    mouseX = pos.x;
    mouseY = pos.y;
  });

  canvas.addEventListener("click", function () {
    if (over || arrowsShot >= TOTAL_ARROWS) return;
    var t = performance.now() / 1000;
    var off = currentOffset(t);
    var fx = mouseX + off.x, fy = mouseY + off.y;
    var dist = Math.sqrt((fx - CX) * (fx - CX) + (fy - CY) * (fy - CY));
    var pts = scoreForDistance(dist);
    shots.push({ x: fx, y: fy, score: pts });
    arrowsShot++;
    totalScore += pts;
    window.ArcadeCommon.toast(pts > 0 ? "+" + pts : "Miss!");
    refreshHud();
    newRoundWobble();

    if (arrowsShot >= TOTAL_ARROWS) {
      over = true;
      var improved = window.ArcadeCommon.setBest(GAME_ID, totalScore);
      resultBanner.innerHTML = '<span class="overlay-win">' + window.ArcadeI18n.t("common.gameOver") +
        " — " + window.ArcadeI18n.t("common.score") + ": " + totalScore + "/60" + (improved ? " 🏆" : "") + "</span>";
      refreshHud();
    }
  });

  restartBtn.addEventListener("click", newGame);
  newGame();
  loop();
})();
