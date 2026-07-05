(function () {
  var GAME_ID = "simon-says";
  var levelEl = document.getElementById("level");
  var bestEl = document.getElementById("best");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");
  var board = document.getElementById("board");
  var diffEl = document.getElementById("difficulty");
  var quads = [
    document.getElementById("q0"),
    document.getElementById("q1"),
    document.getElementById("q2"),
    document.getElementById("q3")
  ];
  var QUAD_COLORS = ["#ff5da2", "#29e0c9", "#ffb84d", "#7c5cff"];

  var sequence, playerStep, level, over, accepting, showTimer, retryUsed;

  // Per-difficulty tuning. litMs/gapMs control playback speed, startLen the
  // starting sequence length, forgiving allows one retry per round.
  var DIFFICULTIES = {
    easy: { litMs: 650, gapMs: 340, startLen: 1, forgiving: true },
    medium: { litMs: 420, gapMs: 200, startLen: 1, forgiving: false },
    hard: { litMs: 230, gapMs: 110, startLen: 3, forgiving: false }
  };
  var cfg = DIFFICULTIES.medium;

  function refreshHud() {
    levelEl.textContent = level;
    bestEl.textContent = window.ArcadeCommon.getBest(GAME_ID) || 0;
  }

  function newGame() {
    clearTimeout(showTimer);
    sequence = [];
    for (var i = 0; i < cfg.startLen - 1; i++) {
      sequence.push(window.ArcadeCommon.randInt(0, 3));
    }
    playerStep = 0;
    level = 0;
    over = false;
    accepting = false;
    retryUsed = false;
    resultBanner.innerHTML = "";
    refreshHud();
    quads.forEach(function (q) { q.disabled = false; });
    setTimeout(nextRound, 500);
  }

  function nextRound() {
    sequence.push(window.ArcadeCommon.randInt(0, 3));
    playerStep = 0;
    retryUsed = false;
    level = sequence.length - 1;
    refreshHud();
    accepting = false;
    quads.forEach(function (q) { q.disabled = true; });
    playSequence(0);
  }

  function playSequence(i) {
    if (i >= sequence.length) {
      accepting = true;
      quads.forEach(function (q) { q.disabled = false; });
      return;
    }
    var idx = sequence[i];
    quads[idx].classList.add("lit");
    showTimer = setTimeout(function () {
      quads[idx].classList.remove("lit");
      setTimeout(function () { playSequence(i + 1); }, cfg.gapMs);
    }, cfg.litMs);
  }

  function spawnParticles(idx) {
    var quad = quads[idx];
    var cx = quad.offsetLeft + quad.offsetWidth / 2;
    var cy = quad.offsetTop + quad.offsetHeight / 2;
    var color = QUAD_COLORS[idx];
    for (var i = 0; i < 10; i++) {
      var p = document.createElement("span");
      p.className = "simon-particle";
      p.style.background = color;
      p.style.left = (cx - 4) + "px";
      p.style.top = (cy - 4) + "px";
      p.style.boxShadow = "0 0 10px " + color;
      board.appendChild(p);
      (function (el, ang, dist) {
        requestAnimationFrame(function () {
          el.style.transform = "translate(" + Math.cos(ang) * dist + "px," + Math.sin(ang) * dist + "px) scale(0.4)";
          el.style.opacity = "0";
        });
        setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 520);
      })(p, Math.random() * Math.PI * 2, 30 + Math.random() * 40);
    }
  }

  function handleClick(idx) {
    if (!accepting || over) return;
    quads[idx].classList.add("lit");
    spawnParticles(idx);
    setTimeout(function () { quads[idx].classList.remove("lit"); }, 200);

    if (idx === sequence[playerStep]) {
      playerStep++;
      if (playerStep === sequence.length) {
        accepting = false;
        setTimeout(nextRound, 700);
      }
    } else if (cfg.forgiving && !retryUsed) {
      // Easy mode: forgive one mistake per round and replay the sequence.
      retryUsed = true;
      accepting = false;
      playerStep = 0;
      quads.forEach(function (q) { q.disabled = true; });
      window.ArcadeCommon.toast(window.ArcadeI18n.t("common.tryAgain") || "Try again!");
      setTimeout(function () { playSequence(0); }, 800);
    } else {
      endGame();
    }
  }

  function endGame() {
    over = true;
    accepting = false;
    quads.forEach(function (q) { q.disabled = true; });
    var finalScore = sequence.length - 1;
    window.ArcadeCommon.setBest(GAME_ID, finalScore);
    resultBanner.innerHTML = '<span class="overlay-lose">' + window.ArcadeI18n.t("common.gameOver") + " — " + window.ArcadeI18n.t("common.level") + " " + finalScore + "</span>";
    refreshHud();
  }

  quads.forEach(function (q, i) {
    q.addEventListener("click", function () { handleClick(i); });
  });

  restartBtn.addEventListener("click", newGame);

  // Difficulty selector - changing it starts a fresh game at the new pace.
  window.ArcadeCommon.mountDifficulty(diffEl, GAME_ID, {
    defaultKey: "medium",
    onChange: function (level) {
      cfg = DIFFICULTIES[level] || DIFFICULTIES.medium;
      newGame();
    }
  });
})();
