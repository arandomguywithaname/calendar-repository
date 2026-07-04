(function () {
  var GAME_ID = "trivia-history";
  var scoreEl = document.getElementById("score");
  var progressEl = document.getElementById("progress");
  var questionEl = document.getElementById("question");
  var choicesEl = document.getElementById("choices");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");

  var ROUND_SIZE = 10;

  var QUESTIONS = [
    { q: "Who was the first President of the United States?", choices: ["George Washington", "Thomas Jefferson", "John Adams", "Abraham Lincoln"], answer: "George Washington" },
    { q: "In which year did World War II end?", choices: ["1943", "1945", "1947", "1950"], answer: "1945" },
    { q: "Which ancient civilization built the pyramids of Giza?", choices: ["Egyptians", "Romans", "Greeks", "Mayans"], answer: "Egyptians" },
    { q: "Who was the primary author of the Declaration of Independence?", choices: ["Thomas Jefferson", "Benjamin Franklin", "John Adams", "James Madison"], answer: "Thomas Jefferson" },
    { q: "In which year did the Berlin Wall fall?", choices: ["1985", "1989", "1991", "1993"], answer: "1989" },
    { q: "Which empire was ruled by Julius Caesar?", choices: ["Roman Empire", "Ottoman Empire", "Persian Empire", "Byzantine Empire"], answer: "Roman Empire" },
    { q: "What was the name of the ship that carried the Pilgrims to America in 1620?", choices: ["Mayflower", "Santa Maria", "Endeavour", "Beagle"], answer: "Mayflower" },
    { q: "Who was the leader of Nazi Germany during World War II?", choices: ["Adolf Hitler", "Joseph Stalin", "Benito Mussolini", "Francisco Franco"], answer: "Adolf Hitler" },
    { q: "In which year did the French Revolution begin?", choices: ["1776", "1789", "1804", "1815"], answer: "1789" },
    { q: "Which war was fought between the northern and southern United States?", choices: ["The Civil War", "The Revolutionary War", "World War I", "The Cold War"], answer: "The Civil War" },
    { q: "Who was the first person to walk on the Moon?", choices: ["Neil Armstrong", "Buzz Aldrin", "Yuri Gagarin", "John Glenn"], answer: "Neil Armstrong" },
    { q: "Which ancient wonder was located in Alexandria, Egypt?", choices: ["The Lighthouse of Alexandria", "The Colossus of Rhodes", "The Hanging Gardens", "The Great Pyramid"], answer: "The Lighthouse of Alexandria" },
    { q: "Who was Queen of England during the defeat of the Spanish Armada?", choices: ["Elizabeth I", "Victoria", "Mary I", "Anne"], answer: "Elizabeth I" },
    { q: "The Cold War was primarily a conflict between which two nations?", choices: ["USA and USSR", "USA and China", "UK and Germany", "France and Russia"], answer: "USA and USSR" },
    { q: "Which explorer is credited with reaching America in 1492?", choices: ["Christopher Columbus", "Ferdinand Magellan", "Vasco da Gama", "Marco Polo"], answer: "Christopher Columbus" },
    { q: "What was the Renaissance primarily known for?", choices: ["A rebirth of art and learning", "A period of war", "An economic depression", "A religious crusade"], answer: "A rebirth of art and learning" },
    { q: "Which country was first to industrialize during the Industrial Revolution?", choices: ["Great Britain", "Germany", "United States", "France"], answer: "Great Britain" },
    { q: "Who led the Soviet Union during much of the early Cold War?", choices: ["Joseph Stalin", "Vladimir Lenin", "Mikhail Gorbachev", "Nikita Khrushchev"], answer: "Joseph Stalin" },
    { q: "The Great Wall was built primarily to protect which country?", choices: ["China", "Japan", "Mongolia", "Korea"], answer: "China" },
    { q: "Which document did King John of England sign in 1215 to limit royal power?", choices: ["Magna Carta", "The Bill of Rights", "The Constitution", "The Treaty of Versailles"], answer: "Magna Carta" },
    { q: "In which year did World War I begin?", choices: ["1912", "1914", "1918", "1920"], answer: "1914" },
    { q: "Who was crowned Emperor of France in 1804?", choices: ["Napoleon Bonaparte", "Louis XIV", "Charlemagne", "Louis XVI"], answer: "Napoleon Bonaparte" },
    { q: "Which ancient civilization is credited with inventing democracy?", choices: ["Ancient Greece", "Ancient Rome", "Ancient Egypt", "Ancient China"], answer: "Ancient Greece" },
    { q: "In which year did the Titanic sink?", choices: ["1905", "1912", "1920", "1931"], answer: "1912" },
    { q: "Who was the British Prime Minister during most of World War II?", choices: ["Winston Churchill", "Neville Chamberlain", "Clement Attlee", "Anthony Eden"], answer: "Winston Churchill" },
    { q: "Which treaty officially ended World War I?", choices: ["Treaty of Versailles", "Treaty of Paris", "Treaty of Ghent", "Treaty of Tordesillas"], answer: "Treaty of Versailles" },
    { q: "The Roman Empire officially split into Eastern and Western halves under which emperor?", choices: ["Diocletian", "Constantine", "Nero", "Augustus"], answer: "Diocletian" }
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
