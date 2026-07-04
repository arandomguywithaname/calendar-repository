(function () {
  var GAME_ID = "trivia-geography";
  var scoreEl = document.getElementById("score");
  var progressEl = document.getElementById("progress");
  var questionEl = document.getElementById("question");
  var choicesEl = document.getElementById("choices");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");

  var ROUND_SIZE = 10;

  var QUESTIONS = [
    { q: "Which is the longest river in the world?", choices: ["Nile", "Amazon", "Yangtze", "Mississippi"], answer: "Nile" },
    { q: "Which is the largest hot desert in the world?", choices: ["Sahara", "Gobi", "Kalahari", "Mojave"], answer: "Sahara" },
    { q: "Which mountain is the tallest above sea level?", choices: ["K2", "Mount Everest", "Kangchenjunga", "Denali"], answer: "Mount Everest" },
    { q: "Which continent is the largest by area?", choices: ["Asia", "Africa", "North America", "Europe"], answer: "Asia" },
    { q: "Which continent is the smallest by area?", choices: ["Australia", "Europe", "Antarctica", "South America"], answer: "Australia" },
    { q: "Which ocean is the largest?", choices: ["Atlantic", "Indian", "Pacific", "Arctic"], answer: "Pacific" },
    { q: "What is the longest mountain range in the world?", choices: ["Andes", "Rockies", "Himalayas", "Alps"], answer: "Andes" },
    { q: "Which country has the largest land area in the world?", choices: ["Russia", "Canada", "China", "USA"], answer: "Russia" },
    { q: "Which African country is home to Mount Kilimanjaro?", choices: ["Kenya", "Tanzania", "Uganda", "Ethiopia"], answer: "Tanzania" },
    { q: "Which river flows through Egypt?", choices: ["Nile", "Congo", "Niger", "Zambezi"], answer: "Nile" },
    { q: "What is the smallest country in the world by area?", choices: ["Monaco", "Vatican City", "San Marino", "Liechtenstein"], answer: "Vatican City" },
    { q: "Which sea lies between southern Europe and northern Africa?", choices: ["Mediterranean Sea", "Red Sea", "Black Sea", "Caspian Sea"], answer: "Mediterranean Sea" },
    { q: "Which country is transcontinental, lying in both Europe and Asia?", choices: ["Turkey", "Spain", "Poland", "France"], answer: "Turkey" },
    { q: "What is the largest island in the world?", choices: ["Greenland", "Madagascar", "Borneo", "New Guinea"], answer: "Greenland" },
    { q: "Which lake is the largest freshwater lake by surface area?", choices: ["Lake Superior", "Lake Victoria", "Lake Baikal", "Caspian Sea"], answer: "Lake Superior" },
    { q: "What is the driest inhabited continent (excluding Antarctica)?", choices: ["Australia", "Africa", "Asia", "South America"], answer: "Australia" },
    { q: "Which strait separates Asia from North America?", choices: ["Bering Strait", "Strait of Gibraltar", "Strait of Hormuz", "Cook Strait"], answer: "Bering Strait" },
    { q: "Which country has the most time zones due to its overseas territories?", choices: ["France", "Russia", "USA", "China"], answer: "France" },
    { q: "Which of these countries is landlocked?", choices: ["Switzerland", "Portugal", "Japan", "Chile"], answer: "Switzerland" },
    { q: "What is a narrow strip of land connecting two larger land areas called?", choices: ["Isthmus", "Peninsula", "Plateau", "Delta"], answer: "Isthmus" },
    { q: "Which river is the longest in South America?", choices: ["Amazon", "Orinoco", "Parana", "Magdalena"], answer: "Amazon" },
    { q: "Which country is known as the 'Land of the Rising Sun'?", choices: ["Japan", "China", "Thailand", "South Korea"], answer: "Japan" },
    { q: "Which mountain range is often considered the boundary between Europe and Asia?", choices: ["Ural Mountains", "Alps", "Carpathians", "Pyrenees"], answer: "Ural Mountains" },
    { q: "What type of landform is the Grand Canyon?", choices: ["Canyon", "Plateau", "Delta", "Fjord"], answer: "Canyon" },
    { q: "On which continent does the Sahara Desert lie?", choices: ["Africa", "Asia", "Australia", "South America"], answer: "Africa" },
    { q: "Which body of water is the saltiest in the world?", choices: ["Dead Sea", "Red Sea", "Caspian Sea", "Black Sea"], answer: "Dead Sea" },
    { q: "What is the term for a large area of flat, elevated land?", choices: ["Plateau", "Valley", "Canyon", "Basin"], answer: "Plateau" }
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
