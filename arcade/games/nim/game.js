(function () {
  var GAME_ID = "nim";
  var pilesEl = document.getElementById("piles");
  var amountControls = document.getElementById("amount-controls");
  var turnStat = document.getElementById("turn-stat");
  var scoreEl = document.getElementById("score");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");

  var piles, turn, over, selectedPile;
  var stats = { wins: 0, losses: 0 };

  function loadStats() {
    try { stats = JSON.parse(localStorage.getItem("arcade.stats." + GAME_ID)) || stats; } catch (e) {}
  }
  function saveStats() {
    try { localStorage.setItem("arcade.stats." + GAME_ID, JSON.stringify(stats)); } catch (e) {}
    scoreEl.textContent = stats.wins + "-" + stats.losses;
  }

  function newGame() {
    var pileCount = window.ArcadeCommon.randInt(3, 5);
    piles = [];
    for (var i = 0; i < pileCount; i++) piles.push(window.ArcadeCommon.randInt(1, 7));
    turn = "player";
    over = false;
    selectedPile = null;
    resultBanner.innerHTML = "";
    render();
  }

  function totalSticks() {
    return piles.reduce(function (a, b) { return a + b; }, 0);
  }

  function render() {
    pilesEl.innerHTML = "";
    amountControls.innerHTML = "";
    piles.forEach(function (count, i) {
      var pileEl = document.createElement("div");
      pileEl.className = "nim-pile" + (selectedPile === i ? " selected" : "") + ((over || turn !== "player") ? " disabled" : "");
      var label = document.createElement("div");
      label.className = "nim-pile-label";
      label.textContent = "Pile " + (i + 1) + " (" + count + ")";
      pileEl.appendChild(label);
      var sticksRow = document.createElement("div");
      sticksRow.className = "nim-sticks";
      for (var j = 0; j < count; j++) {
        (function (pileIndex, stickIndex) {
          var stick = document.createElement("span");
          stick.className = "nim-stick";
          stick.textContent = "🪵";
          stick.addEventListener("click", function (ev) {
            ev.stopPropagation();
            handleStickClick(pileIndex, stickIndex);
          });
          sticksRow.appendChild(stick);
        })(i, j);
      }
      pileEl.appendChild(sticksRow);
      pileEl.addEventListener("click", function () { handlePileClick(i); });
      pilesEl.appendChild(pileEl);
    });

    if (selectedPile !== null && !over && turn === "player") {
      var count = piles[selectedPile];
      for (var k = 1; k <= count; k++) {
        (function (amt) {
          var btn = document.createElement("button");
          btn.className = "btn";
          btn.textContent = String(amt);
          btn.addEventListener("click", function () { doPlayerMove(selectedPile, amt); });
          amountControls.appendChild(btn);
        })(k);
      }
    }

    turnStat.innerHTML = over ? "" : (turn === "player"
      ? '<span data-i18n="common.yourTurn">' + window.ArcadeI18n.t("common.yourTurn") + "</span>"
      : '<span data-i18n="common.cpuTurn">' + window.ArcadeI18n.t("common.cpuTurn") + "</span>");
  }

  function handlePileClick(i) {
    if (over || turn !== "player") return;
    selectedPile = selectedPile === i ? null : i;
    render();
  }

  function handleStickClick(pileIndex, stickIndex) {
    if (over || turn !== "player") return;
    if (selectedPile !== pileIndex) {
      selectedPile = pileIndex;
      render();
      return;
    }
    var amount = piles[pileIndex] - stickIndex;
    doPlayerMove(pileIndex, amount);
  }

  function doPlayerMove(pileIndex, amount) {
    if (over || turn !== "player") return;
    if (amount < 1 || amount > piles[pileIndex]) return;
    piles[pileIndex] -= amount;
    selectedPile = null;
    if (totalSticks() === 0) {
      endGame("player");
      return;
    }
    turn = "cpu";
    render();
    setTimeout(cpuTurn, 600);
  }

  function xorAll(arr) {
    var x = 0;
    for (var i = 0; i < arr.length; i++) x ^= arr[i];
    return x;
  }

  function randomLegalMove() {
    var candidates = [];
    for (var i = 0; i < piles.length; i++) if (piles[i] > 0) candidates.push(i);
    var pileIndex = window.ArcadeCommon.pick(candidates);
    var amount = window.ArcadeCommon.randInt(1, piles[pileIndex]);
    return { pile: pileIndex, amount: amount };
  }

  // Optimal misere-Nim move selection.
  function chooseCpuMove() {
    var bigIndices = [];
    var onesCount = 0;
    for (var i = 0; i < piles.length; i++) {
      if (piles[i] >= 2) bigIndices.push(i);
      else if (piles[i] === 1) onesCount++;
    }

    if (bigIndices.length >= 2) {
      var nimSum = xorAll(piles);
      if (nimSum !== 0) {
        for (var j = 0; j < piles.length; j++) {
          if (piles[j] <= 0) continue;
          var target = piles[j] ^ nimSum;
          if (target < piles[j]) {
            return { pile: j, amount: piles[j] - target };
          }
        }
      }
      return randomLegalMove();
    }

    if (bigIndices.length === 1) {
      var bigIdx = bigIndices[0];
      var m = piles[bigIdx];
      if (onesCount % 2 === 0) {
        // Leave an odd number of ones: reduce the big pile to exactly 1.
        return { pile: bigIdx, amount: m - 1 };
      }
      // Already an odd number of ones waiting: clear the big pile entirely.
      return { pile: bigIdx, amount: m };
    }

    // All piles are 0 or 1 — only legal move is to clear one of them.
    for (var k = 0; k < piles.length; k++) {
      if (piles[k] === 1) return { pile: k, amount: 1 };
    }
    return randomLegalMove();
  }

  function cpuTurn() {
    if (over) return;
    var move = chooseCpuMove();
    piles[move.pile] -= move.amount;
    if (totalSticks() === 0) {
      endGame("cpu");
      return;
    }
    turn = "player";
    render();
  }

  function endGame(whoTookLast) {
    over = true;
    if (whoTookLast === "player") {
      stats.losses++;
      resultBanner.innerHTML = '<span class="overlay-lose">' + window.ArcadeI18n.t("common.youLose") +
        " — you took the last stick</span>";
    } else {
      stats.wins++;
      resultBanner.innerHTML = '<span class="overlay-win">' + window.ArcadeI18n.t("common.youWin") +
        " — the CPU took the last stick</span>";
    }
    saveStats();
    render();
  }

  restartBtn.addEventListener("click", newGame);
  loadStats();
  saveStats();
  newGame();
})();
