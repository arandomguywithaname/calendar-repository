(function () {
  var GAME_ID = "war-card-game";
  var playerCardEl = document.getElementById("player-card");
  var cpuCardEl = document.getElementById("cpu-card");
  var playerCountEl = document.getElementById("player-count");
  var cpuCountEl = document.getElementById("cpu-count");
  var bestEl = document.getElementById("best");
  var logEl = document.getElementById("war-log");
  var resultBanner = document.getElementById("result-banner");
  var playBtn = document.getElementById("play-round");
  var restartBtn = document.getElementById("restart");

  var SUITS = ["♠", "♥", "♦", "♣"];
  var RANK_LABELS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  var ROUND_CAP = 500;

  var playerDeck, cpuDeck, over, roundCount;

  function isRed(card) { return card.suit === "♥" || card.suit === "♦"; }
  function label(card) { return RANK_LABELS[card.rank - 1] + card.suit; }
  function warValue(card) { return card.rank === 1 ? 14 : card.rank; }

  function buildDeck() {
    var d = [];
    SUITS.forEach(function (s) {
      for (var r = 1; r <= 13; r++) d.push({ suit: s, rank: r });
    });
    return window.ArcadeCommon.shuffle(d);
  }

  function refreshHud() {
    playerCountEl.textContent = playerDeck.length;
    cpuCountEl.textContent = cpuDeck.length;
    var best = window.ArcadeCommon.getBest(GAME_ID);
    bestEl.textContent = best === null ? 0 : best;
  }

  function newGame() {
    var deck = buildDeck();
    playerDeck = deck.slice(0, 26);
    cpuDeck = deck.slice(26);
    over = false;
    roundCount = 0;
    resultBanner.innerHTML = "";
    logEl.textContent = "Press Play Round to begin.";
    playerCardEl.className = "war-card empty";
    playerCardEl.textContent = "🂠";
    cpuCardEl.className = "war-card empty";
    cpuCardEl.textContent = "🂠";
    refreshHud();
  }

  function showCard(el, card) {
    el.className = "war-card" + (isRed(card) ? " red" : "");
    el.textContent = label(card);
  }

  function playRound() {
    if (over) return;
    if (playerDeck.length === 0 || cpuDeck.length === 0) { checkEnd(); return; }
    roundCount++;
    var events = [];
    var pCard = playerDeck.shift();
    var cCard = cpuDeck.shift();
    showCard(playerCardEl, pCard);
    showCard(cpuCardEl, cCard);
    var pot = [pCard, cCard];
    resolve(pCard, cCard, pot, events, 0);
  }

  function resolve(pCard, cCard, pot, events, warDepth) {
    var pVal = warValue(pCard), cVal = warValue(cCard);
    if (pVal > cVal) {
      playerDeck = playerDeck.concat(pot);
      events.push("You win the round with " + label(pCard) + " vs " + label(cCard) + (warDepth ? " after war" : ""));
    } else if (cVal > pVal) {
      cpuDeck = cpuDeck.concat(pot);
      events.push("CPU wins the round with " + label(cCard) + " vs " + label(pCard) + (warDepth ? " after war" : ""));
    } else {
      events.push("Tie (" + label(pCard) + " vs " + label(cCard) + ") — War!");
      if (playerDeck.length < 4 || cpuDeck.length < 4) {
        if (playerDeck.length <= cpuDeck.length) {
          cpuDeck = cpuDeck.concat(pot, playerDeck);
          playerDeck = [];
          events.push("You don't have enough cards for war — CPU takes the pot");
        } else {
          playerDeck = playerDeck.concat(pot, cpuDeck);
          cpuDeck = [];
          events.push("CPU doesn't have enough cards for war — you take the pot");
        }
        finishRound(events);
        return;
      }
      var pDown = [playerDeck.shift(), playerDeck.shift(), playerDeck.shift()];
      var cDown = [cpuDeck.shift(), cpuDeck.shift(), cpuDeck.shift()];
      var pUp = playerDeck.shift();
      var cUp = cpuDeck.shift();
      var newPot = pot.concat(pDown, cDown, [pUp, cUp]);
      showCard(playerCardEl, pUp);
      showCard(cpuCardEl, cUp);
      resolve(pUp, cUp, newPot, events, warDepth + 1);
      return;
    }
    finishRound(events);
  }

  function finishRound(events) {
    logEl.textContent = events[events.length - 1] + " (Round " + roundCount + ")";
    refreshHud();
    checkEnd();
  }

  function checkEnd() {
    if (playerDeck.length === 52) {
      endGame(window.ArcadeI18n.t("common.youWin"), "overlay-win");
    } else if (cpuDeck.length === 52) {
      endGame(window.ArcadeI18n.t("common.youLose"), "overlay-lose");
    } else if (roundCount >= ROUND_CAP) {
      if (playerDeck.length > cpuDeck.length) endGame(window.ArcadeI18n.t("common.youWin") + " (round cap)", "overlay-win");
      else if (cpuDeck.length > playerDeck.length) endGame(window.ArcadeI18n.t("common.youLose") + " (round cap)", "overlay-lose");
      else endGame(window.ArcadeI18n.t("common.tie") + " (round cap)", "overlay-win");
    }
  }

  function endGame(msg, cls) {
    over = true;
    var improved = window.ArcadeCommon.setBest(GAME_ID, playerDeck.length);
    resultBanner.innerHTML = '<span class="' + cls + '">' + msg + (improved ? " 🏆" : "") + "</span>";
    refreshHud();
  }

  playBtn.addEventListener("click", playRound);
  restartBtn.addEventListener("click", newGame);
  newGame();
})();
