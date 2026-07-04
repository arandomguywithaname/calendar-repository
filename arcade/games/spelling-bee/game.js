(function () {
  var GAME_ID = "spelling-bee";
  var scoreEl = document.getElementById("score");
  var progressEl = document.getElementById("progress");
  var questionEl = document.getElementById("question");
  var choicesEl = document.getElementById("choices");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");

  var ROUND_SIZE = 10;

  var WORDS = [
    { clue: "A structure you live in", answer: "house", wrong: ["huose", "hose", "hous"] },
    { clue: "Opposite of correct", answer: "wrong", wrong: ["rong", "wronge", "raong"] },
    { clue: "A tool for writing", answer: "pencil", wrong: ["pencle", "pensil", "pencyl"] },
    { clue: "A period of seven days", answer: "week", wrong: ["weak", "weeek", "wek"] },
    { clue: "A feeling of great happiness", answer: "happiness", wrong: ["happyness", "hapiness", "happynes"] },
    { clue: "To get something that is given or sent to you", answer: "receive", wrong: ["recieve", "receve", "receeve"] },
    { clue: "A place where children go to learn", answer: "school", wrong: ["skool", "schoool", "shcool"] },
    { clue: "Something that is not true", answer: "false", wrong: ["falce", "fals", "phalse"] },
    { clue: "A round vegetable that makes you cry when cut", answer: "onion", wrong: ["oinion", "onoin", "unnion"] },
    { clue: "The study of numbers and shapes", answer: "mathematics", wrong: ["mathmatics", "mathematixs", "mathamatics"] },
    { clue: "A person whose job is to help students learn", answer: "teacher", wrong: ["techer", "teachar", "teatcher"] },
    { clue: "Extremely large in size", answer: "enormous", wrong: ["enormus", "enourmous", "enormious"] },
    { clue: "To do something incorrectly by accident", answer: "mistake", wrong: ["mistaek", "misteak", "mestake"] },
    { clue: "A large group of musicians playing together", answer: "orchestra", wrong: ["orchestera", "orkestra", "orchesra"] },
    { clue: "Happening often", answer: "frequently", wrong: ["frequentley", "frequentlly", "freqently"] },
    { clue: "A building used for worship", answer: "church", wrong: ["chruch", "cherch", "churh"] },
    { clue: "A feeling of worry before something important", answer: "anxious", wrong: ["ankshus", "anxous", "anxius"] },
    { clue: "A plant grown for food, such as a carrot", answer: "vegetable", wrong: ["vegtable", "vegetible", "vegetabel"] },
    { clue: "Absolutely required; needed", answer: "necessary", wrong: ["neccessary", "necesary", "neccesary"] },
    { clue: "To keep something safe from harm or decay", answer: "preserve", wrong: ["perserve", "preseve", "presrve"] },
    { clue: "A device that measures temperature", answer: "thermometer", wrong: ["thermometor", "thermomiter", "thermometter"] },
    { clue: "A very large group of stars, gas and dust", answer: "galaxy", wrong: ["galexy", "gallaxy", "galaxi"] }
  ];

  function buildRound() {
    return window.ArcadeCommon.shuffle(WORDS).slice(0, ROUND_SIZE).map(function (item) {
      return {
        q: "Which is the correct spelling of the word meaning: “" + item.clue + "”?",
        choices: item.wrong.concat([item.answer]),
        answer: item.answer
      };
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
