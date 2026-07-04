(function () {
  var GAME_ID = "roulette-lite";
  var CHIPS_KEY = "arcade.chips." + GAME_ID;
  var resultNumberEl = document.getElementById("result-number");
  var statusLine = document.getElementById("status-line");
  var chipsEl = document.getElementById("chips");
  var bestEl = document.getElementById("best");
  var betTypeBtns = document.querySelectorAll(".bet-type-btn");
  var numberRow = document.getElementById("number-row");
  var numberPick = document.getElementById("number-pick");
  var betInput = document.getElementById("bet-amount");
  var spinBtn = document.getElementById("spin-btn");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");

  var RED_NUMBERS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];

  var chips = 100;
  var betType = "red";
  var spinning = false;

  function isRed(n) { return RED_NUMBERS.indexOf(n) !== -1; }
  function isBlack(n) { return n !== 0 && !isRed(n); }
  function colorOf(n) { return n === 0 ? "green" : (isRed(n) ? "red" : "black"); }

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

  betTypeBtns.forEach(function (btn) {
    btn.addEventListener("click", function () {
      betTypeBtns.forEach(function (b) { b.classList.remove("active"); });
      btn.classList.add("active");
      betType = btn.getAttribute("data-type");
      numberRow.style.display = betType === "number" ? "flex" : "none";
    });
  });

  function spin() {
    if (spinning) return;
    var bet = parseInt(betInput.value, 10);
    if (isNaN(bet) || bet < 1) {
      window.ArcadeCommon.toast("Enter a valid bet amount");
      return;
    }
    if (bet > chips) {
      window.ArcadeCommon.toast("Not enough chips for that bet");
      return;
    }
    var chosenNumber = null;
    if (betType === "number") {
      chosenNumber = parseInt(numberPick.value, 10);
      if (isNaN(chosenNumber) || chosenNumber < 0 || chosenNumber > 36) {
        window.ArcadeCommon.toast("Pick a number between 0 and 36");
        return;
      }
    }

    spinning = true;
    spinBtn.disabled = true;
    resultBanner.innerHTML = "";
    statusLine.textContent = "Spinning...";

    var frames = 0;
    var anim = setInterval(function () {
      resultNumberEl.textContent = window.ArcadeCommon.randInt(0, 36);
      frames++;
      if (frames > 14) {
        clearInterval(anim);
        finishSpin(bet, chosenNumber);
      }
    }, 90);
  }

  function finishSpin(bet, chosenNumber) {
    var landed = window.ArcadeCommon.randInt(0, 36);
    resultNumberEl.textContent = landed;
    var color = colorOf(landed);
    resultNumberEl.style.color = color === "red" ? "#ff5d5d" : (color === "black" ? "#eef0fb" : "#3ddc84");
    resultNumberEl.style.borderColor = color === "red" ? "#ff5d5d" : (color === "black" ? "#555" : "#3ddc84");

    var win = false;
    var winAmount = 0;
    if (betType === "red" && isRed(landed)) { win = true; winAmount = bet * 1; }
    else if (betType === "black" && isBlack(landed)) { win = true; winAmount = bet * 1; }
    else if (betType === "odd" && landed !== 0 && landed % 2 === 1) { win = true; winAmount = bet * 1; }
    else if (betType === "even" && landed !== 0 && landed % 2 === 0) { win = true; winAmount = bet * 1; }
    else if (betType === "number" && landed === chosenNumber) { win = true; winAmount = bet * 35; }

    statusLine.textContent = "Ball landed on " + landed + " (" + color + ")";

    if (win) {
      chips += winAmount;
      resultBanner.innerHTML = '<span class="overlay-win">' + window.ArcadeI18n.t("common.youWin") + " +" + winAmount + " chips!</span>";
    } else {
      chips -= bet;
      resultBanner.innerHTML = '<span class="overlay-lose">' + window.ArcadeI18n.t("common.youLose") + " -" + bet + " chips</span>";
    }
    if (chips < 0) chips = 0;
    saveChips();
    refreshHud();
    spinning = false;
    spinBtn.disabled = false;

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
    statusLine.textContent = "Place your bet, then spin.";
    resultNumberEl.textContent = "?";
    resultNumberEl.style.color = "";
    resultNumberEl.style.borderColor = "";
  }

  spinBtn.addEventListener("click", spin);
  restartBtn.addEventListener("click", resetChips);

  loadChips();
  refreshHud();
})();
