(function () {
  var GAME_ID = "freecell";
  var freecellsEl = document.getElementById("freecells");
  var foundationsEl = document.getElementById("foundations");
  var tableauEl = document.getElementById("tableau");
  var movesEl = document.getElementById("moves");
  var bestEl = document.getElementById("best");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");

  var SUITS = ["♠", "♥", "♦", "♣"];
  var RANK_LABELS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

  var tableau, freeCells, foundations, selected, moves, over;

  function isRed(card) { return card.suit === "♥" || card.suit === "♦"; }

  function label(card) { return RANK_LABELS[card.rank - 1] + card.suit; }

  function buildDeck() {
    var deck = [];
    SUITS.forEach(function (s) {
      for (var r = 1; r <= 13; r++) deck.push({ suit: s, rank: r });
    });
    return window.ArcadeCommon.shuffle(deck);
  }

  function refreshHud() {
    movesEl.textContent = moves;
    var best = window.ArcadeCommon.getBest(GAME_ID);
    bestEl.textContent = best === null ? "-" : best;
  }

  function newGame() {
    var deck = buildDeck();
    tableau = [[], [], [], [], [], [], [], []];
    deck.forEach(function (card, i) { tableau[i % 8].push(card); });
    freeCells = [null, null, null, null];
    foundations = { "♠": 0, "♥": 0, "♦": 0, "♣": 0 };
    selected = null;
    moves = 0;
    over = false;
    resultBanner.innerHTML = "";
    refreshHud();
    render();
  }

  function topOfColumn(col) {
    var c = tableau[col];
    return c.length ? c[c.length - 1] : null;
  }

  function canPlaceOnTableau(card, col) {
    var c = tableau[col];
    if (c.length === 0) return true;
    var top = c[c.length - 1];
    return top.rank === card.rank + 1 && isRed(top) !== isRed(card);
  }

  function canPlaceOnFoundation(card) {
    return foundations[card.suit] === card.rank - 1;
  }

  function getSelectedCard() {
    if (!selected) return null;
    if (selected.source === "tableau") return topOfColumn(selected.col);
    if (selected.source === "free") return freeCells[selected.idx];
    return null;
  }

  function removeSelectedCard() {
    if (selected.source === "tableau") return tableau[selected.col].pop();
    if (selected.source === "free") {
      var c = freeCells[selected.idx];
      freeCells[selected.idx] = null;
      return c;
    }
    return null;
  }

  function onFreeCellClick(i) {
    if (over) return;
    if (selected && selected.source === "free" && selected.idx === i) {
      selected = null;
      render();
      return;
    }
    if (selected) {
      tryMove({ type: "free", idx: i });
    } else if (freeCells[i]) {
      selected = { source: "free", idx: i };
      render();
    }
  }

  function onFoundationClick(suit) {
    if (over) return;
    if (selected) {
      tryMove({ type: "foundation", suit: suit });
    }
  }

  function onTableauClick(col) {
    if (over) return;
    if (selected && selected.source === "tableau" && selected.col === col) {
      selected = null;
      render();
      return;
    }
    if (selected) {
      tryMove({ type: "tableau", col: col });
    } else if (tableau[col].length > 0) {
      selected = { source: "tableau", col: col };
      render();
    }
  }

  function tryMove(dest) {
    var card = getSelectedCard();
    if (!card) { selected = null; render(); return; }
    var ok = false;
    if (dest.type === "free") {
      ok = freeCells[dest.idx] === null;
    } else if (dest.type === "foundation") {
      ok = card.suit === dest.suit && canPlaceOnFoundation(card);
    } else if (dest.type === "tableau") {
      ok = canPlaceOnTableau(card, dest.col);
    }
    if (!ok) {
      window.ArcadeCommon.toast("Invalid move");
      if (dest.type === "tableau" && tableau[dest.col].length > 0 &&
          !(selected.source === "tableau" && selected.col === dest.col)) {
        selected = { source: "tableau", col: dest.col };
      } else if (dest.type === "free" && freeCells[dest.idx] &&
          !(selected.source === "free" && selected.idx === dest.idx)) {
        selected = { source: "free", idx: dest.idx };
      } else {
        selected = null;
      }
      render();
      return;
    }
    removeSelectedCard();
    if (dest.type === "free") freeCells[dest.idx] = card;
    else if (dest.type === "foundation") foundations[card.suit] = card.rank;
    else if (dest.type === "tableau") tableau[dest.col].push(card);
    selected = null;
    moves++;
    refreshHud();
    checkWin();
    render();
  }

  function checkWin() {
    var total = foundations["♠"] + foundations["♥"] + foundations["♦"] + foundations["♣"];
    if (total === 52) {
      over = true;
      var improved = window.ArcadeCommon.setBestLowerIsBetter(GAME_ID, moves);
      resultBanner.innerHTML = '<span class="overlay-win">' + window.ArcadeI18n.t("common.youWin") +
        " — " + moves + " " + window.ArcadeI18n.t("common.moves") + (improved ? " 🏆" : "") + "</span>";
      refreshHud();
    }
  }

  function render() {
    freecellsEl.innerHTML = "";
    for (var i = 0; i < 4; i++) {
      (function (i) {
        var slot = document.createElement("div");
        var card = freeCells[i];
        var cls = "fc-slot";
        if (card && isRed(card)) cls += " red";
        if (selected && selected.source === "free" && selected.idx === i) cls += " selected";
        slot.className = cls;
        slot.textContent = card ? label(card) : "";
        slot.addEventListener("click", function () { onFreeCellClick(i); });
        freecellsEl.appendChild(slot);
      })(i);
    }

    foundationsEl.innerHTML = "";
    SUITS.forEach(function (suit) {
      var slot = document.createElement("div");
      var rank = foundations[suit];
      var cls = "fc-slot";
      if (rank > 0 && (suit === "♥" || suit === "♦")) cls += " red";
      slot.className = cls;
      slot.textContent = rank > 0 ? RANK_LABELS[rank - 1] + suit : suit;
      slot.addEventListener("click", function () { onFoundationClick(suit); });
      foundationsEl.appendChild(slot);
    });

    tableauEl.innerHTML = "";
    for (var col = 0; col < 8; col++) {
      (function (col) {
        var colEl = document.createElement("div");
        colEl.className = "fc-column";
        var cards = tableau[col];
        if (cards.length === 0) {
          var empty = document.createElement("div");
          empty.className = "fc-empty-col";
          empty.addEventListener("click", function () { onTableauClick(col); });
          colEl.appendChild(empty);
        } else {
          cards.forEach(function (card, j) {
            var cardEl = document.createElement("div");
            var isTop = j === cards.length - 1;
            var cls = "fc-card " + (isRed(card) ? "red" : "black");
            if (selected && selected.source === "tableau" && selected.col === col && isTop) cls += " selected";
            cardEl.className = cls;
            cardEl.textContent = label(card);
            cardEl.addEventListener("click", function () { onTableauClick(col); });
            colEl.appendChild(cardEl);
          });
        }
        tableauEl.appendChild(colEl);
      })(col);
    }
  }

  restartBtn.addEventListener("click", newGame);
  newGame();
})();
