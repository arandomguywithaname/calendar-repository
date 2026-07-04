(function () {
  var GAME_ID = "trivia-general";
  var scoreEl = document.getElementById("score");
  var progressEl = document.getElementById("progress");
  var questionEl = document.getElementById("question");
  var choicesEl = document.getElementById("choices");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");

  var ROUND_SIZE = 10;

  var QUESTIONS = [
    { q: "How many continents are there on Earth?", choices: ["5", "6", "7", "8"], answer: "7" },
    { q: "What is the largest ocean on Earth?", choices: ["Atlantic", "Indian", "Arctic", "Pacific"], answer: "Pacific" },
    { q: "How many players are on a standard soccer team on the field?", choices: ["9", "10", "11", "12"], answer: "11" },
    { q: "What is the freezing point of water in Celsius?", choices: ["0", "10", "32", "100"], answer: "0" },
    { q: "Which planet is known as the Red Planet?", choices: ["Venus", "Mars", "Jupiter", "Mercury"], answer: "Mars" },
    { q: "How many sides does a hexagon have?", choices: ["5", "6", "7", "8"], answer: "6" },
    { q: "What is the largest mammal in the world?", choices: ["African Elephant", "Blue Whale", "Giraffe", "Polar Bear"], answer: "Blue Whale" },
    { q: "How many hours are in a day?", choices: ["12", "24", "48", "36"], answer: "24" },
    { q: "What gas do plants primarily absorb from the atmosphere?", choices: ["Oxygen", "Nitrogen", "Carbon Dioxide", "Helium"], answer: "Carbon Dioxide" },
    { q: "How many bones are in the adult human body?", choices: ["106", "206", "306", "406"], answer: "206" },
    { q: "What is the currency of Japan?", choices: ["Won", "Yuan", "Yen", "Ringgit"], answer: "Yen" },
    { q: "Which instrument has 88 keys?", choices: ["Guitar", "Piano", "Violin", "Flute"], answer: "Piano" },
    { q: "What is the smallest prime number?", choices: ["0", "1", "2", "3"], answer: "2" },
    { q: "How many minutes are in a full day?", choices: ["1440", "1000", "720", "2000"], answer: "1440" },
    { q: "What is the hardest natural substance on Earth?", choices: ["Gold", "Iron", "Diamond", "Quartz"], answer: "Diamond" },
    { q: "Which fruit is known for having its seeds on the outside?", choices: ["Strawberry", "Apple", "Banana", "Grape"], answer: "Strawberry" },
    { q: "What is the main ingredient in guacamole?", choices: ["Tomato", "Avocado", "Onion", "Pepper"], answer: "Avocado" },
    { q: "How many teeth does an adult human typically have?", choices: ["28", "30", "32", "34"], answer: "32" },
    { q: "What is the boiling point of water in Celsius at sea level?", choices: ["90", "100", "120", "80"], answer: "100" },
    { q: "Which shape has three sides?", choices: ["Square", "Triangle", "Pentagon", "Circle"], answer: "Triangle" },
    { q: "What do bees produce?", choices: ["Milk", "Silk", "Honey", "Wax only"], answer: "Honey" },
    { q: "How many legs does a spider have?", choices: ["6", "8", "10", "12"], answer: "8" },
    { q: "What is the primary language spoken in Brazil?", choices: ["Spanish", "Portuguese", "French", "Italian"], answer: "Portuguese" },
    { q: "Which sport is known as 'the beautiful game'?", choices: ["Basketball", "Soccer", "Tennis", "Cricket"], answer: "Soccer" },
    { q: "What is the largest organ in the human body?", choices: ["Heart", "Liver", "Skin", "Lungs"], answer: "Skin" },
    { q: "What do you call a group of lions?", choices: ["Pack", "Pride", "Herd", "Flock"], answer: "Pride" },
    { q: "How many players are on a basketball team on the court at once?", choices: ["4", "5", "6", "7"], answer: "5" }
  ];

  function buildRound() {
    return window.ArcadeCommon.shuffle(QUESTIONS).slice(0, ROUND_SIZE).map(function (item) {
      return { q: item.q, choices: item.choices.slice(), answer: item.answer };
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
    if (item.qHtml) {
      questionEl.innerHTML = item.qHtml;
    } else {
      questionEl.textContent = item.q;
    }
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
