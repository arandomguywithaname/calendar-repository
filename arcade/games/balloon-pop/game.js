(function () {
  var GAME_ID = "balloon-pop";
  var boardEl = document.getElementById("board");
  var scoreEl = document.getElementById("score");
  var bestEl = document.getElementById("best");
  var timeEl = document.getElementById("time");
  var livesEl = document.getElementById("lives");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");
  var diffEl = document.getElementById("difficulty");

  var COLORS = ["#ff5da2", "#7c5cff", "#29e0c9", "#ffb84d", "#3ddc84", "#ff5d5d", "#4ac3ff"];
  var BOARD_W = 480, BOARD_H = 480;

  // Easy = slow, big, few bombs; hard = fast, small, more bombs.
  var DIFFICULTIES = {
    easy:   { spawnEvery: 820, sizeMin: 52, sizeMax: 80, speedMin: 45, speedMax: 90,  bombChance: 0.08 },
    medium: { spawnEvery: 650, sizeMin: 38, sizeMax: 68, speedMin: 60, speedMax: 130, bombChance: 0.14 },
    hard:   { spawnEvery: 470, sizeMin: 26, sizeMax: 50, speedMin: 100, speedMax: 195, bombChance: 0.23 }
  };
  var cfg = DIFFICULTIES.medium;

  var balloons, particles, score, lives, timeLeft, over, spawnTimer, tickTimer, rafId, nextId;

  function refreshHud() {
    scoreEl.textContent = score;
    livesEl.textContent = lives;
    timeEl.textContent = timeLeft;
    var best = window.ArcadeCommon.getBest(GAME_ID);
    bestEl.textContent = best === null ? "-" : best;
  }

  function newGame() {
    balloons = [];
    particles = [];
    score = 0;
    lives = 3;
    timeLeft = 30;
    over = false;
    nextId = 1;
    resultBanner.innerHTML = "";
    boardEl.innerHTML = "";
    refreshHud();
    clearInterval(spawnTimer);
    clearInterval(tickTimer);
    cancelAnimationFrame(rafId);
    spawnTimer = setInterval(spawnBalloon, cfg.spawnEvery);
    tickTimer = setInterval(function () {
      if (over) return;
      timeLeft--;
      refreshHud();
      if (timeLeft <= 0) endGame();
    }, 1000);
    spawnBalloon();
    rafId = requestAnimationFrame(loop);
  }

  function spawnBalloon() {
    if (over) return;
    var isBomb = Math.random() < cfg.bombChance;
    var size = window.ArcadeCommon.randInt(cfg.sizeMin, cfg.sizeMax);
    var b = {
      id: nextId++,
      x: window.ArcadeCommon.randInt(0, BOARD_W - size),
      y: BOARD_H + size,
      size: size,
      speed: window.ArcadeCommon.randInt(cfg.speedMin, cfg.speedMax) / 60,
      isBomb: isBomb,
      color: isBomb ? "#ff5d5d" : window.ArcadeCommon.pick(COLORS),
      el: null
    };
    var el = document.createElement("div");
    el.className = "balloon";
    el.style.fontSize = size + "px";
    el.textContent = isBomb ? "💣" : "🎈";
    el.style.filter = "drop-shadow(0 0 " + Math.round(size / 5) + "px " + b.color + ")";
    el.style.color = b.color;
    el.style.left = b.x + "px";
    el.style.top = b.y + "px";
    el.addEventListener("click", function () { pop(b); });
    el.addEventListener("touchstart", function (e) { e.preventDefault(); pop(b); }, { passive: false });
    boardEl.appendChild(el);
    b.el = el;
    balloons.push(b);
  }

  function spawnParticles(cx, cy, color, n) {
    for (var i = 0; i < (n || 12); i++) {
      var ang = Math.random() * Math.PI * 2;
      var spd = 1.5 + Math.random() * 3.5;
      var sz = 4 + Math.random() * 6;
      var el = document.createElement("div");
      el.className = "pop-particle";
      el.style.width = sz + "px";
      el.style.height = sz + "px";
      el.style.background = color;
      el.style.boxShadow = "0 0 8px " + color;
      el.style.left = cx + "px";
      el.style.top = cy + "px";
      boardEl.appendChild(el);
      particles.push({ el: el, x: cx, y: cy, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, life: 1 });
    }
  }

  function pop(b) {
    if (over || b.popped) return;
    b.popped = true;
    spawnParticles(b.x + b.size / 2, b.y + b.size / 2, b.color, b.isBomb ? 18 : 12);
    if (b.el && b.el.parentNode) b.el.parentNode.removeChild(b.el);
    balloons = balloons.filter(function (x) { return x !== b; });
    if (b.isBomb) {
      lives--;
      score = Math.max(0, score - 5);
      window.ArcadeCommon.toast("💥 Bomb!");
      if (lives <= 0) { refreshHud(); endGame(); return; }
    } else {
      var gain = Math.round(100 / b.size * 10);
      score += gain;
    }
    refreshHud();
  }

  function updateParticles() {
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.x += p.vx; p.y += p.vy; p.vy += 0.12; p.life -= 0.04;
      if (p.life <= 0) {
        if (p.el && p.el.parentNode) p.el.parentNode.removeChild(p.el);
        particles.splice(i, 1);
        continue;
      }
      p.el.style.left = p.x + "px";
      p.el.style.top = p.y + "px";
      p.el.style.opacity = Math.max(0, p.life);
    }
  }

  function loop() {
    if (!over) {
      balloons.forEach(function (b) {
        b.y -= b.speed;
        if (b.el) b.el.style.top = b.y + "px";
        if (b.y < -b.size) {
          b.popped = true;
          if (b.el && b.el.parentNode) b.el.parentNode.removeChild(b.el);
        }
      });
      balloons = balloons.filter(function (b) { return !b.popped; });
      updateParticles();
      rafId = requestAnimationFrame(loop);
    }
  }

  function endGame() {
    if (over) return;
    over = true;
    clearInterval(spawnTimer);
    clearInterval(tickTimer);
    cancelAnimationFrame(rafId);
    var improved = window.ArcadeCommon.setBest(GAME_ID, score);
    resultBanner.innerHTML = '<span class="' + (lives <= 0 ? "overlay-lose" : "overlay-win") + '">' +
      window.ArcadeI18n.t("common.gameOver") + " — " + window.ArcadeI18n.t("common.score") + ": " + score + (improved ? " 🏆" : "") + "</span>";
    refreshHud();
  }

  restartBtn.addEventListener("click", newGame);

  // Difficulty selector - changing it restarts with the new tuning.
  window.ArcadeCommon.mountDifficulty(diffEl, GAME_ID, {
    defaultKey: "medium",
    onChange: function (level) {
      cfg = DIFFICULTIES[level] || DIFFICULTIES.medium;
      newGame();
    }
  });
})();
