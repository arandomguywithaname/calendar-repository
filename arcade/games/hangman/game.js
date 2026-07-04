(function () {
  var GAME_ID = "hangman";
  var wordEl = document.getElementById("word");
  var livesEl = document.getElementById("lives");
  var scoreEl = document.getElementById("score");
  var figureEl = document.getElementById("figure");
  var keyboardEl = document.getElementById("keyboard");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");

  var WORDS = [
    "ARCADE", "PLINKO", "PUZZLE", "REFLEX", "VICTORY", "JOYSTICK", "PIXEL",
    "CHAMPION", "RAINBOW", "GALAXY", "TROPHY", "MYSTERY", "CASTLE", "DRAGON",
    "PLANET", "WIZARD", "TREASURE", "JUNGLE", "VOLCANO", "COMET"
  ];
  var FACES = ["🙂", "😐", "😟", "😧", "😨", "😰", "💀"];

  var word, guessed, lives, score, over;

  function refreshHud() {
    livesEl.textContent = lives;
    scoreEl.textContent = score;
    figureEl.textContent = FACES[6 - lives];
  }

  function newGame() {
    word = window.ArcadeCommon.pick(WORDS);
    guessed = [];
    lives = 6;
    over = false;
    resultBanner.innerHTML = "";
    refreshHud();
    renderWord();
    renderKeyboard();
  }

  function renderWord() {
    wordEl.textContent = word.split("").map(function (ch) {
      return guessed.indexOf(ch) !== -1 ? ch : "_";
    }).join(" ");
  }

  function renderKeyboard() {
    keyboardEl.innerHTML = "";
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").forEach(function (letter) {
      var btn = document.createElement("button");
      btn.className = "btn";
      btn.textContent = letter;
      btn.disabled = guessed.indexOf(letter) !== -1 || over;
      btn.addEventListener("click", function () { guess(letter); });
      keyboardEl.appendChild(btn);
    });
  }

  function guess(letter) {
    if (over || guessed.indexOf(letter) !== -1) return;
    guessed.push(letter);
    if (word.indexOf(letter) === -1) {
      lives--;
    }
    refreshHud();
    renderWord();
    renderKeyboard();

    var solved = word.split("").every(function (ch) { return guessed.indexOf(ch) !== -1; });
    if (solved) {
      over = true;
      score += lives * 10;
      window.ArcadeCommon.setBest(GAME_ID, score);
      resultBanner.innerHTML = '<span class="overlay-win">' + window.ArcadeI18n.t("common.youWin") + "</span>";
      refreshHud();
      renderKeyboard();
    } else if (lives <= 0) {
      over = true;
      resultBanner.innerHTML = '<span class="overlay-lose">' + window.ArcadeI18n.t("common.youLose") + ": " + word + "</span>";
      renderKeyboard();
    }
  }

  document.addEventListener("keydown", function (e) {
    var letter = e.key.toUpperCase();
    if (letter.length === 1 && letter >= "A" && letter <= "Z") guess(letter);
  });

  restartBtn.addEventListener("click", newGame);
  newGame();
})();
