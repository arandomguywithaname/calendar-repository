(function () {
  var GAME_ID = "poker-draw";
  var cpuHandEl = document.getElementById("cpu-hand");
  var playerHandEl = document.getElementById("player-hand");
  var cpuHandNameEl = document.getElementById("cpu-hand-name");
  var playerHandNameEl = document.getElementById("player-hand-name");
  var winsEl = document.getElementById("wins");
  var lossesEl = document.getElementById("losses");
  var tiesEl = document.getElementById("ties");
  var resultBanner = document.getElementById("result-banner");
  var drawBtn = document.getElementById("draw-btn");
  var restartBtn = document.getElementById("restart");

  var SUITS = ["♠", "♥", "♦", "♣"];
  var RANK_LABELS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  var HAND_NAMES = ["High Card", "Pair", "Two Pair", "Three of a Kind", "Straight", "Flush",
    "Full House", "Four of a Kind", "Straight Flush"];

  var stats = { wins: 0, losses: 0, ties: 0 };
  var deck, playerHand, cpuHand, selected, phase;

  function isRed(card) { return card.suit === "♥" || card.suit === "♦"; }
  function label(card) { return RANK_LABELS[card.rank - 1] + card.suit; }

  function loadStats() {
    try { stats = JSON.parse(localStorage.getItem("arcade.stats." + GAME_ID)) || stats; } catch (e) {}
  }
  function saveStats() {
    try { localStorage.setItem("arcade.stats." + GAME_ID, JSON.stringify(stats)); } catch (e) {}
    winsEl.textContent = stats.wins;
    lossesEl.textContent = stats.losses;
    tiesEl.textContent = stats.ties;
  }

  function buildDeck() {
    var d = [];
    SUITS.forEach(function (s) {
      for (var r = 1; r <= 13; r++) d.push({ suit: s, rank: r });
    });
    return window.ArcadeCommon.shuffle(d);
  }

  function evaluateHand(cards) {
    var values = cards.map(function (c) { return c.rank === 1 ? 14 : c.rank; }).sort(function (a, b) { return b - a; });
    var suits = cards.map(function (c) { return c.suit; });
    var isFlush = suits.every(function (s) { return s === suits[0]; });

    var uniqueVals = [];
    values.forEach(function (v) { if (uniqueVals.indexOf(v) === -1) uniqueVals.push(v); });
    uniqueVals.sort(function (a, b) { return b - a; });
    var isStraight = false, straightHigh = null;
    if (uniqueVals.length === 5) {
      if (uniqueVals[0] - uniqueVals[4] === 4) {
        isStraight = true;
        straightHigh = uniqueVals[0];
      } else if (uniqueVals.join(",") === "14,5,4,3,2") {
        isStraight = true;
        straightHigh = 5;
      }
    }

    var countMap = {};
    values.forEach(function (v) { countMap[v] = (countMap[v] || 0) + 1; });
    var groups = Object.keys(countMap).map(function (v) { return { v: Number(v), c: countMap[v] }; });
    groups.sort(function (a, b) { return b.c !== a.c ? b.c - a.c : b.v - a.v; });

    var rank, tiebreak;
    if (isStraight && isFlush) {
      rank = 8; tiebreak = [straightHigh];
    } else if (groups[0].c === 4) {
      rank = 7; tiebreak = [groups[0].v, groups[1].v];
    } else if (groups[0].c === 3 && groups[1] && groups[1].c === 2) {
      rank = 6; tiebreak = [groups[0].v, groups[1].v];
    } else if (isFlush) {
      rank = 5; tiebreak = values;
    } else if (isStraight) {
      rank = 4; tiebreak = [straightHigh];
    } else if (groups[0].c === 3) {
      rank = 3; tiebreak = [groups[0].v].concat(groups.slice(1).map(function (g) { return g.v; }));
    } else if (groups[0].c === 2 && groups[1] && groups[1].c === 2) {
      var pairVals = [groups[0].v, groups[1].v].sort(function (a, b) { return b - a; });
      rank = 2; tiebreak = pairVals.concat([groups[2].v]);
    } else if (groups[0].c === 2) {
      rank = 1; tiebreak = [groups[0].v].concat(groups.slice(1).map(function (g) { return g.v; }));
    } else {
      rank = 0; tiebreak = values;
    }
    return { rank: rank, tiebreak: tiebreak, name: HAND_NAMES[rank] };
  }

  function compareHands(a, b) {
    if (a.rank !== b.rank) return a.rank - b.rank;
    for (var i = 0; i < a.tiebreak.length; i++) {
      var diff = (a.tiebreak[i] || 0) - (b.tiebreak[i] || 0);
      if (diff !== 0) return diff;
    }
    return 0;
  }

  function cpuDiscardIndices(hand) {
    var counts = {};
    hand.forEach(function (c) {
      var v = c.rank === 1 ? 14 : c.rank;
      counts[v] = (counts[v] || 0) + 1;
    });
    var keep = [];
    hand.forEach(function (c, i) {
      var v = c.rank === 1 ? 14 : c.rank;
      if (counts[v] >= 2) keep.push(i);
    });
    if (keep.length === 0) {
      var valued = hand.map(function (c, i) { return { i: i, v: c.rank === 1 ? 14 : c.rank }; })
        .sort(function (a, b) { return b.v - a.v; });
      keep = valued.filter(function (x) { return x.v >= 11; }).slice(0, 2).map(function (x) { return x.i; });
      if (keep.length === 0) keep = [valued[0].i];
    }
    var discard = [];
    for (var i = 0; i < hand.length; i++) {
      if (keep.indexOf(i) === -1) discard.push(i);
    }
    return discard;
  }

  function newHand() {
    deck = buildDeck();
    playerHand = deck.splice(0, 5);
    cpuHand = deck.splice(0, 5);
    selected = {};
    phase = "select";
    resultBanner.innerHTML = "";
    playerHandNameEl.textContent = "";
    cpuHandNameEl.textContent = "";
    drawBtn.disabled = false;
    drawBtn.textContent = "Draw";
    render();
  }

  function render() {
    playerHandEl.innerHTML = "";
    playerHand.forEach(function (card, i) {
      var el = document.createElement("div");
      var cls = "pd-card" + (isRed(card) ? " red" : "");
      if (phase === "select") cls += " selectable";
      if (selected[i]) cls += " discarded";
      el.className = cls;
      el.textContent = label(card);
      if (phase === "select") {
        el.addEventListener("click", function () { toggleSelect(i); });
      }
      playerHandEl.appendChild(el);
    });

    cpuHandEl.innerHTML = "";
    cpuHand.forEach(function (card) {
      var el = document.createElement("div");
      if (phase === "done") {
        el.className = "pd-card" + (isRed(card) ? " red" : "");
        el.textContent = label(card);
      } else {
        el.className = "pd-card";
        el.textContent = "🂠";
      }
      cpuHandEl.appendChild(el);
    });
  }

  function toggleSelect(i) {
    if (phase !== "select") return;
    selected[i] = !selected[i];
    render();
  }

  function doDraw() {
    if (phase !== "select") return;
    for (var i = 0; i < playerHand.length; i++) {
      if (selected[i]) {
        if (deck.length === 0) deck = buildDeck().filter(function (c) {
          return !playerHand.concat(cpuHand).some(function (h) { return h.suit === c.suit && h.rank === c.rank; });
        });
        playerHand[i] = deck.shift();
      }
    }
    var cpuDiscard = cpuDiscardIndices(cpuHand);
    cpuDiscard.forEach(function (i) {
      if (deck.length === 0) deck = buildDeck().filter(function (c) {
        return !playerHand.concat(cpuHand).some(function (h) { return h.suit === c.suit && h.rank === c.rank; });
      });
      cpuHand[i] = deck.shift();
    });

    phase = "done";
    drawBtn.disabled = true;

    var playerEval = evaluateHand(playerHand);
    var cpuEval = evaluateHand(cpuHand);
    playerHandNameEl.textContent = playerEval.name;
    cpuHandNameEl.textContent = cpuEval.name;

    var cmp = compareHands(playerEval, cpuEval);
    if (cmp > 0) {
      stats.wins++;
      resultBanner.innerHTML = '<span class="overlay-win">' + window.ArcadeI18n.t("common.youWin") +
        " — " + playerEval.name + " beats " + cpuEval.name + "</span>";
    } else if (cmp < 0) {
      stats.losses++;
      resultBanner.innerHTML = '<span class="overlay-lose">' + window.ArcadeI18n.t("common.youLose") +
        " — " + cpuEval.name + " beats " + playerEval.name + "</span>";
    } else {
      stats.ties++;
      resultBanner.innerHTML = '<span class="overlay-win">' + window.ArcadeI18n.t("common.tie") +
        " — both have " + playerEval.name + "</span>";
    }
    saveStats();
    render();
  }

  drawBtn.addEventListener("click", doDraw);
  restartBtn.addEventListener("click", newHand);

  loadStats();
  saveStats();
  newHand();
})();
