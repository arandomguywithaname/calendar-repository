(function () {
  var GAME_ID = "anagram-solver";
  var scrambledEl = document.getElementById("scrambled");
  var hintEl = document.getElementById("hint");
  var guessForm = document.getElementById("guess-form");
  var guessInput = document.getElementById("guess-input");
  var scoreEl = document.getElementById("score");
  var bestEl = document.getElementById("best");
  var roundEl = document.getElementById("round");
  var totalRoundsEl = document.getElementById("total-rounds");
  var resultBanner = document.getElementById("result-banner");
  var submitBtn = document.getElementById("submit-btn");
  var skipBtn = document.getElementById("skip-btn");
  var restartBtn = document.getElementById("restart");

  var WORDS = [
    "PLANET", "GUITAR", "PENCIL", "GARDEN", "WINTER", "PURPLE", "BASKET",
    "CANDLE", "DOLPHIN", "JACKET", "MOUNTAIN", "RIBBON", "SILVER", "TUNNEL",
    "WHISTLE", "CACTUS", "FOREST", "ISLAND", "LANTERN", "MARBLE"
  ];

  var TOTAL_ROUNDS = 10;
  var order, roundIndex, score, currentWord, currentScrambled, over;

  function scramble(word) {
    var letters;
    do {
      letters = window.ArcadeCommon.shuffle(word.split(""));
    } while (letters.join("") === word && word.length > 1);
    return letters.join("");
  }

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
    currentScrambled = scramble(currentWord);
    scrambledEl.textContent = currentScrambled.split("").join(" ");
    hintEl.textContent = currentWord.length + " letters";
    guessInput.value = "";
    guessInput.disabled = false;
    submitBtn.disabled = false;
    skipBtn.disabled = false;
    resultBanner.innerHTML = "";
    refreshHud();
    guessInput.focus();
  }

  function submitGuess() {
    if (over) return;
    var guess = guessInput.value.trim().toUpperCase();
    if (!guess) return;
    if (guess === currentWord) {
      score += 10;
      window.ArcadeCommon.toast("Correct! +10");
      resultBanner.innerHTML = '<span class="overlay-win">Correct: ' + currentWord + "</span>";
      advance();
    } else {
      window.ArcadeCommon.toast("Not quite, try again");
      resultBanner.innerHTML = "";
    }
  }

  function skipRound() {
    if (over) return;
    resultBanner.innerHTML = '<span class="overlay-lose">Answer: ' + currentWord + "</span>";
    advance();
  }

  function advance() {
    guessInput.disabled = true;
    submitBtn.disabled = true;
    skipBtn.disabled = true;
    roundIndex++;
    refreshHud();
    setTimeout(nextRound, 900);
  }

  function finish() {
    over = true;
    var improved = window.ArcadeCommon.setBest(GAME_ID, score);
    scrambledEl.textContent = "DONE";
    hintEl.textContent = "";
    guessInput.disabled = true;
    submitBtn.disabled = true;
    skipBtn.disabled = true;
    resultBanner.innerHTML = '<span class="overlay-win">Final score: ' + score + (improved ? " — New Best! 🏆" : "") + "</span>";
    refreshHud();
  }

  guessForm.addEventListener("submit", function (e) {
    e.preventDefault();
    submitGuess();
  });
  submitBtn.addEventListener("click", submitGuess);
  skipBtn.addEventListener("click", skipRound);
  restartBtn.addEventListener("click", newGame);

  newGame();
})();
