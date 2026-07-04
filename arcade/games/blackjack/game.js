(function () {
  var GAME_ID = "blackjack";
  var CHIPS_KEY = "arcade.chips.blackjack";
  var dealerHandEl = document.getElementById("dealer-hand");
  var playerHandEl = document.getElementById("player-hand");
  var dealerTotalEl = document.getElementById("dealer-total");
  var playerTotalEl = document.getElementById("player-total");
  var chipsEl = document.getElementById("chips");
  var betEl = document.getElementById("bet");
  var betDisplayEl = document.getElementById("bet-display");
  var bestEl = document.getElementById("best");
  var resultBanner = document.getElementById("result-banner");
  var betRow = document.getElementById("bet-row");
  var playRow = document.getElementById("play-row");
  var betDownBtn = document.getElementById("bet-down");
  var betUpBtn = document.getElementById("bet-up");
  var dealBtn = document.getElementById("deal-btn");
  var hitBtn = document.getElementById("hit-btn");
  var standBtn = document.getElementById("stand-btn");
  var restartBtn = document.getElementById("restart");

  var SUITS = ["♠", "♥", "♦", "♣"];
  var RANK_LABELS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

  var chips, bet, deck, playerHand, dealerHand, state;

  function isRed(card) { return card.suit === "♥" || card.suit === "♦"; }
  function label(card) { return RANK_LABELS[card.rank - 1] + card.suit; }

  function loadChips() {
    var v = null;
    try { v = localStorage.getItem(CHIPS_KEY); } catch (e) {}
    return v === null ? 100 : Number(v);
  }
  function saveChips() {
    try { localStorage.setItem(CHIPS_KEY, String(chips)); } catch (e) {}
    window.ArcadeCommon.setBest(GAME_ID, chips);
  }

  function buildDeck() {
    var d = [];
    SUITS.forEach(function (s) {
      for (var r = 1; r <= 13; r++) d.push({ suit: s, rank: r });
    });
    return window.ArcadeCommon.shuffle(d);
  }

  function cardValue(card) {
    if (card.rank === 1) return 11;
    if (card.rank >= 11) return 10;
    return card.rank;
  }

  function handValue(cards) {
    var sum = 0, aces = 0;
    cards.forEach(function (c) {
      sum += cardValue(c);
      if (c.rank === 1) aces++;
    });
    while (sum > 21 && aces > 0) { sum -= 10; aces--; }
    return sum;
  }

  function isBlackjack(cards) { return cards.length === 2 && handValue(cards) === 21; }

  function refreshHud() {
    chipsEl.textContent = chips;
    betEl.textContent = bet;
    betDisplayEl.textContent = bet;
    var best = window.ArcadeCommon.getBest(GAME_ID);
    bestEl.textContent = best === null ? chips : best;
  }

  function renderHand(el, cards, hideSecond) {
    el.innerHTML = "";
    cards.forEach(function (card, i) {
      var cardEl = document.createElement("div");
      if (hideSecond && i === 1) {
        cardEl.className = "bj-card back";
        cardEl.textContent = "";
      } else {
        cardEl.className = "bj-card" + (isRed(card) ? " red" : "");
        cardEl.textContent = label(card);
      }
      el.appendChild(cardEl);
    });
  }

  function render(hideDealerHole) {
    renderHand(playerHandEl, playerHand, false);
    renderHand(dealerHandEl, dealerHand, hideDealerHole);
    playerTotalEl.textContent = "Total: " + handValue(playerHand);
    dealerTotalEl.textContent = hideDealerHole ? "Total: ?" : "Total: " + handValue(dealerHand);
    refreshHud();
  }

  function setBet(delta) {
    if (state !== "betting") return;
    var next = bet + delta;
    next = Math.min(next, chips);
    next = Math.max(next, Math.min(5, chips));
    bet = next;
    refreshHud();
  }

  function startBettingPhase() {
    state = "betting";
    playerHand = [];
    dealerHand = [];
    betRow.style.display = "flex";
    playRow.style.display = "none";
    resultBanner.innerHTML = "";
    if (bet > chips) bet = Math.max(5, chips);
    if (chips <= 0) {
      resultBanner.innerHTML = '<span class="overlay-lose">Out of chips! Use Reset Chips to play again.</span>';
      dealBtn.disabled = true;
      betDownBtn.disabled = true;
      betUpBtn.disabled = true;
    } else {
      dealBtn.disabled = false;
      betDownBtn.disabled = false;
      betUpBtn.disabled = false;
    }
    playerTotalEl.textContent = "";
    dealerTotalEl.textContent = "";
    dealerHandEl.innerHTML = "";
    playerHandEl.innerHTML = "";
    refreshHud();
  }

  function deal() {
    if (state !== "betting" || chips <= 0) return;
    if (bet > chips) bet = chips;
    chips -= bet;
    deck = buildDeck();
    playerHand = [deck.pop(), deck.pop()];
    dealerHand = [deck.pop(), deck.pop()];
    state = "playing";
    betRow.style.display = "none";
    playRow.style.display = "flex";
    resultBanner.innerHTML = "";

    if (isBlackjack(playerHand)) {
      render(true);
      resolveRound();
      return;
    }
    render(true);
  }

  function hit() {
    if (state !== "playing") return;
    playerHand.push(deck.pop());
    if (handValue(playerHand) > 21) {
      render(true);
      resolveRound();
    } else {
      render(true);
    }
  }

  function stand() {
    if (state !== "playing") return;
    resolveRound();
  }

  function resolveRound() {
    state = "dealer";
    var playerTotal = handValue(playerHand);
    var playerBust = playerTotal > 21;
    var playerBJ = isBlackjack(playerHand);

    if (!playerBust) {
      while (handValue(dealerHand) < 17) {
        dealerHand.push(deck.pop());
      }
    }
    var dealerTotal = handValue(dealerHand);
    var dealerBust = dealerTotal > 21;
    var dealerBJ = isBlackjack(dealerHand);

    render(false);

    var msg, cls;
    if (playerBust) {
      msg = window.ArcadeI18n.t("common.youLose") + " — Bust! (" + playerTotal + ")";
      cls = "overlay-lose";
    } else if (playerBJ && dealerBJ) {
      chips += bet;
      msg = window.ArcadeI18n.t("common.tie") + " — both blackjack";
      cls = "overlay-win";
    } else if (playerBJ) {
      var payout = Math.round(bet * 2.5);
      chips += payout;
      msg = "Blackjack! You win " + Math.round(bet * 1.5) + " chips";
      cls = "overlay-win";
    } else if (dealerBJ) {
      msg = window.ArcadeI18n.t("common.youLose") + " — Dealer blackjack";
      cls = "overlay-lose";
    } else if (dealerBust) {
      chips += bet * 2;
      msg = window.ArcadeI18n.t("common.youWin") + " — Dealer busts (" + dealerTotal + ")";
      cls = "overlay-win";
    } else if (playerTotal > dealerTotal) {
      chips += bet * 2;
      msg = window.ArcadeI18n.t("common.youWin") + " — " + playerTotal + " to " + dealerTotal;
      cls = "overlay-win";
    } else if (playerTotal < dealerTotal) {
      msg = window.ArcadeI18n.t("common.youLose") + " — " + playerTotal + " to " + dealerTotal;
      cls = "overlay-lose";
    } else {
      chips += bet;
      msg = window.ArcadeI18n.t("common.tie") + " — " + playerTotal + " to " + dealerTotal;
      cls = "overlay-win";
    }

    resultBanner.innerHTML = '<span class="' + cls + '">' + msg + "</span>";
    saveChips();
    refreshHud();
    playRow.style.display = "none";
    setTimeout(startBettingPhase, 1600);
  }

  function resetChips() {
    chips = 100;
    bet = 10;
    try { localStorage.removeItem(CHIPS_KEY); } catch (e) {}
    saveChips();
    startBettingPhase();
  }

  betDownBtn.addEventListener("click", function () { setBet(-5); });
  betUpBtn.addEventListener("click", function () { setBet(5); });
  dealBtn.addEventListener("click", deal);
  hitBtn.addEventListener("click", hit);
  standBtn.addEventListener("click", stand);
  restartBtn.addEventListener("click", resetChips);

  chips = loadChips();
  bet = Math.min(10, Math.max(5, chips || 5));
  startBettingPhase();
})();
