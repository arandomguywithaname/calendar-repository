(function () {
  var GAME_ID = "memory-match";
  var boardEl = document.getElementById("board");
  var movesEl = document.getElementById("moves");
  var bestEl = document.getElementById("best");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");
  var diffEl = document.getElementById("difficulty");

  var ICONS = ["🍎", "🍋", "🍇", "🍉", "🍓", "🍒", "🥝", "🍑", "🍌", "🍍", "🥥", "🍊"];

  // Difficulty sets how many pairs are in play (and how briefly a mismatch peeks).
  var DIFFICULTIES = {
    easy: { pairs: 6, cols: 4, peek: 900 },
    medium: { pairs: 8, cols: 4, peek: 700 },
    hard: { pairs: 12, cols: 6, peek: 500 }
  };
  var cfg = DIFFICULTIES.medium;

  var cards, flipped, matched, moves, lock, pairCount;

  function refreshHud() {
    movesEl.textContent = moves;
    var best = window.ArcadeCommon.getBest(GAME_ID);
    bestEl.textContent = best === null ? "-" : best;
  }

  function newGame() {
    pairCount = cfg.pairs;
    var icons = ICONS.slice(0, pairCount);
    var deck = window.ArcadeCommon.shuffle(icons.concat(icons));
    cards = deck.map(function (icon, i) { return { id: i, icon: icon, flipped: false, matched: false }; });
    flipped = [];
    matched = 0;
    moves = 0;
    lock = false;
    resultBanner.innerHTML = "";
    refreshHud();
    render();
  }

  function render() {
    boardEl.innerHTML = "";
    boardEl.style.gridTemplateColumns = "repeat(" + cfg.cols + ", 74px)";
    cards.forEach(function (card) {
      var cell = document.createElement("div");
      cell.className = "cell";
      cell.style.fontSize = "1.8rem";
      if (card.matched) {
        cell.textContent = card.icon;
        cell.classList.add("matched");
        cell.style.opacity = "0.5";
      } else if (card.flipped) {
        cell.textContent = card.icon;
      } else {
        cell.textContent = "❔";
        cell.classList.add("back");
      }
      cell.addEventListener("click", function () { flip(card); });
      boardEl.appendChild(cell);
    });
  }

  function animateParticle(p, vx, vy) {
    var x = 0, y = 0, life = 1;
    function step() {
      x += vx; y += vy; vy += 0.12; life -= 0.035;
      p.style.transform = "translate(" + x + "px," + y + "px)";
      p.style.opacity = Math.max(0, life);
      if (life > 0) requestAnimationFrame(step);
      else if (p.parentNode) p.parentNode.removeChild(p);
    }
    requestAnimationFrame(step);
  }

  function spawnMatchParticles(el) {
    boardEl.style.position = "relative";
    var cx = el.offsetLeft + el.offsetWidth / 2;
    var cy = el.offsetTop + el.offsetHeight / 2;
    var colors = ["#3ddc84", "#29e0c9", "#ffd23f", "#ff5da2"];
    for (var i = 0; i < 12; i++) {
      var p = document.createElement("div");
      p.className = "mm-particle";
      p.style.left = cx + "px";
      p.style.top = cy + "px";
      var col = colors[i % colors.length];
      p.style.background = col;
      p.style.boxShadow = "0 0 6px " + col;
      boardEl.appendChild(p);
      var ang = Math.random() * Math.PI * 2, spd = 1.5 + Math.random() * 3;
      animateParticle(p, Math.cos(ang) * spd, Math.sin(ang) * spd);
    }
  }

  function flashMatch(card) {
    var idx = cards.indexOf(card);
    var el = boardEl.children[idx];
    if (!el) return;
    el.classList.add("flash");
    spawnMatchParticles(el);
  }

  function flip(card) {
    if (lock || card.flipped || card.matched || flipped.length === 2) return;
    card.flipped = true;
    flipped.push(card);
    render();
    if (flipped.length === 2) {
      moves++;
      refreshHud();
      lock = true;
      if (flipped[0].icon === flipped[1].icon) {
        var m0 = flipped[0], m1 = flipped[1];
        m0.matched = true;
        m1.matched = true;
        matched++;
        flipped = [];
        lock = false;
        render();
        flashMatch(m0);
        flashMatch(m1);
        if (matched === pairCount) finish();
      } else {
        setTimeout(function () {
          flipped.forEach(function (c) { c.flipped = false; });
          flipped = [];
          lock = false;
          render();
        }, cfg.peek);
      }
    }
  }

  function finish() {
    var improved = window.ArcadeCommon.setBestLowerIsBetter(GAME_ID, moves);
    resultBanner.innerHTML = '<span class="overlay-win">' + window.ArcadeI18n.t("common.youWin") +
      " — " + moves + " " + window.ArcadeI18n.t("common.moves") + (improved ? " 🏆" : "") + "</span>";
    refreshHud();
  }

  restartBtn.addEventListener("click", newGame);

  // Difficulty selector - changing pair count starts a fresh board.
  window.ArcadeCommon.mountDifficulty(diffEl, GAME_ID, {
    defaultKey: "medium",
    onChange: function (level) {
      cfg = DIFFICULTIES[level] || DIFFICULTIES.medium;
      newGame();
    }
  });
})();
