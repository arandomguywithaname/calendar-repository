(function () {
  var GAME_ID = "higher-lower";
  var cardEl = document.getElementById("current-card");
  var streakEl = document.getElementById("streak");
  var bestEl = document.getElementById("best");
  var resultBanner = document.getElementById("result-banner");
  var higherBtn = document.getElementById("higher-btn");
  var lowerBtn = document.getElementById("lower-btn");
  var restartBtn = document.getElementById("restart");

  var SUITS = ["♠", "♥", "♦", "♣"];
  var RANK_LABELS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

  var deck, current, streak;

  function isRed(card) { return card.suit === "♥" || card.suit === "♦"; }
  function label(card) { return RANK_LABELS[card.rank - 1] + card.suit; }

  function buildDeck() {
    var d = [];
    SUITS.forEach(function (s) {
      for (var r = 1; r <= 13; r++) d.push({ suit: s, rank: r });
    });
    return window.ArcadeCommon.shuffle(d);
  }

  function drawNext() {
    if (deck.length === 0) deck = buildDeck();
    return deck.shift();
  }

  function refreshHud() {
    streakEl.textContent = streak;
    var best = window.ArcadeCommon.getBest(GAME_ID);
    bestEl.textContent = best === null ? 0 : best;
  }

  function showCard(card) {
    cardEl.className = "hl-card" + (isRed(card) ? " red" : "");
    cardEl.textContent = label(card);
  }

  function newGame() {
    deck = buildDeck();
    current = drawNext();
    streak = 0;
    resultBanner.innerHTML = "";
    showCard(current);
    refreshHud();
  }

  function guess(direction) {
    var next = drawNext();
    var result;
    if (next.rank === current.rank) {
      result = "tie";
    } else if (next.rank > current.rank) {
      result = direction === "higher" ? "correct" : "wrong";
    } else {
      result = direction === "lower" ? "correct" : "wrong";
    }

    if (result === "correct") {
      streak++;
      window.ArcadeCommon.setBest(GAME_ID, streak);
      resultBanner.innerHTML = '<span class="overlay-win">Correct! ' + label(next) + " — streak " + streak + "</span>";
    } else if (result === "tie") {
      streak = 0;
      resultBanner.innerHTML = '<span class="overlay-lose">Tie at ' + label(next) + " — streak reset</span>";
    } else {
      streak = 0;
      resultBanner.innerHTML = '<span class="overlay-lose">Wrong! ' + label(next) + " — streak reset</span>";
    }

    current = next;
    showCard(current);
    refreshHud();
  }

  higherBtn.addEventListener("click", function () { guess("higher"); });
  lowerBtn.addEventListener("click", function () { guess("lower"); });
  restartBtn.addEventListener("click", newGame);

  newGame();
})();
