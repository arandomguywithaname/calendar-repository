(function () {
  var GAME_ID = "spider-solitaire";
  var boardEl = document.getElementById("board");
  var movesEl = document.getElementById("moves");
  var runsEl = document.getElementById("runs");
  var bestEl = document.getElementById("best");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");
  var dealBtn = document.getElementById("deal");

  var SUIT = "♠"; // simplified single-suit spider: every card uses this suit
  var RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  var RUN_ORDER = ["K", "Q", "J", "10", "9", "8", "7", "6", "5", "4", "3", "2", "A"];
  var NUM_COLUMNS = 10;

  var tableau, stock, selection, moves, completedRuns, won;

  function rankIndex(card) { return RANKS.indexOf(card.rank); }

  function buildDeck() {
    var deck = [];
    for (var copy = 0; copy < 4; copy++) {
      RANKS.forEach(function (rank) {
        deck.push({ rank: rank, suit: SUIT, faceUp: false });
      });
    }
    return deck;
  }

  function refreshHud() {
    movesEl.textContent = moves;
    runsEl.textContent = completedRuns;
    var best = window.ArcadeCommon.getBest(GAME_ID);
    bestEl.textContent = best === null ? "-" : best;
  }

  function newGame() {
    var deck = window.ArcadeCommon.shuffle(buildDeck());
    tableau = [];
    // 52 cards total: first 2 columns get 4 cards, remaining 8 columns get 3 cards each (32 tableau cards),
    // leaving 20 cards for the stock, dealt in two batches of 10.
    var counts = [4, 4, 3, 3, 3, 3, 3, 3, 3, 3];
    for (var i = 0; i < NUM_COLUMNS; i++) {
      var col = [];
      for (var j = 0; j < counts[i]; j++) {
        var card = deck.pop();
        card.faceUp = (j === counts[i] - 1);
        col.push(card);
      }
      tableau.push(col);
    }
    stock = deck; // remaining 20
    selection = null;
    moves = 0;
    completedRuns = 0;
    won = false;
    resultBanner.innerHTML = "";
    refreshHud();
    render();
  }

  function makeCardEl(card, selected) {
    var el = document.createElement("div");
    el.className = "card " + (card.faceUp ? "red-or-black" : "face-down");
    if (card.faceUp) {
      el.className = "card red"; // single suit spades is black actually; keep suit color consistent below
    }
    return el;
  }

  function buildCardEl(card, selected) {
    var el = document.createElement("div");
    var colorClass = card.faceUp ? (card.suit === "♥" || card.suit === "♦" ? "red" : "black") : "";
    el.className = "card " + (card.faceUp ? colorClass : "face-down") + (selected ? " selected" : "");
    if (card.faceUp) {
      el.innerHTML = '<span class="rank-top">' + card.rank + card.suit + '</span><span class="suit-big">' + card.suit + '</span>';
    }
    return el;
  }

  function makeEmptySlot(text) {
    var el = document.createElement("div");
    el.className = "card empty-slot";
    el.textContent = text || "";
    return el;
  }

  function render() {
    boardEl.innerHTML = "";

    var infoRow = document.createElement("div");
    infoRow.className = "row";
    var info = document.createElement("div");
    info.className = "stock-info";
    info.textContent = "Stock remaining: " + stock.length + " card" + (stock.length === 1 ? "" : "s");
    infoRow.appendChild(info);
    boardEl.appendChild(infoRow);

    var colsRow = document.createElement("div");
    colsRow.className = "columns-row";
    tableau.forEach(function (col, colIndex) {
      var colEl = document.createElement("div");
      colEl.className = "column";
      if (col.length === 0) {
        var empty = makeEmptySlot("");
        empty.addEventListener("click", function () { onColumnClick(colIndex); });
        colEl.appendChild(empty);
      } else {
        var validStart = findValidRunStart(col);
        col.forEach(function (card, cardIndex) {
          var selected = card.faceUp && selection && selection.col === colIndex && cardIndex >= selection.index;
          var cardEl = buildCardEl(card, selected);
          cardEl.addEventListener("click", function (e) {
            e.stopPropagation();
            if (card.faceUp) {
              onCardClick(colIndex, cardIndex, validStart);
            } else {
              onColumnClick(colIndex);
            }
          });
          colEl.appendChild(cardEl);
        });
      }
      colsRow.appendChild(colEl);
    });
    boardEl.appendChild(colsRow);
  }

  function findValidRunStart(col) {
    var i = col.length - 1;
    while (i > 0 && col[i - 1].faceUp && rankIndex(col[i - 1]) === rankIndex(col[i]) + 1) {
      i--;
    }
    return i;
  }

  function onCardClick(colIndex, cardIndex, validStart) {
    if (selection && selection.col === colIndex && selection.index === cardIndex) {
      selection = null;
      render();
      return;
    }
    if (!selection) {
      if (cardIndex < validStart) {
        window.ArcadeCommon.toast("That's not a movable sequence — pick the lowest card of a descending run");
        return;
      }
      selection = { col: colIndex, index: cardIndex };
      render();
      return;
    }
    if (selection.col === colIndex) {
      if (cardIndex < validStart) {
        window.ArcadeCommon.toast("That's not a movable sequence — pick the lowest card of a descending run");
        return;
      }
      selection = { col: colIndex, index: cardIndex };
      render();
      return;
    }
    attemptMove(colIndex);
  }

  function onColumnClick(colIndex) {
    if (!selection) return;
    if (selection.col === colIndex) {
      selection = null;
      render();
      return;
    }
    attemptMove(colIndex);
  }

  function attemptMove(destColIndex) {
    var srcCol = tableau[selection.col];
    var group = srcCol.slice(selection.index);
    var destCol = tableau[destColIndex];
    var destTop = destCol.length ? destCol[destCol.length - 1] : null;
    var valid = destCol.length === 0 || rankIndex(group[0]) === rankIndex(destTop) - 1;

    if (!valid) {
      window.ArcadeCommon.toast("Can't place that run there");
      return;
    }

    tableau[destColIndex] = destCol.concat(group);
    tableau[selection.col] = srcCol.slice(0, selection.index);
    if (tableau[selection.col].length > 0) {
      var newTop = tableau[selection.col][tableau[selection.col].length - 1];
      if (!newTop.faceUp) newTop.faceUp = true;
    }
    moves++;
    selection = null;
    checkCompletedRuns();
    refreshHud();
    render();
    checkWin();
  }

  function checkCompletedRuns() {
    tableau.forEach(function (col) {
      if (col.length >= 13) {
        var suffix = col.slice(col.length - 13);
        var isRun = suffix.every(function (card, idx) {
          return card.faceUp && card.rank === RUN_ORDER[idx];
        });
        if (isRun) {
          col.length -= 13;
          completedRuns++;
          if (col.length > 0) {
            var newTop = col[col.length - 1];
            if (!newTop.faceUp) newTop.faceUp = true;
          }
        }
      }
    });
  }

  function dealBatch() {
    if (won) return;
    if (stock.length === 0) {
      window.ArcadeCommon.toast("No more cards in the stock");
      return;
    }
    var hasEmpty = tableau.some(function (col) { return col.length === 0; });
    if (hasEmpty) {
      window.ArcadeCommon.toast("Cannot deal while a column is empty");
      return;
    }
    var count = Math.min(NUM_COLUMNS, stock.length);
    for (var i = 0; i < count; i++) {
      var card = stock.pop();
      card.faceUp = true;
      tableau[i].push(card);
    }
    moves++;
    checkCompletedRuns();
    refreshHud();
    render();
    checkWin();
  }

  function checkWin() {
    if (completedRuns >= 4 && !won) {
      won = true;
      var improved = window.ArcadeCommon.setBestLowerIsBetter(GAME_ID, moves);
      resultBanner.innerHTML = '<span class="overlay-win">' + window.ArcadeI18n.t("common.youWin") +
        " — " + moves + " " + window.ArcadeI18n.t("common.moves") + (improved ? " 🏆" : "") + "</span>";
      refreshHud();
    }
  }

  restartBtn.addEventListener("click", newGame);
  dealBtn.addEventListener("click", dealBatch);
  newGame();
})();
