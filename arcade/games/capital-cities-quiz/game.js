(function () {
  var GAME_ID = "capital-cities-quiz";
  var scoreEl = document.getElementById("score");
  var progressEl = document.getElementById("progress");
  var questionEl = document.getElementById("question");
  var choicesEl = document.getElementById("choices");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");

  var ROUND_SIZE = 10;

  var PAIRS = [
    { country: "France", capital: "Paris" },
    { country: "Germany", capital: "Berlin" },
    { country: "Italy", capital: "Rome" },
    { country: "Spain", capital: "Madrid" },
    { country: "Portugal", capital: "Lisbon" },
    { country: "United Kingdom", capital: "London" },
    { country: "Ireland", capital: "Dublin" },
    { country: "Netherlands", capital: "Amsterdam" },
    { country: "Belgium", capital: "Brussels" },
    { country: "Switzerland", capital: "Bern" },
    { country: "Austria", capital: "Vienna" },
    { country: "Greece", capital: "Athens" },
    { country: "Poland", capital: "Warsaw" },
    { country: "Sweden", capital: "Stockholm" },
    { country: "Norway", capital: "Oslo" },
    { country: "Finland", capital: "Helsinki" },
    { country: "Denmark", capital: "Copenhagen" },
    { country: "Russia", capital: "Moscow" },
    { country: "Turkey", capital: "Ankara" },
    { country: "Egypt", capital: "Cairo" },
    { country: "Japan", capital: "Tokyo" },
    { country: "China", capital: "Beijing" },
    { country: "India", capital: "New Delhi" },
    { country: "South Korea", capital: "Seoul" },
    { country: "Australia", capital: "Canberra" },
    { country: "Canada", capital: "Ottawa" },
    { country: "United States", capital: "Washington D.C." },
    { country: "Mexico", capital: "Mexico City" },
    { country: "Brazil", capital: "Brasilia" },
    { country: "Argentina", capital: "Buenos Aires" },
    { country: "Chile", capital: "Santiago" },
    { country: "Peru", capital: "Lima" },
    { country: "Colombia", capital: "Bogota" },
    { country: "South Africa", capital: "Pretoria" },
    { country: "Kenya", capital: "Nairobi" },
    { country: "Nigeria", capital: "Abuja" },
    { country: "Morocco", capital: "Rabat" },
    { country: "Thailand", capital: "Bangkok" },
    { country: "Vietnam", capital: "Hanoi" },
    { country: "Indonesia", capital: "Jakarta" },
    { country: "New Zealand", capital: "Wellington" },
    { country: "Iceland", capital: "Reykjavik" },
    { country: "Cuba", capital: "Havana" },
    { country: "Israel", capital: "Jerusalem" },
    { country: "Saudi Arabia", capital: "Riyadh" },
    { country: "Ukraine", capital: "Kyiv" },
    { country: "Czech Republic", capital: "Prague" },
    { country: "Hungary", capital: "Budapest" },
    { country: "Romania", capital: "Bucharest" }
  ];

  function buildRound() {
    var picked = window.ArcadeCommon.shuffle(PAIRS).slice(0, ROUND_SIZE);
    return picked.map(function (item) {
      var others = PAIRS.filter(function (p) { return p.capital !== item.capital; });
      var distractors = window.ArcadeCommon.shuffle(others).slice(0, 3).map(function (p) { return p.capital; });
      var choices = window.ArcadeCommon.shuffle(distractors.concat([item.capital]));
      return { q: "What is the capital of " + item.country + "?", choices: choices, answer: item.capital };
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
