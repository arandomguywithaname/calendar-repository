(function () {
  var GAME_ID = "emoji-guess";
  var scoreEl = document.getElementById("score");
  var progressEl = document.getElementById("progress");
  var questionEl = document.getElementById("question");
  var choicesEl = document.getElementById("choices");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");

  var ROUND_SIZE = 10;

  var PUZZLES = [
    { q: "🦁👑", choices: ["The Lion King", "The Jungle Book", "Madagascar", "Zootopia"], answer: "The Lion King" },
    { q: "🕸️🕷️🦸", choices: ["Spider-Man", "Batman", "Iron Man", "Aquaman"], answer: "Spider-Man" },
    { q: "❄️👸⛄", choices: ["Frozen", "Moana", "Encanto", "Brave"], answer: "Frozen" },
    { q: "🐠🔍🌊", choices: ["Finding Nemo", "The Little Mermaid", "Shark Tale", "Moana"], answer: "Finding Nemo" },
    { q: "🍫🏭👦", choices: ["Charlie and the Chocolate Factory", "Willy Wonka", "Matilda", "Hansel and Gretel"], answer: "Charlie and the Chocolate Factory" },
    { q: "🚢🧊💔", choices: ["Titanic", "The Perfect Storm", "Poseidon", "Jaws"], answer: "Titanic" },
    { q: "👽📞🚲", choices: ["E.T.", "Close Encounters", "Men in Black", "District 9"], answer: "E.T." },
    { q: "🦖🏝️🚙", choices: ["Jurassic Park", "King Kong", "Godzilla", "The Land Before Time"], answer: "Jurassic Park" },
    { q: "💍🧙‍♂️🌋", choices: ["The Lord of the Rings", "Harry Potter", "The Hobbit", "Narnia"], answer: "The Lord of the Rings" },
    { q: "🐝🎬🍯", choices: ["Bee Movie", "A Bug's Life", "Antz", "Ratatouille"], answer: "Bee Movie" },
    { q: "⚡👦🧙", choices: ["Harry Potter", "Percy Jackson", "Merlin", "The Sword in the Stone"], answer: "Harry Potter" },
    { q: "🤖❤️🌱", choices: ["WALL-E", "Big Hero 6", "Robots", "The Iron Giant"], answer: "WALL-E" },
    { q: "🚗🏁⚡", choices: ["Cars", "Speed Racer", "The Fast and the Furious", "Turbo"], answer: "Cars" },
    { q: "👻🚫📟", choices: ["Ghostbusters", "Casper", "The Sixth Sense", "Poltergeist"], answer: "Ghostbusters" },
    { q: "🦇🌃🦸", choices: ["Batman", "Spider-Man", "Superman", "Daredevil"], answer: "Batman" },
    { q: "🎃👠🕛", choices: ["Cinderella", "Snow White", "Sleeping Beauty", "Rapunzel"], answer: "Cinderella" },
    { q: "🦈🌊🏊", choices: ["Jaws", "Finding Nemo", "The Perfect Storm", "Titanic"], answer: "Jaws" },
    { q: "🏠🎈👴", choices: ["Up", "Up in the Air", "The Incredibles", "Cloudy with a Chance of Meatballs"], answer: "Up" },
    { q: "🍯🐻🌳", choices: ["Winnie the Pooh", "Paddington", "Brother Bear", "The Jungle Book"], answer: "Winnie the Pooh" },
    { q: "🐸👑💋", choices: ["The Frog Prince", "The Princess and the Frog", "Shrek", "Frozen"], answer: "The Frog Prince" },
    { q: "🐭🍳👨‍🍳", choices: ["Ratatouille", "Bee Movie", "Flushed Away", "An American Tail"], answer: "Ratatouille" },
    { q: "🐠👑🌊", choices: ["The Little Mermaid", "Moana", "Finding Nemo", "Aquaman"], answer: "The Little Mermaid" }
  ];

  function buildRound() {
    return window.ArcadeCommon.shuffle(PUZZLES).slice(0, ROUND_SIZE).map(function (item) {
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
    questionEl.style.fontSize = "3.2rem";
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
