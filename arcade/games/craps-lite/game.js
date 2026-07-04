(function () {
  var GAME_ID = "craps-lite";
  var CHIPS_KEY = "arcade.chips." + GAME_ID;
  var die1El = document.getElementById("die1");
  var die2El = document.getElementById("die2");
  var pointLine = document.getElementById("point-line");
  var chipsEl = document.getElementById("chips");
  var bestEl = document.getElementById("best");
  var betInput = document.getElementById("bet-amount");
  var rollBtn = document.getElementById("roll-btn");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");

  var DICE_FACES = ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

  var chips = 100;
  var phase = "comeout"; // comeout | point
  var point = null;
  var currentBet = 0;
  var rolling = false;

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

  function roll() {
    if (rolling) return;

    if (phase === "comeout") {
      var bet = parseInt(betInput.value, 10);
      if (isNaN(bet) || bet < 1) {
        window.ArcadeCommon.toast("Enter a valid bet amount");
        return;
      }
      if (bet > chips) {
        window.ArcadeCommon.toast("Not enough chips for that bet");
        return;
      }
      currentBet = bet;
    }

    rolling = true;
    rollBtn.disabled = true;
    betInput.disabled = true;
    resultBanner.innerHTML = "";

    var frames = 0;
    var anim = setInterval(function () {
      die1El.textContent = DICE_FACES[window.ArcadeCommon.randInt(1, 6)];
      die2El.textContent = DICE_FACES[window.ArcadeCommon.randInt(1, 6)];
      frames++;
      if (frames > 8) {
        clearInterval(anim);
        resolveRoll();
      }
    }, 80);
  }

  function resolveRoll() {
    var d1 = window.ArcadeCommon.randInt(1, 6);
    var d2 = window.ArcadeCommon.randInt(1, 6);
    die1El.textContent = DICE_FACES[d1];
    die2El.textContent = DICE_FACES[d2];
    var total = d1 + d2;

    if (phase === "comeout") {
      if (total === 7 || total === 11) {
        pointLine.textContent = "Rolled " + total + " — natural! You win.";
        settle(true);
      } else if (total === 2 || total === 3 || total === 12) {
        pointLine.textContent = "Rolled " + total + " — craps! You lose.";
        settle(false);
      } else {
        point = total;
        phase = "point";
        pointLine.textContent = "Point is " + point + ". Roll again to hit " + point + " (win) before a 7 (lose).";
        rollBtn.textContent = "Roll";
        rolling = false;
        rollBtn.disabled = false;
      }
    } else {
      // point phase
      if (total === point) {
        pointLine.textContent = "Rolled " + total + " — hit the point! You win.";
        settle(true);
      } else if (total === 7) {
        pointLine.textContent = "Rolled 7 — seven out. You lose.";
        settle(false);
      } else {
        pointLine.textContent = "Rolled " + total + ". Point is still " + point + ". Roll again.";
        rolling = false;
        rollBtn.disabled = false;
      }
    }
  }

  function settle(win) {
    if (win) {
      chips += currentBet;
      resultBanner.innerHTML = '<span class="overlay-win">' + window.ArcadeI18n.t("common.youWin") + " +" + currentBet + " chips!</span>";
    } else {
      chips -= currentBet;
      resultBanner.innerHTML = '<span class="overlay-lose">' + window.ArcadeI18n.t("common.youLose") + " -" + currentBet + " chips</span>";
    }
    if (chips < 0) chips = 0;
    saveChips();
    refreshHud();

    phase = "comeout";
    point = null;
    currentBet = 0;
    rolling = false;
    rollBtn.disabled = false;
    rollBtn.textContent = "Roll (Come Out)";
    betInput.disabled = false;

    if (chips <= 0) {
      resultBanner.innerHTML += '<div class="instructions">You are out of chips! <button class="btn btn-primary" id="reset-chips-inline">Reset to 100</button></div>';
      var resetBtn = document.getElementById("reset-chips-inline");
      if (resetBtn) resetBtn.addEventListener("click", resetChips);
    }
  }

  function resetChips() {
    chips = 100;
    saveChips();
    refreshHud();
    resultBanner.innerHTML = "";
    phase = "comeout";
    point = null;
    currentBet = 0;
    rollBtn.textContent = "Roll (Come Out)";
    betInput.disabled = false;
    pointLine.textContent = "Make a pass line bet to begin.";
    die1El.textContent = "🎲";
    die2El.textContent = "🎲";
  }

  rollBtn.addEventListener("click", roll);
  restartBtn.addEventListener("click", resetChips);

  loadChips();
  refreshHud();
})();
