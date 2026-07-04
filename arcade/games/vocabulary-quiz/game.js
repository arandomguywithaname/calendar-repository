(function () {
  var GAME_ID = "vocabulary-quiz";
  var scoreEl = document.getElementById("score");
  var progressEl = document.getElementById("progress");
  var questionEl = document.getElementById("question");
  var choicesEl = document.getElementById("choices");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");

  var ROUND_SIZE = 10;

  var WORDS = [
    { word: "Ephemeral", answer: "Lasting for a very short time", wrong: ["Extremely heavy", "Related to the stars", "Very loud"] },
    { word: "Benevolent", answer: "Kind and generous", wrong: ["Angry and hostile", "Very tired", "Highly intelligent"] },
    { word: "Candid", answer: "Truthful and straightforward", wrong: ["Secretive and shy", "Extremely colorful", "Slow moving"] },
    { word: "Meticulous", answer: "Showing great attention to detail", wrong: ["Careless and messy", "Loud and boastful", "Very fast"] },
    { word: "Ambiguous", answer: "Open to more than one interpretation", wrong: ["Perfectly clear", "Extremely rare", "Highly dangerous"] },
    { word: "Resilient", answer: "Able to recover quickly from difficulties", wrong: ["Easily broken", "Very colorful", "Extremely quiet"] },
    { word: "Frugal", answer: "Economical with money or resources", wrong: ["Wasteful with money", "Very generous", "Extremely wealthy"] },
    { word: "Gregarious", answer: "Fond of company; sociable", wrong: ["Preferring to be alone", "Easily frightened", "Highly organized"] },
    { word: "Lethargic", answer: "Lacking energy; sluggish", wrong: ["Full of energy", "Extremely happy", "Very intelligent"] },
    { word: "Obsolete", answer: "No longer in use; outdated", wrong: ["Brand new", "Extremely valuable", "Very popular"] },
    { word: "Pragmatic", answer: "Dealing with things sensibly and realistically", wrong: ["Overly emotional", "Extremely artistic", "Very forgetful"] },
    { word: "Tenacious", answer: "Holding firmly to a course of action", wrong: ["Giving up easily", "Very forgetful", "Extremely shy"] },
    { word: "Verbose", answer: "Using more words than needed", wrong: ["Using very few words", "Speaking quietly", "Speaking a foreign language"] },
    { word: "Zealous", answer: "Showing great energy and enthusiasm", wrong: ["Showing no interest", "Feeling very tired", "Being extremely cautious"] },
    { word: "Candor", answer: "The quality of being open and honest", wrong: ["The quality of being secretive", "A type of light", "A kind of dance"] },
    { word: "Docile", answer: "Ready to accept control; easily managed", wrong: ["Aggressive and hard to control", "Extremely intelligent", "Very loud"] },
    { word: "Eloquent", answer: "Fluent and persuasive in speaking", wrong: ["Unable to speak clearly", "Very quiet", "Extremely rude"] },
    { word: "Futile", answer: "Incapable of producing a useful result", wrong: ["Highly effective", "Extremely simple", "Very expensive"] },
    { word: "Innate", answer: "Inborn; natural rather than learned", wrong: ["Learned through practice", "Extremely rare", "Artificially created"] },
    { word: "Jubilant", answer: "Feeling great happiness and triumph", wrong: ["Feeling deep sadness", "Feeling very tired", "Feeling confused"] },
    { word: "Naive", answer: "Showing a lack of experience or judgment", wrong: ["Showing great wisdom", "Being very cautious", "Being extremely wealthy"] },
    { word: "Optimist", answer: "A person who has a positive outlook on things", wrong: ["A person who expects the worst", "A person who studies stars", "A person who avoids people"] },
    { word: "Quaint", answer: "Attractively unusual or old-fashioned", wrong: ["Extremely modern", "Very dangerous", "Loud and chaotic"] },
    { word: "Reticent", answer: "Not revealing thoughts or feelings readily", wrong: ["Very talkative", "Extremely generous", "Highly energetic"] },
    { word: "Sagacious", answer: "Having good judgment; wise", wrong: ["Lacking common sense", "Very forgetful", "Extremely emotional"] },
    { word: "Tranquil", answer: "Free from disturbance; calm", wrong: ["Extremely chaotic", "Very loud", "Highly dangerous"] },
    { word: "Vivid", answer: "Producing powerful feelings or clear images in the mind", wrong: ["Dull and lifeless", "Very quiet", "Extremely small"] }
  ];

  function buildRound() {
    return window.ArcadeCommon.shuffle(WORDS).slice(0, ROUND_SIZE).map(function (item) {
      return { q: "What does “" + item.word + "” mean?", choices: item.wrong.concat([item.answer]), answer: item.answer };
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
      : '<span class="overlay-lose">' + window.ArcadeI18n.t("common.wrong") + "</span>";
    setTimeout(function () {
      index++;
      resultBanner.innerHTML = "";
      if (index < ROUND_SIZE) {
        renderQuestion();
      } else {
        finish();
      }
    }, 1200);
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
