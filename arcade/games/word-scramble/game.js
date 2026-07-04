(function () {
  var GAME_ID = "word-scramble";
  var hintEl = document.getElementById("hint");
  var slotsEl = document.getElementById("answer-slots");
  var trayEl = document.getElementById("tile-tray");
  var scoreEl = document.getElementById("score");
  var bestEl = document.getElementById("best");
  var roundEl = document.getElementById("round");
  var totalRoundsEl = document.getElementById("total-rounds");
  var resultBanner = document.getElementById("result-banner");
  var undoBtn = document.getElementById("undo-btn");
  var clearBtn = document.getElementById("clear-btn");
  var checkBtn = document.getElementById("check-btn");
  var skipBtn = document.getElementById("skip-btn");
  var restartBtn = document.getElementById("restart");

  var WORDS = [
    "OCEAN", "BRIDGE", "COFFEE", "DESERT", "ENGINE", "FALCON", "GLOBE",
    "HARBOR", "IGLOO", "JUNGLE", "KETTLE", "LAGOON", "MEADOW", "NOODLE",
    "ORCHID", "PYTHON", "QUARRY", "RIVER", "SUNSET", "TURTLE"
  ];

  var TOTAL_ROUNDS = 10;
  var order, roundIndex, score, currentWord, tiles, picks, over;

  function refreshHud() {
    scoreEl.textContent = score;
    var best = window.ArcadeCommon.getBest(GAME_ID);
    bestEl.textContent = best === null ? 0 : best;
    roundEl.textContent = Math.min(roundIndex + 1, TOTAL_ROUNDS);
    totalRoundsEl.textContent = TOTAL_ROUNDS;
  }

  function newGame() {
    order = window.ArcadeCommon.shuffle(WORDS).slice(0, TOTAL_ROUNDS);
    roundIndex = 0;
    score = 0;
    over = false;
    resultBanner.innerHTML = "";
    refreshHud();
    nextRound();
  }

  function nextRound() {
    if (roundIndex >= order.length) {
      finish();
      return;
    }
    currentWord = order[roundIndex];
    var letters;
    do {
      letters = window.ArcadeCommon.shuffle(currentWord.split(""));
    } while (letters.join("") === currentWord && currentWord.length > 1);
    tiles = letters.map(function (ch, i) { return { id: i, ch: ch, used: false }; });
    picks = [];
    hintEl.textContent = currentWord.length + " letters";
    resultBanner.innerHTML = "";
    setControlsEnabled(true);
    refreshHud();
    render();
  }

  function setControlsEnabled(enabled) {
    undoBtn.disabled = !enabled;
    clearBtn.disabled = !enabled;
    checkBtn.disabled = !enabled;
    skipBtn.disabled = !enabled;
  }

  function render() {
    slotsEl.innerHTML = "";
    for (var i = 0; i < currentWord.length; i++) {
      var slot = document.createElement("div");
      var pickIdx = picks[i];
      if (pickIdx !== undefined) {
        slot.className = "slot filled";
        slot.textContent = tiles[pickIdx].ch;
        (function (upTo) {
          slot.addEventListener("click", function () { undoTo(upTo); });
        })(i);
      } else {
        slot.className = "slot";
        slot.textContent = "";
      }
      slotsEl.appendChild(slot);
    }

    trayEl.innerHTML = "";
    tiles.forEach(function (tile) {
      var el = document.createElement("div");
      el.className = "tile" + (tile.used ? " used" : "");
      el.textContent = tile.ch;
      el.addEventListener("click", function () { pickTile(tile.id); });
      trayEl.appendChild(el);
    });
  }

  function pickTile(id) {
    if (over) return;
    var tile = tiles[id];
    if (tile.used || picks.length >= currentWord.length) return;
    tile.used = true;
    picks.push(id);
    render();
  }

  function undoTo(index) {
    if (over) return;
    while (picks.length > index) {
      var id = picks.pop();
      tiles[id].used = false;
    }
    render();
  }

  function undo() {
    if (over || picks.length === 0) return;
    var id = picks.pop();
    tiles[id].used = false;
    render();
  }

  function clearAll() {
    if (over) return;
    picks.forEach(function (id) { tiles[id].used = false; });
    picks = [];
    render();
  }

  function check() {
    if (over) return;
    if (picks.length !== currentWord.length) {
      window.ArcadeCommon.toast("Fill all the letters first");
      return;
    }
    var attempt = picks.map(function (id) { return tiles[id].ch; }).join("");
    if (attempt === currentWord) {
      score += 10;
      window.ArcadeCommon.toast("Correct! +10");
      resultBanner.innerHTML = '<span class="overlay-win">Correct: ' + currentWord + "</span>";
      advance();
    } else {
      window.ArcadeCommon.toast("Not quite, try again");
      clearAll();
    }
  }

  function skipRound() {
    if (over) return;
    resultBanner.innerHTML = '<span class="overlay-lose">Answer: ' + currentWord + "</span>";
    advance();
  }

  function advance() {
    setControlsEnabled(false);
    roundIndex++;
    refreshHud();
    setTimeout(nextRound, 900);
  }

  function finish() {
    over = true;
    var improved = window.ArcadeCommon.setBest(GAME_ID, score);
    hintEl.textContent = "";
    slotsEl.innerHTML = "";
    trayEl.innerHTML = "";
    setControlsEnabled(false);
    resultBanner.innerHTML = '<span class="overlay-win">Final score: ' + score + (improved ? " — New Best! 🏆" : "") + "</span>";
    refreshHud();
  }

  undoBtn.addEventListener("click", undo);
  clearBtn.addEventListener("click", clearAll);
  checkBtn.addEventListener("click", check);
  skipBtn.addEventListener("click", skipRound);
  restartBtn.addEventListener("click", newGame);

  newGame();
})();
