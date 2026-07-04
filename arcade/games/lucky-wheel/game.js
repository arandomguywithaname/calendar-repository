(function () {
  var GAME_ID = "lucky-wheel";
  var TOTAL_KEY = "arcade.luckywheel.total";
  var canvas = document.getElementById("board");
  var ctx = canvas.getContext("2d");
  var scoreEl = document.getElementById("score");
  var bestEl = document.getElementById("best");
  var resultBanner = document.getElementById("result-banner");
  var spinBtn = document.getElementById("spin");
  var restartBtn = document.getElementById("restart");

  var W = canvas.width, H = canvas.height;
  var CX = W / 2, CY = H / 2, R = W / 2 - 4;

  // Segments defined by angular span (degrees), summing to 360.
  var SEGMENTS = [
    { value: 1000, span: 10, color: "#eef0fb" },
    { value: 20, span: 90, color: "#3ddc84" },
    { value: 500, span: 20, color: "#ff5da2" },
    { value: 10, span: 90, color: "#29e0c9" },
    { value: 200, span: 40, color: "#ffb84d" },
    { value: 0, span: 10, color: "#5b6082" },
    { value: 100, span: 60, color: "#7c5cff" },
    { value: 50, span: 40, color: "#ff5d5d" }
  ];

  var rotation = 0;
  var spinning = false;
  var totalWinnings = 0;

  function loadTotal() {
    try {
      var v = localStorage.getItem(TOTAL_KEY);
      return v === null ? 0 : Number(v);
    } catch (e) { return 0; }
  }
  function saveTotal() {
    try { localStorage.setItem(TOTAL_KEY, String(totalWinnings)); } catch (e) {}
  }

  function refreshHud() {
    scoreEl.textContent = totalWinnings;
    bestEl.textContent = window.ArcadeCommon.getBest(GAME_ID) || 0;
  }

  function drawWheel() {
    ctx.clearRect(0, 0, W, H);
    var startAngle = 0;
    SEGMENTS.forEach(function (seg) {
      var spanRad = (seg.span / 360) * Math.PI * 2;
      var endAngle = startAngle + spanRad;
      ctx.beginPath();
      ctx.moveTo(CX, CY);
      ctx.arc(CX, CY, R, startAngle, endAngle);
      ctx.closePath();
      ctx.fillStyle = seg.color;
      ctx.fill();
      ctx.strokeStyle = "#171b2e";
      ctx.lineWidth = 2;
      ctx.stroke();

      var midAngle = startAngle + spanRad / 2;
      ctx.save();
      ctx.translate(CX + Math.cos(midAngle) * R * 0.68, CY + Math.sin(midAngle) * R * 0.68);
      ctx.fillStyle = "#171b2e";
      ctx.font = "bold 15px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(seg.value === 0 ? "BUST" : String(seg.value), 0, 0);
      ctx.restore();

      startAngle = endAngle;
    });

    ctx.beginPath();
    ctx.arc(CX, CY, 14, 0, Math.PI * 2);
    ctx.fillStyle = "#171b2e";
    ctx.fill();
  }

  function weightedPick() {
    var r = Math.random() * 360;
    var acc = 0;
    for (var i = 0; i < SEGMENTS.length; i++) {
      acc += SEGMENTS[i].span;
      if (r < acc) return i;
    }
    return SEGMENTS.length - 1;
  }

  function segCenterCanvasAngleDeg(idx) {
    var acc = 0;
    for (var i = 0; i < idx; i++) acc += SEGMENTS[i].span;
    return acc + SEGMENTS[idx].span / 2; // degrees, 0 = pointing right (3 o'clock), clockwise
  }

  function spin() {
    if (spinning) return;
    spinning = true;
    spinBtn.disabled = true;
    resultBanner.innerHTML = "";

    var idx = weightedPick();
    var segCenter = segCenterCanvasAngleDeg(idx);
    // Pointer sits at the top of the wheel = canvas angle 270deg.
    // After rotating the canvas by R degrees clockwise, content originally at
    // angle theta appears at (theta + R) mod 360. We need theta + R = 270 (mod 360).
    var desiredMod = ((270 - segCenter) % 360 + 360) % 360;
    var currentMod = ((rotation % 360) + 360) % 360;
    var delta = ((desiredMod - currentMod) % 360 + 360) % 360;
    var newRotation = rotation + 1800 + delta; // at least 5 full spins

    canvas.style.transition = "transform 4s cubic-bezier(0.12,0.67,0.16,1.0)";
    canvas.style.transform = "rotate(" + newRotation + "deg)";
    rotation = newRotation;

    setTimeout(function () {
      spinning = false;
      spinBtn.disabled = false;
      var seg = SEGMENTS[idx];
      totalWinnings += seg.value;
      saveTotal();
      var improved = window.ArcadeCommon.setBest(GAME_ID, seg.value);
      refreshHud();
      if (seg.value === 0) {
        window.ArcadeCommon.toast("Bust! No prize this time.");
        resultBanner.innerHTML = '<span class="overlay-lose">Bust — no prize</span>';
      } else {
        window.ArcadeCommon.toast("+" + seg.value + "!");
        resultBanner.innerHTML = '<span class="overlay-win">You won ' + seg.value + (improved ? " 🏆" : "") + '</span>';
      }
    }, 4050);
  }

  function newGame() {
    resultBanner.innerHTML = "";
    refreshHud();
  }

  spinBtn.addEventListener("click", spin);
  restartBtn.addEventListener("click", newGame);

  totalWinnings = loadTotal();
  drawWheel();
  refreshHud();
})();
