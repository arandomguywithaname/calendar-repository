(function () {
  var GAME_ID = "rhyme-time";
  var scoreEl = document.getElementById("score");
  var progressEl = document.getElementById("progress");
  var questionEl = document.getElementById("question");
  var choicesEl = document.getElementById("choices");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");

  var ROUND_SIZE = 10;

  var ROUNDS = [
    { word: "cat", answer: "hat", wrong: ["dog", "car", "sun"] },
    { word: "tree", answer: "bee", wrong: ["cup", "book", "star"] },
    { word: "light", answer: "night", wrong: ["food", "hand", "moon"] },
    { word: "blue", answer: "shoe", wrong: ["milk", "tree", "rock"] },
    { word: "rain", answer: "train", wrong: ["sand", "cloud", "wind"] },
    { word: "star", answer: "car", wrong: ["bird", "fish", "tree"] },
    { word: "moon", answer: "spoon", wrong: ["glass", "chair", "phone"] },
    { word: "day", answer: "play", wrong: ["wall", "book", "cloud"] },
    { word: "fun", answer: "sun", wrong: ["cup", "moon", "road"] },
    { word: "king", answer: "ring", wrong: ["desk", "sky", "plate"] },
    { word: "frog", answer: "dog", wrong: ["tree", "phone", "hat"] },
    { word: "mouse", answer: "house", wrong: ["chair", "bird", "cloud"] },
    { word: "bake", answer: "cake", wrong: ["wind", "glass", "star"] },
    { word: "wall", answer: "ball", wrong: ["pen", "sky", "moon"] },
    { word: "hop", answer: "top", wrong: ["cup", "tree", "book"] },
    { word: "sing", answer: "wing", wrong: ["desk", "moon", "cloud"] },
    { word: "bright", answer: "kite", wrong: ["chair", "fish", "dog"] },
    { word: "clock", answer: "rock", wrong: ["sun", "tree", "plate"] },
    { word: "snail", answer: "tail", wrong: ["cup", "star", "book"] },
    { word: "bear", answer: "chair", wrong: ["sun", "moon", "cloud"] },
    { word: "goat", answer: "boat", wrong: ["sand", "wind", "cup"] },
    { word: "flower", answer: "shower", wrong: ["chair", "moon", "plate"] }
  ];

  function buildRound() {
    return window.ArcadeCommon.shuffle(ROUNDS).slice(0, ROUND_SIZE).map(function (item) {
      return { q: "Which word rhymes with “" + item.word + "”?", choices: item.wrong.concat([item.answer]), answer: item.answer };
    });
  }

  var round, index, score, locked;

  function refreshHud() {
    scoreEl.textContent = score;
    if (index < ROUND_SIZE) {
      progressEl.textContent = "Question " + (index + 1) + "/" + ROUND_SIZE;
    }
  }

  function newGame() {
    round = buildRound();
    index = 0;
    score = 0;
    locked = false;
    restartBtn.style.display = "none";
    resultBanner.innerHTML = "";
    refreshHud();
    renderQuestion();
  }

  function renderQuestion() {
    locked = false;
    var item = round[index];
    questionEl.textContent = item.q;
    choicesEl.innerHTML = "";
    var opts = window.ArcadeCommon.shuffle(item.choices);
    opts.forEach(function (opt) {
      var btn = document.createElement("button");
      btn.className = "quiz-choice";
      btn.textContent = opt;
      btn.addEventListener("click", function () { answer(opt, btn, item); });
      choicesEl.appendChild(btn);
    });
    refreshHud();
  }

  function answer(opt, btn, item) {
    if (locked) return;
    locked = true;
    var correct = opt === item.answer;
    if (correct) score++;
    var buttons = choicesEl.querySelectorAll(".quiz-choice");
    for (var i = 0; i < buttons.length; i++) {
      var b = buttons[i];
      b.disabled = true;
      if (b.textContent === item.answer) b.classList.add("correct");
      else if (b === btn) b.classList.add("wrong");
    }
    resultBanner.innerHTML = correct
      ? '<span class="overlay-win">' + window.ArcadeI18n.t("common.correct") + "</span>"
      : '<span class="overlay-lose">' + window.ArcadeI18n.t("common.wrong") + " (" + item.answer + ")</span>";
    setTimeout(function () {
      index++;
      resultBanner.innerHTML = "";
      if (index < ROUND_SIZE) {
        renderQuestion();
      } else {
        finish();
      }
    }, 1000);
  }

  function finish() {
    questionEl.textContent = "";
    choicesEl.innerHTML = "";
    progressEl.textContent = "";
    var improved = window.ArcadeCommon.setBest(GAME_ID, score);
    var best = window.ArcadeCommon.getBest(GAME_ID);
    resultBanner.innerHTML = '<div class="quiz-summary">' +
      window.ArcadeI18n.t("common.gameOver") + "<br>" +
      window.ArcadeI18n.t("common.score") + ": " + score + "/" + ROUND_SIZE +
      (improved ? " 🏆" : "") + "<br>" +
      window.ArcadeI18n.t("common.best") + ": " + best +
      "</div>";
    restartBtn.style.display = "";
  }

  restartBtn.addEventListener("click", newGame);
  newGame();
})();
