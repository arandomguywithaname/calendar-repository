(function () {
  var GAME_ID = "whack-a-mole";
  var boardEl = document.getElementById("board");
  var scoreEl = document.getElementById("score");
  var timeEl = document.getElementById("time");
  var bestEl = document.getElementById("best");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");
  var diffEl = document.getElementById("difficulty");

  var HOLES = 9;
  var GAME_TIME = 30;

  // Per-difficulty tuning. spawn* = ms between spawn attempts,
  // up* = how long a mole stays up, maxUp = moles allowed up at once.
  var DIFFICULTIES = {
    easy: { spawnMin: 800, spawnMax: 1400, upMin: 1300, upMax: 2000, maxUp: 1 },
    medium: { spawnMin: 400, spawnMax: 900, upMin: 650, upMax: 1100, maxUp: 2 },
    hard: { spawnMin: 240, spawnMax: 520, upMin: 430, upMax: 780, maxUp: 3 }
  };
  var cfg = DIFFICULTIES.medium;

  var holes, cells, score, timeLeft, over, tickTimer, moleTimer, particleLayer;

  function refreshHud() {
    scoreEl.textContent = score;
    timeEl.textContent = timeLeft;
    bestEl.textContent = window.ArcadeCommon.getBest(GAME_ID) || 0;
  }

  function buildBoard() {
    boardEl.innerHTML = "";
    cells = [];
    for (var i = 0; i < HOLES; i++) {
      var cell = document.createElement("div");
      cell.className = "hole";
      (function (idx, el) {
        el.addEventListener("click", function () { whack(idx); });
      })(i, cell);
      boardEl.appendChild(cell);
      cells.push(cell);
    }
    particleLayer = document.createElement("div");
    particleLayer.className = "particle-layer";
    boardEl.appendChild(particleLayer);
  }

  function updateHole(i) {
    var h = holes[i];
    var cell = cells[i];
    cell.className = "hole" + (h.up ? (h.whacked ? " whacked" : " up") : "");
    cell.textContent = h.up ? (h.whacked ? "💥" : "🐹") : "";
  }

  function burst(x, y, colors) {
    for (var i = 0; i < 14; i++) {
      var p = document.createElement("span");
      p.className = "particle";
      var ang = Math.random() * Math.PI * 2;
      var dist = 24 + Math.random() * 46;
      p.style.setProperty("--dx", Math.cos(ang) * dist + "px");
      p.style.setProperty("--dy", Math.sin(ang) * dist + "px");
      p.style.left = x + "px";
      p.style.top = y + "px";
      p.style.color = colors[i % colors.length];
      p.addEventListener("animationend", function () {
        if (this.parentNode) this.parentNode.removeChild(this);
      });
      particleLayer.appendChild(p);
    }
  }

  function newGame() {
    holes = [];
    for (var i = 0; i < HOLES; i++) holes.push({ up: false, whacked: false });
    score = 0;
    timeLeft = GAME_TIME;
    over = false;
    resultBanner.innerHTML = "";
    buildBoard();
    for (var j = 0; j < HOLES; j++) updateHole(j);
    refreshHud();
    clearInterval(tickTimer);
    clearTimeout(moleTimer);
    tickTimer = setInterval(tick, 1000);
    scheduleMole();
  }

  function whack(i) {
    if (over) return;
    var h = holes[i];
    if (h.up && !h.whacked) {
      h.whacked = true;
      score++;
      refreshHud();
      updateHole(i);
      var cell = cells[i];
      burst(cell.offsetLeft + cell.offsetWidth / 2, cell.offsetTop + cell.offsetHeight / 2,
        ["#ff5da2", "#ffd23f", "#29e0c9", "#7c5cff"]);
    }
  }

  function scheduleMole() {
    if (over) return;
    var delay = window.ArcadeCommon.randInt(cfg.spawnMin, cfg.spawnMax);
    moleTimer = setTimeout(function () {
      if (over) return;
      var activeUp = holes.filter(function (h) { return h.up; }).length;
      if (activeUp < cfg.maxUp) {
        var idx = window.ArcadeCommon.randInt(0, HOLES - 1);
        if (!holes[idx].up) {
          holes[idx].up = true;
          holes[idx].whacked = false;
          updateHole(idx);
          var upTime = window.ArcadeCommon.randInt(cfg.upMin, cfg.upMax);
          (function (id) {
            setTimeout(function () {
              if (over) return;
              holes[id].up = false;
              holes[id].whacked = false;
              updateHole(id);
            }, upTime);
          })(idx);
        }
      }
      scheduleMole();
    }, delay);
  }

  function tick() {
    if (over) return;
    timeLeft--;
    refreshHud();
    if (timeLeft <= 0) endGame();
  }

  function endGame() {
    over = true;
    clearInterval(tickTimer);
    clearTimeout(moleTimer);
    holes.forEach(function (h, i) { h.up = false; updateHole(i); });
    var improved = window.ArcadeCommon.setBest(GAME_ID, score);
    resultBanner.innerHTML = '<span class="overlay-win">' + window.ArcadeI18n.t("common.gameOver") +
      " — " + window.ArcadeI18n.t("common.score") + ": " + score + (improved ? " 🏆" : "") + "</span>";
    refreshHud();
  }

  restartBtn.addEventListener("click", newGame);

  window.ArcadeCommon.mountDifficulty(diffEl, GAME_ID, {
    defaultKey: "medium",
    onChange: function (level) {
      cfg = DIFFICULTIES[level] || DIFFICULTIES.medium;
      newGame();
    }
  });
})();
