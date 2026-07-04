(function () {
  var GAME_ID = "klondike-solitaire";
  var boardEl = document.getElementById("board");
  var movesEl = document.getElementById("moves");
  var bestEl = document.getElementById("best");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");

  var RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  var SUITS = ["♠", "♥", "♦", "♣"];

  var tableau, foundations, stock, waste, selection, moves, won;

  function isRed(suit) { return suit === "♥" || suit === "♦"; }
  function rankIndex(card) { return RANKS.indexOf(card.rank); }

  function buildDeck() {
    var deck = [];
    SUITS.forEach(function (suit) {
      RANKS.forEach(function (rank) {
        deck.push({ rank: rank, suit: suit, faceUp: false });
      });
    });
    return deck;
  }

  function refreshHud() {
    movesEl.textContent = moves;
    var best = window.ArcadeCommon.getBest(GAME_ID);
    bestEl.textContent = best === null ? "-" : best;
  }

  function newGame() {
    var deck = window.ArcadeCommon.shuffle(buildDeck());
    tableau = [];
    for (var i = 0; i < 7; i++) {
      var col = [];
      for (var j = 0; j <= i; j++) {
        var card = deck.pop();
        card.faceUp = (j === i);
        col.push(card);
      }
      tableau.push(col);
    }
    stock = deck; // remaining 24, face down
    waste = [];
    foundations = { "♠": [], "♥": [], "♦": [], "♣": [] };
    selection = null;
    moves = 0;
    won = false;
    resultBanner.innerHTML = "";
    refreshHud();
    render();
  }

  function makeCardEl(card, selected) {
    var el = document.createElement("div");
    el.className = "card " + (card.faceUp ? (isRed(card.suit) ? "red" : "black") : "face-down");
    if (selected) el.className += " selected";
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

  function isSelected(type, colIndex, index) {
    if (!selection) return false;
    if (selection.type !== type) return false;
    if (type === "tableau") return selection.col === colIndex && index >= selection.index;
    return true;
  }

  function render() {
    boardEl.innerHTML = "";

    // Top row: stock + waste on the left, foundations on the right
    var topRow = document.createElement("div");
    topRow.className = "row top-row";

    var leftGroup = document.createElement("div");
    leftGroup.className = "pile-group";

    var stockEl;
    if (stock.length > 0) {
      stockEl = makeCardEl({ faceUp: false }, false);
    } else {
      stockEl = makeEmptySlot(waste.length ? "↺" : "");
    }
    stockEl.addEventListener("click", onStockClick);
    leftGroup.appendChild(stockEl);

    var wasteEl;
    if (waste.length > 0) {
      var topWaste = waste[waste.length - 1];
      wasteEl = makeCardEl(topWaste, isSelected("waste"));
      wasteEl.addEventListener("click", onWasteClick);
    } else {
      wasteEl = makeEmptySlot("");
    }
    leftGroup.appendChild(wasteEl);

    topRow.appendChild(leftGroup);

    var foundGroup = document.createElement("div");
    foundGroup.className = "pile-group";
    SUITS.forEach(function (suit) {
      var pile = foundations[suit];
      var el;
      if (pile.length > 0) {
        el = makeCardEl(pile[pile.length - 1], false);
      } else {
        el = makeEmptySlot(suit);
      }
      el.addEventListener("click", function () { onFoundationClick(suit); });
      foundGroup.appendChild(el);
    });
    topRow.appendChild(foundGroup);

    boardEl.appendChild(topRow);

    // Tableau columns
    var colsRow = document.createElement("div");
    colsRow.className = "columns-row";
    tableau.forEach(function (col, colIndex) {
      var colEl = document.createElement("div");
      colEl.className = "column";
      if (col.length === 0) {
        var empty = makeEmptySlot("");
        empty.addEventListener("click", function () { onTableauClick(colIndex); });
        colEl.appendChild(empty);
      } else {
        col.forEach(function (card, cardIndex) {
          var selected = card.faceUp && isSelected("tableau", colIndex, cardIndex);
          var cardEl = makeCardEl(card, selected);
          cardEl.addEventListener("click", function (e) {
            e.stopPropagation();
            if (card.faceUp) {
              onTableauCardClick(colIndex, cardIndex);
            } else {
              onTableauClick(colIndex);
            }
          });
          colEl.appendChild(cardEl);
        });
      }
      colsRow.appendChild(colEl);
    });
    boardEl.appendChild(colsRow);
  }

  function onStockClick() {
    if (stock.length > 0) {
      var card = stock.pop();
      card.faceUp = true;
      waste.push(card);
    } else if (waste.length > 0) {
      while (waste.length) {
        var c = waste.pop();
        c.faceUp = false;
        stock.push(c);
      }
    }
    render();
  }

  function onWasteClick() {
    if (waste.length === 0) return;
    if (selection && selection.type === "waste") {
      selection = null;
    } else {
      selection = { type: "waste" };
    }
    render();
  }

  function onTableauCardClick(colIndex, cardIndex) {
    var col = tableau[colIndex];
    if (selection && selection.type === "tableau" && selection.col === colIndex && selection.index === cardIndex) {
      selection = null;
      render();
      return;
    }
    if (!selection) {
      selection = { type: "tableau", col: colIndex, index: cardIndex };
      render();
      return;
    }
    if (selection.type === "tableau" && selection.col === colIndex) {
      // reselect a different card within the same column
      selection = { type: "tableau", col: colIndex, index: cardIndex };
      render();
      return;
    }
    // attempt to move current selection onto this column
    attemptMoveToTableau(colIndex);
  }

  function onTableauClick(colIndex) {
    if (!selection) return;
    if (selection.type === "tableau" && selection.col === colIndex) {
      selection = null;
      render();
      return;
    }
    attemptMoveToTableau(colIndex);
  }

  function canPlaceOnTableau(movingCard, destTop) {
    if (!destTop) return movingCard.rank === "K";
    return rankIndex(movingCard) === rankIndex(destTop) - 1 && isRed(movingCard.suit) !== isRed(destTop.suit);
  }

  function canPlaceOnFoundation(movingCard, pile, suit) {
    if (movingCard.suit !== suit) return false;
    if (pile.length === 0) return movingCard.rank === "A";
    return rankIndex(movingCard) === rankIndex(pile[pile.length - 1]) + 1;
  }

  function flipExposed(colIndex) {
    var col = tableau[colIndex];
    if (col.length > 0 && !col[col.length - 1].faceUp) {
      col[col.length - 1].faceUp = true;
    }
  }

  function attemptMoveToTableau(destColIndex) {
    var destCol = tableau[destColIndex];
    var destTop = destCol.length ? destCol[destCol.length - 1] : null;

    if (selection.type === "waste") {
      var wc = waste[waste.length - 1];
      if (canPlaceOnTableau(wc, destTop)) {
        waste.pop();
        destCol.push(wc);
        moves++;
        selection = null;
        refreshHud();
        render();
      } else {
        window.ArcadeCommon.toast("Can't place that card there");
      }
      return;
    }

    if (selection.type === "tableau") {
      var srcCol = tableau[selection.col];
      var group = srcCol.slice(selection.index);
      if (canPlaceOnTableau(group[0], destTop)) {
        tableau[destColIndex] = destCol.concat(group);
        tableau[selection.col] = srcCol.slice(0, selection.index);
        flipExposed(selection.col);
        moves++;
        selection = null;
        refreshHud();
        render();
        checkWin();
      } else {
        window.ArcadeCommon.toast("Can't place that card there");
      }
    }
  }

  function onFoundationClick(suit) {
    if (!selection) return;
    var pile = foundations[suit];
    var card, cleanup;

    if (selection.type === "waste") {
      card = waste[waste.length - 1];
      cleanup = function () { waste.pop(); };
    } else if (selection.type === "tableau") {
      var col = tableau[selection.col];
      if (selection.index !== col.length - 1) {
        window.ArcadeCommon.toast("Only a single top card can go to a foundation");
        return;
      }
      card = col[col.length - 1];
      cleanup = function () {
        col.pop();
        flipExposed(selection.col);
      };
    } else {
      return;
    }

    if (canPlaceOnFoundation(card, pile, suit)) {
      cleanup();
      pile.push(card);
      moves++;
      selection = null;
      refreshHud();
      render();
      checkWin();
    } else {
      window.ArcadeCommon.toast("Can't place that card on this foundation");
    }
  }

  function checkWin() {
    var total = 0;
    SUITS.forEach(function (s) { total += foundations[s].length; });
    if (total === 52 && !won) {
      won = true;
      var improved = window.ArcadeCommon.setBestLowerIsBetter(GAME_ID, moves);
      resultBanner.innerHTML = '<span class="overlay-win">' + window.ArcadeI18n.t("common.youWin") +
        " — " + moves + " " + window.ArcadeI18n.t("common.moves") + (improved ? " 🏆" : "") + "</span>";
      refreshHud();
    }
  }

  restartBtn.addEventListener("click", newGame);
  newGame();
})();
