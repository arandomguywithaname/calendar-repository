(function () {
  var GAME_ID = "farkle-lite";
  var scoreEl = document.getElementById("score");
  var bestEl = document.getElementById("best");
  var playerTotalEl = document.getElementById("player-total");
  var cpuTotalEl = document.getElementById("cpu-total");
  var turnScoreEl = document.getElementById("turn-score");
  var diceRow = document.getElementById("dice-row");
  var messageEl = document.getElementById("farkle-message");
  var resultBanner = document.getElementById("result-banner");
  var rollBtn = document.getElementById("roll-btn");
  var bankBtn = document.getElementById("bank-btn");
  var restartBtn = document.getElementById("restart");

  var WIN_SCORE = 3000;
  var DICE_FACES = ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

  var playerTotal, cpuTotal, turnScore, diceCount, diceValues, over, turn;

  function refreshHud() {
    scoreEl.textContent = playerTotal;
    bestEl.textContent = window.ArcadeCommon.getBest(GAME_ID) || 0;
    playerTotalEl.textContent = playerTotal;
    cpuTotalEl.textContent = cpuTotal;
    turnScoreEl.textContent = turnScore;
  }

  function rollDice(n) {
    var vals = [];
    for (var i = 0; i < n; i++) vals.push(window.ArcadeCommon.randInt(1, 6));
    return vals;
  }

  // Any die showing a 1 or 5 always scores individually; any die whose face
  // appears 3+ times among the current roll scores as part of that group.
  function analyzeDice(values) {
    var counts = {};
    for (var f = 1; f <= 6; f++) counts[f] = 0;
    values.forEach(function (v) { counts[v]++; });

    var score = 0;
    for (var face = 1; face <= 6; face++) {
      var n = counts[face];
      if (n >= 3) {
        var base = face === 1 ? 1000 : face * 100;
        score += base * Math.pow(2, n - 3);
      } else if (face === 1) {
        score += n * 100;
      } else if (face === 5) {
        score += n * 50;
      }
    }

    var mask = values.map(function (v) {
      return v === 1 || v === 5 || counts[v] >= 3;
    });
    var scoringCount = mask.filter(Boolean).length;
    return { score: score, mask: mask, scoringCount: scoringCount };
  }

  function renderDice(values, mask) {
    diceRow.innerHTML = "";
    values.forEach(function (v, i) {
      var die = document.createElement("div");
      die.className = "cell";
      die.style.width = "56px";
      die.style.height = "56px";
      die.style.fontSize = "2rem";
      die.style.cursor = "default";
      if (mask && mask[i]) {
        die.style.background = "var(--good)";
        die.style.color = "#05131c";
      }
      die.textContent = DICE_FACES[v];
      diceRow.appendChild(die);
    });
  }

  function newGame() {
    playerTotal = 0;
    cpuTotal = 0;
    turnScore = 0;
    diceCount = 6;
    diceValues = [];
    over = false;
    turn = "player";
    resultBanner.innerHTML = "";
    messageEl.textContent = "Your turn — roll the dice!";
    diceRow.innerHTML = "";
    rollBtn.disabled = false;
    bankBtn.disabled = true;
    refreshHud();
  }

  function checkWin() {
    if (playerTotal >= WIN_SCORE) {
      over = true;
      rollBtn.disabled = true;
      bankBtn.disabled = true;
      window.ArcadeCommon.setBest(GAME_ID, playerTotal);
      resultBanner.innerHTML = '<span class="overlay-win">' + window.ArcadeI18n.t("common.youWin") + "</span>";
      refreshHud();
      return true;
    }
    if (cpuTotal >= WIN_SCORE) {
      over = true;
      rollBtn.disabled = true;
      bankBtn.disabled = true;
      window.ArcadeCommon.setBest(GAME_ID, playerTotal);
      resultBanner.innerHTML = '<span class="overlay-lose">' + window.ArcadeI18n.t("common.youLose") + "</span>";
      refreshHud();
      return true;
    }
    return false;
  }

  function playerRoll() {
    if (over || turn !== "player") return;
    diceValues = rollDice(diceCount);
    var result = analyzeDice(diceValues);
    renderDice(diceValues, result.mask);

    if (result.score === 0) {
      messageEl.textContent = "Farkle! You lose your " + turnScore + " turn points.";
      turnScore = 0;
      refreshHud();
      rollBtn.disabled = true;
      bankBtn.disabled = true;
      setTimeout(function () { endPlayerTurn(); }, 1400);
      return;
    }

    turnScore += result.score;
    var remaining = diceCount - result.scoringCount;
    if (remaining === 0) {
      diceCount = 6;
      messageEl.textContent = "Scored " + result.score + "! Hot dice — roll all 6 again.";
    } else {
      diceCount = remaining;
      messageEl.textContent = "Scored " + result.score + ". " + remaining + " dice left to roll.";
    }
    refreshHud();
    rollBtn.disabled = false;
    bankBtn.disabled = false;
  }

  function endPlayerTurn() {
    diceCount = 6;
    diceValues = [];
    diceRow.innerHTML = "";
    turn = "cpu";
    rollBtn.disabled = true;
    bankBtn.disabled = true;
    if (checkWin()) return;
    setTimeout(cpuTurnStep, 900);
  }

  function playerBank() {
    if (over || turn !== "player" || turnScore <= 0) return;
    playerTotal += turnScore;
    messageEl.textContent = "Banked " + turnScore + " points!";
    turnScore = 0;
    diceCount = 6;
    diceValues = [];
    diceRow.innerHTML = "";
    refreshHud();
    rollBtn.disabled = true;
    bankBtn.disabled = true;
    if (checkWin()) return;
    turn = "cpu";
    setTimeout(cpuTurnStep, 900);
  }

  // --- CPU turn: simple threshold heuristic ---
  var cpuTurnScore, cpuDiceCount;

  function cpuTurnStep() {
    if (over) return;
    cpuTurnScore = cpuTurnScore || 0;
    cpuDiceCount = cpuDiceCount || 6;

    var values = rollDice(cpuDiceCount);
    var result = analyzeDice(values);
    renderDice(values, result.mask);

    if (result.score === 0) {
      messageEl.textContent = "CPU rolled a Farkle and lost " + cpuTurnScore + " points.";
      cpuTurnScore = 0;
      cpuDiceCount = 6;
      finishCpuTurn();
      return;
    }

    cpuTurnScore += result.score;
    var remaining = cpuDiceCount - result.scoringCount;
    if (remaining === 0) {
      cpuDiceCount = 6;
    } else {
      cpuDiceCount = remaining;
    }

    var wouldWin = cpuTotal + cpuTurnScore >= WIN_SCORE;
    var bankNow = wouldWin || cpuTurnScore >= 300 || cpuDiceCount <= 1;

    if (bankNow) {
      messageEl.textContent = "CPU banked " + cpuTurnScore + " points.";
      cpuTotal += cpuTurnScore;
      cpuTurnScore = 0;
      cpuDiceCount = 6;
      refreshHud();
      finishCpuTurn();
    } else {
      messageEl.textContent = "CPU scored " + result.score + ", keeps rolling (" + cpuTurnScore + " this turn).";
      setTimeout(cpuTurnStep, 1100);
    }
  }

  function finishCpuTurn() {
    diceValues = [];
    setTimeout(function () {
      diceRow.innerHTML = "";
      if (checkWin()) return;
      turn = "player";
      turnScore = 0;
      diceCount = 6;
      messageEl.textContent = "Your turn — roll the dice!";
      rollBtn.disabled = false;
      bankBtn.disabled = true;
      refreshHud();
    }, 1200);
  }

  rollBtn.addEventListener("click", playerRoll);
  bankBtn.addEventListener("click", playerBank);
  restartBtn.addEventListener("click", function () {
    cpuTurnScore = 0;
    cpuDiceCount = 6;
    newGame();
  });

  cpuTurnScore = 0;
  cpuDiceCount = 6;
  newGame();
})();
