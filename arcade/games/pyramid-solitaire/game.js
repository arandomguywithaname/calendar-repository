(function () {
  var GAME_ID = "pyramid-solitaire";
  var pyramidEl = document.getElementById("pyramid");
  var stockPileEl = document.getElementById("stock-pile");
  var wastePileEl = document.getElementById("waste-pile");
  var stockCountEl = document.getElementById("stock-count");
  var scoreEl = document.getElementById("score");
  var bestEl = document.getElementById("best");
  var resultBanner = document.getElementById("result-banner");
  var drawBtn = document.getElementById("draw-btn");
  var restartBtn = document.getElementById("restart");

  var SUITS = ["♠", "♥", "♦", "♣"];
  var RANK_LABELS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  var ROWS = 7;
  var MAX_REDEALS = 2;

  var rows, stock, waste, redealsUsed, selected, score, over;

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
    scoreEl.textContent = score;
    var best = window.ArcadeCommon.getBest(GAME_ID);
    bestEl.textContent = best === null ? 0 : best;
    stockCountEl.textContent = stock.length;
  }

  function newGame() {
    var deck = buildDeck();
    rows = [];
    var cursor = 0;
    for (var r = 0; r < ROWS; r++) {
      var row = [];
      for (var c = 0; c <= r; c++) {
        row.push(deck[cursor++]);
      }
      rows.push(row);
    }
    stock = deck.slice(cursor);
    waste = [];
    redealsUsed = 0;
    selected = null;
    score = 0;
    over = false;
    resultBanner.innerHTML = "";
    refreshHud();
    render();
  }

  function isExposed(r, c) {
    if (rows[r][c] === null) return false;
    if (r === ROWS - 1) return true;
    return rows[r + 1][c] === null && rows[r + 1][c + 1] === null;
  }

  function sameSelection(a, b) {
    if (a.type !== b.type) return false;
    if (a.type === "waste") return true;
    return a.row === b.row && a.col === b.col;
  }

  function getCard(sel) {
    if (!sel) return null;
    if (sel.type === "pyramid") return rows[sel.row][sel.col];
    if (sel.type === "waste") return waste.length ? waste[waste.length - 1] : null;
    return null;
  }

  function removeCard(sel) {
    if (sel.type === "pyramid") rows[sel.row][sel.col] = null;
    else if (sel.type === "waste") waste.pop();
  }

  function handleCardClick(sel) {
    if (over) return;
    var card = getCard(sel);
    if (!card) return;

    if (card.rank === 13) {
      if (selected && sameSelection(selected, sel)) { selected = null; render(); return; }
      removeCard(sel);
      score += 10;
      selected = null;
      refreshHud();
      checkWin();
      render();
      return;
    }

    if (!selected) {
      selected = sel;
      render();
      return;
    }
    if (sameSelection(selected, sel)) {
      selected = null;
      render();
      return;
    }
    var first = getCard(selected);
    if (!first) {
      selected = sel;
      render();
      return;
    }
    if (first.rank + card.rank === 13) {
      removeCard(selected);
      removeCard(sel);
      score += 10;
      selected = null;
      refreshHud();
      checkWin();
      render();
    } else {
      window.ArcadeCommon.toast("Those don't add up to 13");
      selected = sel;
      render();
    }
  }

  function drawCard() {
    if (over) return;
    if (stock.length === 0) {
      if (redealsUsed < MAX_REDEALS && waste.length > 0) {
        stock = waste.slice().reverse();
        waste = [];
        redealsUsed++;
        window.ArcadeCommon.toast("Reshuffled waste into stock");
      } else {
        window.ArcadeCommon.toast("No more draws left");
        return;
      }
    }
    waste.push(stock.pop());
    selected = null;
    refreshHud();
    render();
  }

  function checkWin() {
    var cleared = rows.every(function (row) {
      return row.every(function (c) { return c === null; });
    });
    if (cleared) {
      over = true;
      var improved = window.ArcadeCommon.setBest(GAME_ID, score);
      resultBanner.innerHTML = '<span class="overlay-win">' + window.ArcadeI18n.t("common.youWin") +
        " — " + score + (improved ? " 🏆" : "") + "</span>";
      refreshHud();
    }
  }

  function render() {
    pyramidEl.innerHTML = "";
    for (var r = 0; r < ROWS; r++) {
      var rowEl = document.createElement("div");
      rowEl.className = "pyr-row";
      for (var c = 0; c <= r; c++) {
        (function (r, c) {
          var card = rows[r][c];
          var el = document.createElement("div");
          if (card === null) {
            el.className = "pyr-card gone";
          } else {
            var exposed = isExposed(r, c);
            var cls = "pyr-card" + (exposed ? " exposed" : "") + (isRed(card) ? " red" : "");
            if (exposed && selected && selected.type === "pyramid" && selected.row === r && selected.col === c) {
              cls += " selected";
            }
            el.className = cls;
            el.textContent = label(card);
            if (exposed) {
              el.addEventListener("click", function () { handleCardClick({ type: "pyramid", row: r, col: c }); });
            }
          }
          rowEl.appendChild(el);
        })(r, c);
      }
      pyramidEl.appendChild(rowEl);
    }

    stockPileEl.textContent = stock.length > 0 ? "🂠" : "";
    stockPileEl.className = "pyr-pile" + (stock.length > 0 ? " filled" : "");

    var topWaste = waste.length ? waste[waste.length - 1] : null;
    wastePileEl.innerHTML = "";
    if (topWaste) {
      wastePileEl.textContent = label(topWaste);
      wastePileEl.className = "pyr-pile filled" + (isRed(topWaste) ? " red" : "") +
        (selected && selected.type === "waste" ? " selected" : "");
      wastePileEl.style.color = isRed(topWaste) ? "#ff5d5d" : "";
      wastePileEl.onclick = function () { handleCardClick({ type: "waste" }); };
    } else {
      wastePileEl.textContent = "";
      wastePileEl.className = "pyr-pile";
      wastePileEl.onclick = null;
    }
  }

  drawBtn.addEventListener("click", drawCard);
  restartBtn.addEventListener("click", newGame);
  stockPileEl.addEventListener("click", drawCard);

  newGame();
})();
