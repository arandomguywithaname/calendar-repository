(function () {
  var GAME_ID = "trivia-movies";
  var scoreEl = document.getElementById("score");
  var progressEl = document.getElementById("progress");
  var questionEl = document.getElementById("question");
  var choicesEl = document.getElementById("choices");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");

  var ROUND_SIZE = 10;

  var QUESTIONS = [
    { q: "Who directed the movie 'Jaws'?", choices: ["Steven Spielberg", "George Lucas", "James Cameron", "Martin Scorsese"], answer: "Steven Spielberg" },
    { q: "Which movie features a character named Jack Dawson?", choices: ["Titanic", "The Aviator", "Inception", "Catch Me If You Can"], answer: "Titanic" },
    { q: "In 'The Wizard of Oz', what color are Dorothy's famous slippers?", choices: ["Ruby", "Silver", "Gold", "Emerald"], answer: "Ruby" },
    { q: "Which actor played Iron Man in the Marvel Cinematic Universe?", choices: ["Robert Downey Jr.", "Chris Evans", "Chris Hemsworth", "Mark Ruffalo"], answer: "Robert Downey Jr." },
    { q: "Which 2009 film about blue aliens became a massive box-office hit?", choices: ["Avatar", "Tron: Legacy", "District 9", "Gravity"], answer: "Avatar" },
    { q: "Which movie is famous for the line 'May the Force be with you'?", choices: ["Star Wars", "Star Trek", "Guardians of the Galaxy", "Dune"], answer: "Star Wars" },
    { q: "Who played the title character in 'Forrest Gump'?", choices: ["Tom Hanks", "Tom Cruise", "Kevin Costner", "Robin Williams"], answer: "Tom Hanks" },
    { q: "Which animation studio produced 'Toy Story'?", choices: ["Pixar", "DreamWorks", "Illumination", "Warner Bros."], answer: "Pixar" },
    { q: "What is the name of the fictional African country in 'Black Panther'?", choices: ["Wakanda", "Zamunda", "Genovia", "Latveria"], answer: "Wakanda" },
    { q: "Which 1995 film features a talking pig named Babe?", choices: ["Babe", "Charlotte's Web", "Chicken Run", "Shrek"], answer: "Babe" },
    { q: "Who directed 'Pulp Fiction'?", choices: ["Quentin Tarantino", "Martin Scorsese", "David Fincher", "Christopher Nolan"], answer: "Quentin Tarantino" },
    { q: "In 'The Matrix', what color pill does Neo take to learn the truth?", choices: ["Red", "Blue", "Green", "Black"], answer: "Red" },
    { q: "Which actress played Hermione Granger in the Harry Potter films?", choices: ["Emma Watson", "Emma Stone", "Emma Roberts", "Kate Winslet"], answer: "Emma Watson" },
    { q: "What is the name of Jack Sparrow's ship in 'Pirates of the Caribbean'?", choices: ["The Black Pearl", "The Flying Dutchman", "The Queen Anne's Revenge", "The Interceptor"], answer: "The Black Pearl" },
    { q: "Which film won Best Picture in 1994 and follows a man with a low IQ through history?", choices: ["Forrest Gump", "Pulp Fiction", "The Shawshank Redemption", "Braveheart"], answer: "Forrest Gump" },
    { q: "Who played the Joker in 'The Dark Knight' (2008)?", choices: ["Heath Ledger", "Jack Nicholson", "Joaquin Phoenix", "Jared Leto"], answer: "Heath Ledger" },
    { q: "Which animated movie features a snowman named Olaf?", choices: ["Frozen", "Wreck-It Ralph", "Tangled", "Moana"], answer: "Frozen" },
    { q: "What is the name of the boy wizard in the 'Harry Potter' series?", choices: ["Harry Potter", "Ron Weasley", "Neville Longbottom", "Draco Malfoy"], answer: "Harry Potter" },
    { q: "Which long-running film series features the British spy James Bond?", choices: ["007 series", "Bourne series", "Mission Impossible", "Kingsman"], answer: "007 series" },
    { q: "Who directed 'Jurassic Park'?", choices: ["Steven Spielberg", "James Cameron", "Ridley Scott", "Tim Burton"], answer: "Steven Spielberg" },
    { q: "Which movie features an old man's house lifted into the air by balloons?", choices: ["Up", "The Incredibles", "Coco", "Inside Out"], answer: "Up" },
    { q: "In 'Star Wars', who is Luke Skywalker's father?", choices: ["Darth Vader", "Obi-Wan Kenobi", "Yoda", "Han Solo"], answer: "Darth Vader" },
    { q: "Who played Katniss Everdeen in 'The Hunger Games' films?", choices: ["Jennifer Lawrence", "Emma Stone", "Kristen Stewart", "Shailene Woodley"], answer: "Jennifer Lawrence" },
    { q: "Which movie is about a clownfish searching the ocean for his missing son?", choices: ["Finding Nemo", "Shark Tale", "Finding Dory", "The Little Mermaid"], answer: "Finding Nemo" },
    { q: "Who carries the One Ring for most of 'The Lord of the Rings' trilogy?", choices: ["Frodo Baggins", "Bilbo Baggins", "Samwise Gamgee", "Peregrin Took"], answer: "Frodo Baggins" },
    { q: "Which actor is best known for playing Captain Jack Sparrow?", choices: ["Johnny Depp", "Orlando Bloom", "Geoffrey Rush", "Javier Bardem"], answer: "Johnny Depp" }
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
