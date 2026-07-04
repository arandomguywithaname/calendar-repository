(function () {
  var GAME_ID = "wordle-clone";
  var boardEl = document.getElementById("wordle-board");
  var keyboardEl = document.getElementById("keyboard");
  var scoreEl = document.getElementById("score");
  var bestEl = document.getElementById("best");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");

  var WORDS = [
    "APPLE", "BEACH", "CHAIR", "DANCE", "EAGLE", "FLAME", "GRAPE", "HOUSE",
    "IMAGE", "JUICE", "KNIFE", "LEMON", "MONEY", "NURSE", "OCEAN", "PIANO",
    "QUIET", "RADIO", "SNAKE", "TABLE", "UNCLE", "VOICE", "WATER", "YOUTH",
    "ZEBRA", "BRAVE", "CLOUD", "DREAM", "EARTH", "FRUIT", "GHOST", "HONEY",
    "IVORY", "JOKER", "KINGS", "LIGHT", "MAGIC", "NIGHT", "OLIVE", "PLANT",
    "QUEEN", "RIVER", "STONE", "TIGER", "UNITY", "VIVID", "WHEAT", "YIELD",
    "AMBER", "BLEND", "CRISP", "DELTA", "ELBOW", "FROST", "GLORY", "HAPPY"
  ];

  var ROWS = 6, COLS = 5;
  var KB_ROWS = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];

  var answer, guesses, current, over, keyStates, score;
  score = 0;

  function refreshHud() {
    scoreEl.textContent = score;
    var best = window.ArcadeCommon.getBest(GAME_ID);
    bestEl.textContent = best === null ? 0 : best;
  }

  function newGame() {
    answer = window.ArcadeCommon.pick(WORDS);
    guesses = [];
    current = "";
    over = false;
    keyStates = {};
    resultBanner.innerHTML = "";
    refreshHud();
    render();
    renderKeyboard();
  }

  function evaluateGuess(guess) {
    var result = new Array(COLS).fill("absent");
    var answerLetters = answer.split("");
    var remaining = {};
    var i;
    for (i = 0; i < COLS; i++) {
      if (guess[i] === answerLetters[i]) {
        result[i] = "correct";
      } else {
        remaining[answerLetters[i]] = (remaining[answerLetters[i]] || 0) + 1;
      }
    }
    for (i = 0; i < COLS; i++) {
      if (result[i] === "correct") continue;
      var ch = guess[i];
      if (remaining[ch] > 0) {
        result[i] = "present";
        remaining[ch]--;
      } else {
        result[i] = "absent";
      }
    }
    return result;
  }

  function updateKeyStates(guess, result) {
    var rank = { absent: 0, present: 1, correct: 2 };
    for (var i = 0; i < guess.length; i++) {
      var ch = guess[i];
      var newState = result[i];
      if (!keyStates[ch] || rank[newState] > rank[keyStates[ch]]) {
        keyStates[ch] = newState;
      }
    }
  }

  function render() {
    boardEl.innerHTML = "";
    for (var r = 0; r < ROWS; r++) {
      var rowEl = document.createElement("div");
      rowEl.className = "wordle-row";
      var guessData = guesses[r];
      var text = r === guesses.length ? current : (guessData ? guessData.guess : "");
      for (var c = 0; c < COLS; c++) {
        var tile = document.createElement("div");
        var ch = text[c] || "";
        var cls = "wordle-tile";
        if (ch) cls += " filled";
        if (guessData) cls += " " + guessData.result[c];
        tile.className = cls;
        tile.textContent = ch;
        rowEl.appendChild(tile);
      }
      boardEl.appendChild(rowEl);
    }
  }

  function renderKeyboard() {
    keyboardEl.innerHTML = "";
    KB_ROWS.forEach(function (row, idx) {
      var rowEl = document.createElement("div");
      rowEl.className = "kb-row";
      if (idx === 2) {
        rowEl.appendChild(makeKey("ENTER", true));
      }
      row.split("").forEach(function (letter) {
        rowEl.appendChild(makeKey(letter, false));
      });
      if (idx === 2) {
        rowEl.appendChild(makeKey("BACK", true));
      }
      keyboardEl.appendChild(rowEl);
    });
  }

  function makeKey(label, wide) {
    var btn = document.createElement("button");
    btn.className = "kb-key" + (wide ? " wide" : "");
    btn.textContent = label === "BACK" ? "⌫" : label;
    if (keyStates[label]) btn.className += " " + keyStates[label];
    btn.addEventListener("click", function () { handleKey(label); });
    return btn;
  }

  function handleKey(key) {
    if (over) return;
    if (key === "ENTER") {
      submitGuess();
    } else if (key === "BACK") {
      current = current.slice(0, -1);
      render();
    } else if (/^[A-Z]$/.test(key) && current.length < COLS) {
      current += key;
      render();
    }
  }

  function submitGuess() {
    if (current.length !== COLS) {
      window.ArcadeCommon.toast("Enter " + COLS + " letters");
      return;
    }
    var result = evaluateGuess(current);
    updateKeyStates(current, result);
    guesses.push({ guess: current, result: result });
    var won = result.every(function (r) { return r === "correct"; });
    var guessedWord = current;
    current = "";
    render();
    renderKeyboard();
    if (won) {
      over = true;
      score += (ROWS - guesses.length + 1) * 10;
      window.ArcadeCommon.setBest(GAME_ID, score);
      resultBanner.innerHTML = '<span class="overlay-win">' + window.ArcadeI18n.t("common.youWin") + " — " + guessedWord + "</span>";
      refreshHud();
    } else if (guesses.length >= ROWS) {
      over = true;
      resultBanner.innerHTML = '<span class="overlay-lose">' + window.ArcadeI18n.t("common.youLose") + ": " + answer + "</span>";
    }
  }

  document.addEventListener("keydown", function (e) {
    if (over) return;
    var key = e.key.toUpperCase();
    if (key === "ENTER") handleKey("ENTER");
    else if (key === "BACKSPACE") handleKey("BACK");
    else if (/^[A-Z]$/.test(key) && key.length === 1) handleKey(key);
  });

  restartBtn.addEventListener("click", newGame);
  newGame();
})();
