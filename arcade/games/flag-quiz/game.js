(function () {
  var GAME_ID = "flag-quiz";
  var scoreEl = document.getElementById("score");
  var progressEl = document.getElementById("progress");
  var questionEl = document.getElementById("question");
  var choicesEl = document.getElementById("choices");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");

  var ROUND_SIZE = 10;

  var PAIRS = [
    { country: "Japan", flag: "🇯🇵" },
    { country: "France", flag: "🇫🇷" },
    { country: "Germany", flag: "🇩🇪" },
    { country: "Italy", flag: "🇮🇹" },
    { country: "Spain", flag: "🇪🇸" },
    { country: "United Kingdom", flag: "🇬🇧" },
    { country: "Canada", flag: "🇨🇦" },
    { country: "Brazil", flag: "🇧🇷" },
    { country: "Australia", flag: "🇦🇺" },
    { country: "Mexico", flag: "🇲🇽" },
    { country: "India", flag: "🇮🇳" },
    { country: "China", flag: "🇨🇳" },
    { country: "Russia", flag: "🇷🇺" },
    { country: "South Korea", flag: "🇰🇷" },
    { country: "Egypt", flag: "🇪🇬" },
    { country: "South Africa", flag: "🇿🇦" },
    { country: "Argentina", flag: "🇦🇷" },
    { country: "Sweden", flag: "🇸🇪" },
    { country: "Norway", flag: "🇳🇴" },
    { country: "Netherlands", flag: "🇳🇱" },
    { country: "Switzerland", flag: "🇨🇭" },
    { country: "Greece", flag: "🇬🇷" },
    { country: "Portugal", flag: "🇵🇹" },
    { country: "Turkey", flag: "🇹🇷" },
    { country: "Poland", flag: "🇵🇱" },
    { country: "Ireland", flag: "🇮🇪" },
    { country: "Belgium", flag: "🇧🇪" },
    { country: "Austria", flag: "🇦🇹" },
    { country: "Denmark", flag: "🇩🇰" },
    { country: "Finland", flag: "🇫🇮" },
    { country: "New Zealand", flag: "🇳🇿" },
    { country: "Thailand", flag: "🇹🇭" },
    { country: "Vietnam", flag: "🇻🇳" },
    { country: "Indonesia", flag: "🇮🇩" },
    { country: "Saudi Arabia", flag: "🇸🇦" },
    { country: "Israel", flag: "🇮🇱" },
    { country: "United States", flag: "🇺🇸" }
  ];

  function buildRound() {
    var picked = window.ArcadeCommon.shuffle(PAIRS).slice(0, ROUND_SIZE);
    return picked.map(function (item) {
      var others = PAIRS.filter(function (p) { return p.country !== item.country; });
      var distractors = window.ArcadeCommon.shuffle(others).slice(0, 3).map(function (p) { return p.country; });
      var choices = window.ArcadeCommon.shuffle(distractors.concat([item.country]));
      return { q: item.flag, choices: choices, answer: item.country };
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
    questionEl.style.fontSize = "4rem";
    choicesEl.innerHTML = "";
    item.choices.forEach(function (opt) {
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
    questionEl.style.fontSize = "";
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
