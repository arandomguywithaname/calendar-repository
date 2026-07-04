(function () {
  var GAME_ID = "trivia-science";
  var scoreEl = document.getElementById("score");
  var progressEl = document.getElementById("progress");
  var questionEl = document.getElementById("question");
  var choicesEl = document.getElementById("choices");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");

  var ROUND_SIZE = 10;

  var QUESTIONS = [
    { q: "What is the chemical formula for water?", choices: ["H2O", "CO2", "O2", "NaCl"], answer: "H2O" },
    { q: "Which planet is known as the Red Planet?", choices: ["Mars", "Venus", "Jupiter", "Saturn"], answer: "Mars" },
    { q: "What is often called the powerhouse of the cell?", choices: ["Mitochondria", "Nucleus", "Ribosome", "Golgi apparatus"], answer: "Mitochondria" },
    { q: "What gas do humans need to breathe to survive?", choices: ["Oxygen", "Nitrogen", "Carbon Dioxide", "Hydrogen"], answer: "Oxygen" },
    { q: "What is the chemical symbol for gold?", choices: ["Au", "Ag", "Gd", "Go"], answer: "Au" },
    { q: "How many bones are in the adult human body?", choices: ["206", "186", "226", "246"], answer: "206" },
    { q: "What force pulls objects toward the Earth?", choices: ["Gravity", "Magnetism", "Friction", "Inertia"], answer: "Gravity" },
    { q: "What is the smallest structural and functional unit of life?", choices: ["Cell", "Atom", "Molecule", "Organ"], answer: "Cell" },
    { q: "What is the boiling point of water at sea level in Celsius?", choices: ["100", "90", "110", "212"], answer: "100" },
    { q: "Which planet has the most moons in our solar system?", choices: ["Saturn", "Jupiter", "Uranus", "Neptune"], answer: "Saturn" },
    { q: "What is the process by which plants make their own food called?", choices: ["Photosynthesis", "Respiration", "Digestion", "Fermentation"], answer: "Photosynthesis" },
    { q: "What is the chemical symbol for sodium?", choices: ["Na", "So", "Sd", "S"], answer: "Na" },
    { q: "What type of energy is stored in food?", choices: ["Chemical energy", "Kinetic energy", "Thermal energy", "Nuclear energy"], answer: "Chemical energy" },
    { q: "Which subatomic particle has a negative electric charge?", choices: ["Electron", "Proton", "Neutron", "Photon"], answer: "Electron" },
    { q: "What is the scientific study of living organisms called?", choices: ["Biology", "Geology", "Chemistry", "Physics"], answer: "Biology" },
    { q: "What is the closest star to Earth?", choices: ["The Sun", "Proxima Centauri", "Sirius", "Alpha Centauri"], answer: "The Sun" },
    { q: "What is the freezing point of water in Celsius?", choices: ["0", "32", "100", "-10"], answer: "0" },
    { q: "What organ pumps blood throughout the human body?", choices: ["Heart", "Lungs", "Liver", "Kidneys"], answer: "Heart" },
    { q: "What is the most abundant gas in Earth's atmosphere?", choices: ["Nitrogen", "Oxygen", "Carbon Dioxide", "Argon"], answer: "Nitrogen" },
    { q: "Which of these is a renewable energy source?", choices: ["Solar power", "Coal", "Natural gas", "Oil"], answer: "Solar power" },
    { q: "What do you call an animal that eats both plants and meat?", choices: ["Omnivore", "Herbivore", "Carnivore", "Detritivore"], answer: "Omnivore" },
    { q: "What is the pH of pure water considered to be?", choices: ["Neutral (7)", "Acidic", "Basic", "Undefined"], answer: "Neutral (7)" },
    { q: "What is the basic unit of heredity called?", choices: ["Gene", "Cell", "Protein", "Chromosome"], answer: "Gene" },
    { q: "What force keeps planets in orbit around the sun?", choices: ["Gravity", "Magnetism", "Nuclear force", "Friction"], answer: "Gravity" },
    { q: "Which state of matter has no definite shape or volume?", choices: ["Gas", "Solid", "Liquid", "Plasma"], answer: "Gas" },
    { q: "Which vitamin is produced when skin is exposed to sunlight?", choices: ["Vitamin D", "Vitamin C", "Vitamin A", "Vitamin B12"], answer: "Vitamin D" },
    { q: "What is the approximate speed of light in a vacuum?", choices: ["300,000 km/s", "150,000 km/s", "3,000 km/s", "1,000,000 km/s"], answer: "300,000 km/s" }
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
