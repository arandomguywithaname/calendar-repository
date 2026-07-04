(function () {
  var GAME_ID = "uno-lite";
  var cpuHandEl = document.getElementById("cpu-hand");
  var playerHandEl = document.getElementById("player-hand");
  var discardTopEl = document.getElementById("discard-top");
  var drawPileEl = document.getElementById("draw-pile");
  var winsEl = document.getElementById("wins");
  var lossesEl = document.getElementById("losses");
  var turnIndicatorEl = document.getElementById("turn-indicator");
  var resultBanner = document.getElementById("result-banner");
  var drawBtn = document.getElementById("draw-btn");
  var restartBtn = document.getElementById("restart");

  var COLORS = ["red", "yellow", "green", "blue"];
  var stats = { wins: 0, losses: 0 };
  var drawPile, discardPile, playerHand, cpuHand, turn, over;

  function loadStats() {
    try { stats = JSON.parse(localStorage.getItem("arcade.stats." + GAME_ID)) || stats; } catch (e) {}
  }
  function saveStats() {
    try { localStorage.setItem("arcade.stats." + GAME_ID, JSON.stringify(stats)); } catch (e) {}
    winsEl.textContent = stats.wins;
    lossesEl.textContent = stats.losses;
  }

  function buildDeck() {
    var deck = [];
    COLORS.forEach(function (color) {
      deck.push({ color: color, value: 0 });
      for (var v = 1; v <= 9; v++) deck.push({ color: color, value: v });
      deck.push({ color: color, value: "skip" });
      deck.push({ color: color, value: "draw2" });
    });
    return window.ArcadeCommon.shuffle(deck);
  }

  function cardLabel(card) {
    if (card.value === "skip") return "⛔";
    if (card.value === "draw2") return "+2";
    return String(card.value);
  }

  function canPlay(card, top) {
    return card.color === top.color || card.value === top.value;
  }

  function topCard() { return discardPile[discardPile.length - 1]; }

  function reshuffleIfNeeded() {
    if (drawPile.length === 0) {
      var top = discardPile.pop();
      drawPile = window.ArcadeCommon.shuffle(discardPile);
      discardPile = [top];
    }
  }

  function drawCards(who, n) {
    var hand = who === "player" ? playerHand : cpuHand;
    for (var i = 0; i < n; i++) {
      reshuffleIfNeeded();
      if (drawPile.length === 0) break;
      hand.push(drawPile.pop());
    }
  }

  function refreshHud() {
    turnIndicatorEl.textContent = "Turn: " + (turn === "player" ? "You" : "CPU");
  }

  function newGame() {
    drawPile = buildDeck();
    playerHand = [];
    cpuHand = [];
    for (var i = 0; i < 7; i++) {
      playerHand.push(drawPile.pop());
      cpuHand.push(drawPile.pop());
    }
    discardPile = [];
    var first;
    do {
      if (drawPile.length === 0) drawPile = buildDeck();
      first = drawPile.pop();
    } while (typeof first.value !== "number");
    discardPile.push(first);
    turn = "player";
    over = false;
    resultBanner.innerHTML = "";
    refreshHud();
    render();
  }

  function render() {
    var top = topCard();

    cpuHandEl.innerHTML = "";
    cpuHand.forEach(function () {
      var el = document.createElement("div");
      el.className = "uno-card back";
      el.textContent = "";
      cpuHandEl.appendChild(el);
    });

    discardTopEl.innerHTML = "";
    var topEl = document.createElement("div");
    topEl.className = "uno-card " + top.color;
    topEl.textContent = cardLabel(top);
    discardTopEl.appendChild(topEl);

    drawPileEl.textContent = drawPile.length > 0 ? "🂠" : "";

    playerHandEl.innerHTML = "";
    playerHand.forEach(function (card, i) {
      var el = document.createElement("div");
      var playable = turn === "player" && !over && canPlay(card, top);
      el.className = "uno-card " + card.color + (playable ? " playable" : "");
      el.textContent = cardLabel(card);
      if (playable) el.addEventListener("click", function () { playerPlay(i); });
      playerHandEl.appendChild(el);
    });

    drawBtn.disabled = over || turn !== "player";
    refreshHud();
  }

  function checkWinFor(who) {
    var hand = who === "player" ? playerHand : cpuHand;
    if (hand.length === 0) {
      over = true;
      if (who === "player") {
        stats.wins++;
        resultBanner.innerHTML = '<span class="overlay-win">' + window.ArcadeI18n.t("common.youWin") + "</span>";
      } else {
        stats.losses++;
        resultBanner.innerHTML = '<span class="overlay-lose">' + window.ArcadeI18n.t("common.youLose") + "</span>";
      }
      saveStats();
      return true;
    }
    return false;
  }

  function applyEffectAndAdvance(card, who) {
    if (checkWinFor(who)) { render(); return; }
    var opponent = who === "player" ? "cpu" : "player";
    if (card.value === "skip") {
      window.ArcadeCommon.toast((opponent === "player" ? "You are" : "CPU is") + " skipped!");
      turn = who;
    } else if (card.value === "draw2") {
      drawCards(opponent, 2);
      window.ArcadeCommon.toast((opponent === "player" ? "You draw" : "CPU draws") + " 2 and is skipped!");
      turn = who;
    } else {
      turn = opponent;
    }
    render();
    if (turn === "cpu" && !over) setTimeout(cpuTurn, 700);
  }

  function playerPlay(i) {
    if (over || turn !== "player") return;
    var card = playerHand[i];
    if (!canPlay(card, topCard())) return;
    playerHand.splice(i, 1);
    discardPile.push(card);
    applyEffectAndAdvance(card, "player");
  }

  function playerDraw() {
    if (over || turn !== "player") return;
    drawCards("player", 1);
    turn = "cpu";
    render();
    setTimeout(cpuTurn, 700);
  }

  function cpuTurn() {
    if (over) return;
    var top = topCard();
    var idx = -1;
    for (var i = 0; i < cpuHand.length; i++) {
      if (canPlay(cpuHand[i], top)) { idx = i; break; }
    }
    if (idx === -1) {
      drawCards("cpu", 1);
      turn = "player";
      render();
      return;
    }
    var card = cpuHand[idx];
    cpuHand.splice(idx, 1);
    discardPile.push(card);
    applyEffectAndAdvance(card, "cpu");
  }

  drawBtn.addEventListener("click", playerDraw);
  restartBtn.addEventListener("click", newGame);

  loadStats();
  saveStats();
  newGame();
})();
