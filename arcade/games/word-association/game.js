(function () {
  var GAME_ID = "word-association";
  var scoreEl = document.getElementById("score");
  var progressEl = document.getElementById("progress");
  var questionEl = document.getElementById("question");
  var choicesEl = document.getElementById("choices");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");

  var ROUND_SIZE = 10;

  var ROUNDS = [
    { word: "Ocean", answer: "Wave", wrong: ["Pencil", "Guitar", "Cactus"] },
    { word: "Doctor", answer: "Hospital", wrong: ["Bakery", "Volcano", "Guitar"] },
    { word: "Fire", answer: "Smoke", wrong: ["Snow", "Feather", "Glass"] },
    { word: "Book", answer: "Library", wrong: ["Ocean", "Engine", "Volcano"] },
    { word: "Bee", answer: "Honey", wrong: ["Iceberg", "Guitar", "Lamp"] },
    { word: "Rain", answer: "Umbrella", wrong: ["Desert", "Trumpet", "Sofa"] },
    { word: "Chef", answer: "Kitchen", wrong: ["Cockpit", "Meadow", "Mine"] },
    { word: "Guitar", answer: "Music", wrong: ["Soup", "Concrete", "Fossil"] },
    { word: "Snow", answer: "Winter", wrong: ["Beach", "Jungle", "Volcano"] },
    { word: "Pilot", answer: "Airplane", wrong: ["Submarine", "Tractor", "Bicycle"] },
    { word: "Farmer", answer: "Field", wrong: ["Courtroom", "Laboratory", "Stage"] },
    { word: "Shark", answer: "Ocean", wrong: ["Desert", "Forest", "Mountain"] },
    { word: "Painter", answer: "Canvas", wrong: ["Engine", "Keyboard", "Violin"] },
    { word: "Clock", answer: "Time", wrong: ["Flavor", "Distance", "Weight"] },
    { word: "Teacher", answer: "Classroom", wrong: ["Runway", "Greenhouse", "Warehouse"] },
    { word: "Spider", answer: "Web", wrong: ["Nest", "Shell", "Burrow"] },
    { word: "Camera", answer: "Photo", wrong: ["Melody", "Recipe", "Sculpture"] },
    { word: "Bakery", answer: "Bread", wrong: ["Engine parts", "Textbooks", "Fishing nets"] },
    { word: "Knight", answer: "Sword", wrong: ["Paintbrush", "Stethoscope", "Violin"] },
    { word: "Garden", answer: "Flowers", wrong: ["Icebergs", "Skyscrapers", "Engines"] },
    { word: "Astronaut", answer: "Spaceship", wrong: ["Submarine", "Tractor", "Canoe"] },
    { word: "Library", answer: "Books", wrong: ["Anchors", "Turbines", "Bricks"] }
  ];

  function buildRound() {
    return window.ArcadeCommon.shuffle(ROUNDS).slice(0, ROUND_SIZE).map(function (item) {
      return { q: "Which word is most closely associated with “" + item.word + "”?", choices: item.wrong.concat([item.answer]), answer: item.answer };
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
