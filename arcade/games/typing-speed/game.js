(function () {
  var GAME_ID = "typing-speed";
  var sentenceEl = document.getElementById("sentence");
  var typedEl = document.getElementById("typed");
  var scoreEl = document.getElementById("score");
  var bestEl = document.getElementById("best");
  var timeEl = document.getElementById("time");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");

  var SENTENCES = [
    "The quick brown fox jumps over the lazy dog near the riverbank.",
    "Practice makes perfect when you type a little every single day.",
    "A journey of a thousand miles begins with a single small step.",
    "Never underestimate the power of a good night of restful sleep.",
    "The old lighthouse keeper watched the stormy waves crash below.",
    "Learning to code opens doors to countless creative opportunities.",
    "She sold seashells by the seashore on a bright sunny morning.",
    "Coffee tastes better when shared with good friends and laughter.",
    "The mountain trail wound upward through pine trees and cool air.",
    "Every great achievement starts with the decision to simply try.",
    "Curiosity and patience are the best tools for solving any puzzle.",
    "The chef added a pinch of salt to balance the sweet dessert.",
    "Rainy afternoons are perfect for reading an exciting new book.",
    "Technology keeps changing, but good ideas always stand the test of time.",
    "The children laughed as they chased bubbles across the green lawn."
  ];

  var GAME_TIME = 60;
  var sentence, typedChars, startTime, finished, timerId, timeLeft;

  function refreshHud(wpm) {
    scoreEl.textContent = wpm || 0;
    var best = window.ArcadeCommon.getBest(GAME_ID) || 0;
    bestEl.textContent = best;
    timeEl.textContent = timeLeft;
  }

  function newGame() {
    sentence = window.ArcadeCommon.pick(SENTENCES);
    typedChars = "";
    startTime = null;
    finished = false;
    timeLeft = GAME_TIME;
    resultBanner.innerHTML = "";
    typedEl.value = "";
    typedEl.disabled = false;
    clearInterval(timerId);
    renderSentence();
    refreshHud(0);
    typedEl.focus();
  }

  function renderSentence() {
    var html = "";
    for (var i = 0; i < sentence.length; i++) {
      var ch = sentence[i];
      if (i < typedChars.length) {
        html += '<span class="' + (typedChars[i] === ch ? "correct" : "wrong") + '">' + escapeHtml(ch) + "</span>";
      } else {
        html += escapeHtml(ch);
      }
    }
    sentenceEl.innerHTML = html;
  }

  function escapeHtml(ch) {
    if (ch === "<") return "&lt;";
    if (ch === ">") return "&gt;";
    if (ch === "&") return "&amp;";
    if (ch === " ") return " ";
    return ch;
  }

  function startTimerIfNeeded() {
    if (startTime) return;
    startTime = performance.now();
    timerId = setInterval(function () {
      timeLeft--;
      refreshHud(currentWpm());
      if (timeLeft <= 0) finish();
    }, 1000);
  }

  function currentWpm() {
    if (!startTime) return 0;
    var elapsedMin = (performance.now() - startTime) / 60000;
    if (elapsedMin <= 0) return 0;
    var words = typedChars.length / 5;
    return Math.round(words / elapsedMin);
  }

  function finish() {
    if (finished) return;
    finished = true;
    clearInterval(timerId);
    typedEl.disabled = true;
    var elapsedMin = startTime ? (performance.now() - startTime) / 60000 : GAME_TIME / 60;
    if (elapsedMin <= 0) elapsedMin = GAME_TIME / 60;
    var words = typedChars.length / 5;
    var wpm = Math.round(words / elapsedMin);
    var correctCount = 0;
    for (var i = 0; i < typedChars.length; i++) {
      if (typedChars[i] === sentence[i]) correctCount++;
    }
    var accuracy = typedChars.length ? Math.round((correctCount / typedChars.length) * 100) : 0;
    var improved = window.ArcadeCommon.setBest(GAME_ID, wpm);
    refreshHud(wpm);
    resultBanner.innerHTML = '<span class="overlay-win">' + wpm + " WPM, " + accuracy + "% accuracy" + (improved ? " — new best! 🏆" : "") + "</span>";
  }

  typedEl.addEventListener("input", function () {
    if (finished) return;
    startTimerIfNeeded();
    typedChars = typedEl.value;
    renderSentence();
    if (typedChars === sentence) {
      finish();
    } else if (typedChars.length >= sentence.length) {
      finish();
    }
  });

  restartBtn.addEventListener("click", newGame);
  newGame();
})();
