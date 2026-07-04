(function () {
  var GAME_ID = "slot-machine";
  var CHIPS_KEY = "arcade.chips." + GAME_ID;
  var reel1 = document.getElementById("reel1");
  var reel2 = document.getElementById("reel2");
  var reel3 = document.getElementById("reel3");
  var chipsEl = document.getElementById("chips");
  var bestEl = document.getElementById("best");
  var payoutLine = document.getElementById("payout-line");
  var betInput = document.getElementById("bet-amount");
  var spinBtn = document.getElementById("spin-btn");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");

  // symbol -> { weight, tripleMultiplier }
  var SYMBOLS = [
    { icon: "🍒", weight: 30, triple: 5 },
    { icon: "🍋", weight: 25, triple: 8 },
    { icon: "🔔", weight: 20, triple: 15 },
    { icon: "7️⃣", weight: 15, triple: 25 },
    { icon: "💎", weight: 10, triple: 50 }
  ];
  var TOTAL_WEIGHT = SYMBOLS.reduce(function (s, x) { return s + x.weight; }, 0);
  var PAIR_MULTIPLIER = 2;

  var chips = 100;
  var spinning = false;

  function loadChips() {
    try {
      var v = localStorage.getItem(CHIPS_KEY);
      chips = v === null ? 100 : Number(v);
    } catch (e) { chips = 100; }
  }
  function saveChips() {
    try { localStorage.setItem(CHIPS_KEY, String(chips)); } catch (e) {}
  }

  function refreshHud() {
    chipsEl.textContent = chips;
    var best = window.ArcadeCommon.getBest(GAME_ID);
    if (best === null || chips > best) { window.ArcadeCommon.setBest(GAME_ID, chips); best = chips; }
    bestEl.textContent = best;
  }

  function weightedSymbol() {
    var r = Math.random() * TOTAL_WEIGHT;
    var acc = 0;
    for (var i = 0; i < SYMBOLS.length; i++) {
      acc += SYMBOLS[i].weight;
      if (r < acc) return SYMBOLS[i];
    }
    return SYMBOLS[SYMBOLS.length - 1];
  }

  function symbolByIcon(icon) {
    for (var i = 0; i < SYMBOLS.length; i++) {
      if (SYMBOLS[i].icon === icon) return SYMBOLS[i];
    }
    return null;
  }

  function spin() {
    if (spinning) return;
    var bet = parseInt(betInput.value, 10);
    if (isNaN(bet) || bet < 1) {
      window.ArcadeCommon.toast("Enter a valid bet amount");
      return;
    }
    if (bet > chips) {
      window.ArcadeCommon.toast("Not enough credits for that bet");
      return;
    }

    spinning = true;
    spinBtn.disabled = true;
    resultBanner.innerHTML = "";
    payoutLine.textContent = "Spinning...";

    var frames = 0;
    var spinAnim = setInterval(function () {
      reel1.textContent = window.ArcadeCommon.pick(SYMBOLS).icon;
      reel2.textContent = window.ArcadeCommon.pick(SYMBOLS).icon;
      reel3.textContent = window.ArcadeCommon.pick(SYMBOLS).icon;
      frames++;
      if (frames > 10) {
        clearInterval(spinAnim);
        finishSpin(bet);
      }
    }, 80);
  }

  function finishSpin(bet) {
    var s1 = weightedSymbol(), s2 = weightedSymbol(), s3 = weightedSymbol();
    reel1.textContent = s1.icon;
    reel2.textContent = s2.icon;
    reel3.textContent = s3.icon;

    var icons = [s1.icon, s2.icon, s3.icon];
    var winAmount = 0;
    if (s1.icon === s2.icon && s2.icon === s3.icon) {
      winAmount = bet * s1.triple;
      payoutLine.textContent = "Triple " + s1.icon + "!";
    } else if (icons[0] === icons[1] || icons[1] === icons[2] || icons[0] === icons[2]) {
      winAmount = bet * PAIR_MULTIPLIER;
      payoutLine.textContent = "Pair match!";
    } else {
      payoutLine.textContent = "No match.";
    }

    if (winAmount > 0) {
      chips += winAmount;
      resultBanner.innerHTML = '<span class="overlay-win">' + window.ArcadeI18n.t("common.youWin") + " +" + winAmount + " credits!</span>";
    } else {
      chips -= bet;
      resultBanner.innerHTML = '<span class="overlay-lose">' + window.ArcadeI18n.t("common.youLose") + " -" + bet + " credits</span>";
    }
    if (chips < 0) chips = 0;
    saveChips();
    refreshHud();
    spinning = false;
    spinBtn.disabled = false;

    if (chips <= 0) {
      resultBanner.innerHTML += '<div class="instructions">You\'re out of credits! <button class="btn btn-primary" id="reset-chips-inline">Reset to 100</button></div>';
      var resetBtn = document.getElementById("reset-chips-inline");
      if (resetBtn) resetBtn.addEventListener("click", resetChips);
    }
  }

  function resetChips() {
    chips = 100;
    saveChips();
    refreshHud();
    resultBanner.innerHTML = "";
    payoutLine.textContent = "Spin to win!";
    reel1.textContent = "🍒";
    reel2.textContent = "🍋";
    reel3.textContent = "🔔";
  }

  spinBtn.addEventListener("click", spin);
  restartBtn.addEventListener("click", resetChips);

  loadChips();
  refreshHud();
})();
