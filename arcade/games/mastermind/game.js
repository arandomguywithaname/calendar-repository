(function () {
  var GAME_ID = "mastermind";
  var historyEl = document.getElementById("history");
  var currentGuessEl = document.getElementById("current-guess");
  var paletteEl = document.getElementById("palette");
  var guessesLeftEl = document.getElementById("guesses-left");
  var bestEl = document.getElementById("best");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");
  var submitBtn = document.getElementById("submit-guess");
  var clearBtn = document.getElementById("clear-guess");

  var COLORS = [
    { name: "red", emoji: "🔴" },
    { name: "blue", emoji: "🔵" },
    { name: "green", emoji: "🟢" },
    { name: "yellow", emoji: "🟡" },
    { name: "purple", emoji: "🟣" },
    { name: "orange", emoji: "🟠" }
  ];
  var CODE_LEN = 4, MAX_GUESSES = 10;

  var secret, guesses, current, over, maxAttemptsUsed;

  function refreshHud() {
    guessesLeftEl.textContent = Math.max(0, MAX_GUESSES - guesses.length);
    var best = window.ArcadeCommon.getBest(GAME_ID);
    bestEl.textContent = best === null ? "-" : best;
  }

  function newGame() {
    secret = [];
    for (var i = 0; i < CODE_LEN; i++) secret.push(window.ArcadeCommon.pick(COLORS).name);
    guesses = [];
    current = [];
    over = false;
    resultBanner.innerHTML = "";
    refreshHud();
    renderPalette();
    renderCurrent();
    renderHistory();
  }

  function renderPalette() {
    paletteEl.innerHTML = "";
    COLORS.forEach(function (color) {
      var btn = document.createElement("button");
      btn.className = "color-btn";
      btn.textContent = color.emoji;
      btn.title = color.name;
      btn.addEventListener("click", function () {
        if (over || current.length >= CODE_LEN) return;
        current.push(color.name);
        renderCurrent();
      });
      paletteEl.appendChild(btn);
    });
  }

  function colorEmoji(name) {
    var c = COLORS.filter(function (x) { return x.name === name; })[0];
    return c ? c.emoji : "";
  }

  function renderCurrent() {
    currentGuessEl.innerHTML = "";
    for (var i = 0; i < CODE_LEN; i++) {
      var slot = document.createElement("div");
      slot.className = "peg-slot";
      slot.textContent = current[i] ? colorEmoji(current[i]) : "";
      currentGuessEl.appendChild(slot);
    }
  }

  function computeFeedback(guess) {
    var black = 0, white = 0;
    var secretLeft = secret.slice();
    var guessLeft = guess.slice();
    for (var i = 0; i < CODE_LEN; i++) {
      if (guessLeft[i] === secretLeft[i]) {
        black++;
        secretLeft[i] = null;
        guessLeft[i] = null;
      }
    }
    for (var i2 = 0; i2 < CODE_LEN; i2++) {
      if (guessLeft[i2] === null) continue;
      var idx = secretLeft.indexOf(guessLeft[i2]);
      if (idx !== -1) {
        white++;
        secretLeft[idx] = null;
      }
    }
    return { black: black, white: white };
  }

  function renderHistory() {
    historyEl.innerHTML = "";
    guesses.forEach(function (g) {
      var row = document.createElement("div");
      row.className = "guess-row";
      var slots = document.createElement("div");
      slots.className = "guess-slots";
      g.guess.forEach(function (name) {
        var slot = document.createElement("div");
        slot.className = "peg-slot";
        slot.textContent = colorEmoji(name);
        slots.appendChild(slot);
      });
      row.appendChild(slots);
      var fb = document.createElement("div");
      fb.className = "feedback-pegs";
      var pegs = [];
      for (var i = 0; i < g.feedback.black; i++) pegs.push("black");
      for (var j = 0; j < g.feedback.white; j++) pegs.push("white");
      while (pegs.length < CODE_LEN) pegs.push("none");
      pegs.forEach(function (p) {
        var peg = document.createElement("div");
        peg.className = "feedback-peg " + p;
        fb.appendChild(peg);
      });
      row.appendChild(fb);
      historyEl.appendChild(row);
    });
  }

  function submitGuess() {
    if (over || current.length !== CODE_LEN) {
      if (current.length !== CODE_LEN) window.ArcadeCommon.toast("Pick " + CODE_LEN + " colors first");
      return;
    }
    var feedback = computeFeedback(current);
    guesses.push({ guess: current, feedback: feedback });
    renderHistory();
    refreshHud();
    if (feedback.black === CODE_LEN) {
      over = true;
      var score = Math.max(0, (MAX_GUESSES - guesses.length + 1) * 100);
      window.ArcadeCommon.setBest(GAME_ID, score);
      resultBanner.innerHTML = '<span class="overlay-win">' + window.ArcadeI18n.t("common.youWin") +
        " — " + guesses.length + " guesses" + "</span>";
    } else if (guesses.length >= MAX_GUESSES) {
      over = true;
      resultBanner.innerHTML = '<span class="overlay-lose">' + window.ArcadeI18n.t("common.youLose") +
        " — code was " + secret.map(colorEmoji).join(" ") + "</span>";
    }
    current = [];
    renderCurrent();
  }

  clearBtn.addEventListener("click", function () { current = []; renderCurrent(); });
  submitBtn.addEventListener("click", submitGuess);
  restartBtn.addEventListener("click", newGame);
  newGame();
})();
