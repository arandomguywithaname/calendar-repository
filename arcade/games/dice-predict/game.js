(function () {
  var GAME_ID = "dice-predict";
  var CHIPS_KEY = "arcade.chips." + GAME_ID;
  var die1El = document.getElementById("die1");
  var die2El = document.getElementById("die2");
  var totalLine = document.getElementById("total-line");
  var chipsEl = document.getElementById("chips");
  var bestEl = document.getElementById("best");
  var numberGrid = document.getElementById("number-grid");
  var betInput = document.getElementById("bet-amount");
  var rollBtn = document.getElementById("roll-btn");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");

  var DICE_FACES = ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];
  // payout multiplier per total, set below true fair odds (36/ways) for house edge.
  var PAYOUTS = {
    2: 30, 3: 15, 4: 10, 5: 8, 6: 6, 7: 5, 8: 6, 9: 8, 10: 10, 11: 15, 12: 30
  };

  var chips = 100;
  var selectedTotal = null;
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

  function renderGrid() {
    numberGrid.innerHTML = "";
    for (var n = 2; n <= 12; n++) {
      (function (num) {
        var cell = document.createElement("div");
        cell.className = "cell" + (selectedTotal === num ? "" : "");
        cell.style.fontSize = "0.85rem";
        cell.style.flexDirection = "column";
        cell.style.height = "56px";
        cell.innerHTML = "<div style='font-size:1.1rem;font-weight:800;'>" + num + "</div><div style='font-size:0.65rem;'>" + PAYOUTS[num] + "x</div>";
        if (selectedTotal === num) {
          cell.style.background = "linear-gradient(135deg, var(--accent), var(--accent-2))";
          cell.style.color = "#fff";
        }
        cell.addEventListener("click", function () {
          if (rolling) return;
          selectedTotal = num;
          renderGrid();
        });
        numberGrid.appendChild(cell);
      })(n);
    }
  }

  function roll() {
    if (rolling) return;
    if (selectedTotal === null) {
      window.ArcadeCommon.toast("Pick a total first!");
      return;
    }
    var bet = parseInt(betInput.value, 10);
    if (isNaN(bet) || bet < 1) {
      window.ArcadeCommon.toast("Enter a valid bet amount");
      return;
    }
    if (bet > chips) {
      window.ArcadeCommon.toast("You don't have enough chips for that bet");
      return;
    }

    rolling = true;
    rollBtn.disabled = true;
    resultBanner.innerHTML = "";
    totalLine.textContent = "Rolling...";

    var frames = 0;
    var spin = setInterval(function () {
      die1El.textContent = DICE_FACES[window.ArcadeCommon.randInt(1, 6)];
      die2El.textContent = DICE_FACES[window.ArcadeCommon.randInt(1, 6)];
      frames++;
      if (frames > 8) {
        clearInterval(spin);
        finishRoll(bet);
      }
    }, 80);
  }

  function finishRoll(bet) {
    var d1 = window.ArcadeCommon.randInt(1, 6);
    var d2 = window.ArcadeCommon.randInt(1, 6);
    die1El.textContent = DICE_FACES[d1];
    die2El.textContent = DICE_FACES[d2];
    var total = d1 + d2;
    totalLine.textContent = "Rolled " + d1 + " + " + d2 + " = " + total;

    if (total === selectedTotal) {
      var winAmount = bet * PAYOUTS[total];
      chips += winAmount;
      resultBanner.innerHTML = '<span class="overlay-win">' + window.ArcadeI18n.t("common.youWin") + " +" + winAmount + " chips!</span>";
    } else {
      chips -= bet;
      resultBanner.innerHTML = '<span class="overlay-lose">' + window.ArcadeI18n.t("common.youLose") + " -" + bet + " chips</span>";
    }
    if (chips < 0) chips = 0;
    saveChips();
    refreshHud();
    rolling = false;
    rollBtn.disabled = false;

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
    totalLine.textContent = "Pick a total and place your bet.";
    die1El.textContent = "🎲";
    die2El.textContent = "🎲";
  }

  rollBtn.addEventListener("click", roll);
  restartBtn.addEventListener("click", resetChips);

  loadChips();
  renderGrid();
  refreshHud();
})();
