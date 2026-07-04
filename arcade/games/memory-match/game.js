(function () {
  var GAME_ID = "memory-match";
  var boardEl = document.getElementById("board");
  var movesEl = document.getElementById("moves");
  var bestEl = document.getElementById("best");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");

  var ICONS = ["🍎", "🍋", "🍇", "🍉", "🍓", "🍒", "🥝", "🍑"];
  var cards, flipped, matched, moves, lock;

  function refreshHud() {
    movesEl.textContent = moves;
    var best = window.ArcadeCommon.getBest(GAME_ID);
    bestEl.textContent = best === null ? "-" : best;
  }

  function newGame() {
    var deck = window.ArcadeCommon.shuffle(ICONS.concat(ICONS));
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
    cards.forEach(function (card) {
      var cell = document.createElement("div");
      cell.className = "cell";
      cell.style.fontSize = "1.8rem";
      cell.textContent = card.flipped || card.matched ? card.icon : "❔";
      if (card.matched) cell.style.opacity = "0.35";
      cell.addEventListener("click", function () { flip(card); });
      boardEl.appendChild(cell);
    });
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
        flipped.forEach(function (c) { c.matched = true; });
        matched++;
        flipped = [];
        lock = false;
        render();
        if (matched === ICONS.length) finish();
      } else {
        setTimeout(function () {
          flipped.forEach(function (c) { c.flipped = false; });
          flipped = [];
          lock = false;
          render();
        }, 700);
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
  newGame();
})();
