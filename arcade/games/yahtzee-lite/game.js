(function () {
  var GAME_ID = "yahtzee-lite";
  var diceRowEl = document.getElementById("dice-row");
  var categoriesEl = document.getElementById("categories");
  var scoreEl = document.getElementById("score");
  var bestEl = document.getElementById("best");
  var rollsLeftEl = document.getElementById("rolls-left");
  var resultBanner = document.getElementById("result-banner");
  var rollBtn = document.getElementById("roll-btn");
  var restartBtn = document.getElementById("restart");

  var CATEGORIES = [
    { key: "ones", label: "Ones" },
    { key: "twos", label: "Twos" },
    { key: "threes", label: "Threes" },
    { key: "fours", label: "Fours" },
    { key: "fives", label: "Fives" },
    { key: "sixes", label: "Sixes" },
    { key: "threeKind", label: "Three of a Kind" },
    { key: "fourKind", label: "Four of a Kind" },
    { key: "fullHouse", label: "Full House" },
    { key: "smallStraight", label: "Small Straight" },
    { key: "largeStraight", label: "Large Straight" },
    { key: "yahtzee", label: "Yahtzee" },
    { key: "chance", label: "Chance" }
  ];
  var UPPER_KEYS = ["ones", "twos", "threes", "fours", "fives", "sixes"];

  var dice, held, rollsLeft, scores, over;

  function counts(d) {
    var c = [0, 0, 0, 0, 0, 0, 0];
    d.forEach(function (v) { c[v]++; });
    return c;
  }
  function sum(d) { return d.reduce(function (a, b) { return a + b; }, 0); }
  function maxCount(c) { return Math.max.apply(null, c.slice(1)); }

  function scoreCategory(key, d) {
    var c = counts(d);
    switch (key) {
      case "ones": return c[1] * 1;
      case "twos": return c[2] * 2;
      case "threes": return c[3] * 3;
      case "fours": return c[4] * 4;
      case "fives": return c[5] * 5;
      case "sixes": return c[6] * 6;
      case "threeKind": return maxCount(c) >= 3 ? sum(d) : 0;
      case "fourKind": return maxCount(c) >= 4 ? sum(d) : 0;
      case "fullHouse": {
        var vals = c.slice(1).filter(function (x) { return x > 0; });
        return (vals.length === 2 && vals.indexOf(3) !== -1 && vals.indexOf(2) !== -1) ? 25 : 0;
      }
      case "smallStraight": {
        var uniq = [];
        d.forEach(function (v) { if (uniq.indexOf(v) === -1) uniq.push(v); });
        var runs = [[1, 2, 3, 4], [2, 3, 4, 5], [3, 4, 5, 6]];
        var has = runs.some(function (run) { return run.every(function (v) { return uniq.indexOf(v) !== -1; }); });
        return has ? 30 : 0;
      }
      case "largeStraight": {
        var uniq2 = [];
        d.forEach(function (v) { if (uniq2.indexOf(v) === -1) uniq2.push(v); });
        uniq2.sort(function (a, b) { return a - b; });
        var s = uniq2.join(",");
        return (s === "1,2,3,4,5" || s === "2,3,4,5,6") ? 40 : 0;
      }
      case "yahtzee": return maxCount(c) === 5 ? 50 : 0;
      case "chance": return sum(d);
      default: return 0;
    }
  }

  function totalScore() {
    var total = 0;
    var upperSum = 0;
    CATEGORIES.forEach(function (cat) {
      if (scores[cat.key] !== undefined && scores[cat.key] !== null) {
        total += scores[cat.key];
        if (UPPER_KEYS.indexOf(cat.key) !== -1) upperSum += scores[cat.key];
      }
    });
    if (upperSum >= 63) total += 35;
    return total;
  }

  function refreshHud() {
    scoreEl.textContent = totalScore();
    var best = window.ArcadeCommon.getBest(GAME_ID);
    bestEl.textContent = best === null ? 0 : best;
    rollsLeftEl.textContent = rollsLeft;
  }

  function newGame() {
    dice = [1, 1, 1, 1, 1];
    held = [false, false, false, false, false];
    rollsLeft = 3;
    scores = {};
    over = false;
    resultBanner.innerHTML = "";
    refreshHud();
    renderDice(false);
    renderCategories();
  }

  function roll() {
    if (over || rollsLeft <= 0) return;
    for (var i = 0; i < 5; i++) {
      if (!held[i]) dice[i] = window.ArcadeCommon.randInt(1, 6);
    }
    rollsLeft--;
    refreshHud();
    renderDice(true);
    renderCategories();
    if (rollsLeft <= 0) rollBtn.disabled = true;
  }

  function toggleHold(i) {
    if (over || rollsLeft === 3 || rollsLeft <= 0) return;
    held[i] = !held[i];
    renderDice(true);
  }

  function renderDice(rolled) {
    diceRowEl.innerHTML = "";
    dice.forEach(function (v, i) {
      var el = document.createElement("div");
      var canHold = rolled && rollsLeft > 0 && rollsLeft < 3;
      el.className = "die" + (held[i] ? " held" : "") + (canHold ? "" : " disabled");
      el.textContent = rolled ? String(v) : "-";
      if (canHold) el.addEventListener("click", function () { toggleHold(i); });
      diceRowEl.appendChild(el);
    });
  }

  function chooseCategory(key) {
    if (over) return;
    if (scores[key] !== undefined) return;
    if (rollsLeft === 3) {
      window.ArcadeCommon.toast("Roll the dice first");
      return;
    }
    scores[key] = scoreCategory(key, dice);
    var usedCount = Object.keys(scores).length;
    if (usedCount >= CATEGORIES.length) {
      over = true;
      var final = totalScore();
      var improved = window.ArcadeCommon.setBest(GAME_ID, final);
      resultBanner.innerHTML = '<span class="overlay-win">' + window.ArcadeI18n.t("common.gameOver") +
        " — " + window.ArcadeI18n.t("common.score") + ": " + final + (improved ? " 🏆" : "") + "</span>";
      refreshHud();
      renderCategories();
      renderDice(true);
      rollBtn.disabled = true;
      return;
    }
    dice = [1, 1, 1, 1, 1];
    held = [false, false, false, false, false];
    rollsLeft = 3;
    rollBtn.disabled = false;
    refreshHud();
    renderDice(false);
    renderCategories();
  }

  function renderCategories() {
    categoriesEl.innerHTML = "";
    CATEGORIES.forEach(function (cat) {
      var row = document.createElement("div");
      var used = scores[cat.key] !== undefined;
      row.className = "cat-row " + (used ? "used" : "available");
      var nameEl = document.createElement("span");
      nameEl.className = "cat-name";
      nameEl.textContent = cat.label;
      var scoreSpan = document.createElement("span");
      scoreSpan.className = "cat-score";
      if (used) {
        scoreSpan.textContent = scores[cat.key];
      } else if (rollsLeft < 3) {
        scoreSpan.textContent = scoreCategory(cat.key, dice);
      } else {
        scoreSpan.textContent = "-";
      }
      row.appendChild(nameEl);
      row.appendChild(scoreSpan);
      if (!used) row.addEventListener("click", function () { chooseCategory(cat.key); });
      categoriesEl.appendChild(row);
    });
  }

  rollBtn.addEventListener("click", roll);
  restartBtn.addEventListener("click", newGame);
  newGame();
})();
