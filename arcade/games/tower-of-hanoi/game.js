(function () {
  var GAME_ID = "tower-of-hanoi";
  var movesEl = document.getElementById("moves");
  var optimalEl = document.getElementById("optimal");
  var bestEl = document.getElementById("best");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");
  var pegEls = [document.getElementById("peg-0"), document.getElementById("peg-1"), document.getElementById("peg-2")];

  var N = 5;
  var COLORS = ["#ff5da2", "#7c5cff", "#29e0c9", "#ffb84d", "#3ddc84", "#4ac3ff"];

  var pegs, moves, selected, over, optimal;

  function refreshHud() {
    movesEl.textContent = moves;
    optimalEl.textContent = optimal;
    var best = window.ArcadeCommon.getBest(GAME_ID);
    bestEl.textContent = best === null ? "-" : best;
  }

  function newGame() {
    pegs = [[], [], []];
    for (var i = N; i >= 1; i--) pegs[0].push(i);
    moves = 0;
    selected = null;
    over = false;
    optimal = Math.pow(2, N) - 1;
    resultBanner.innerHTML = "";
    refreshHud();
    render();
  }

  function render() {
    pegEls.forEach(function (pegEl, i) {
      pegEl.querySelectorAll(".disc").forEach(function (d) { d.remove(); });
      pegEl.classList.toggle("selected", selected === i);
      pegs[i].forEach(function (size) {
        var disc = document.createElement("div");
        disc.className = "disc";
        var widthPct = 30 + (size / N) * 65;
        disc.style.width = widthPct + "%";
        disc.style.background = COLORS[(size - 1) % COLORS.length];
        disc.textContent = size;
        pegEl.appendChild(disc);
      });
    });
  }

  function handlePeg(i) {
    if (over) return;
    if (selected === null) {
      if (pegs[i].length === 0) return;
      selected = i;
    } else if (selected === i) {
      selected = null;
    } else {
      var fromPeg = pegs[selected];
      var toPeg = pegs[i];
      var disc = fromPeg[fromPeg.length - 1];
      var topOfTo = toPeg[toPeg.length - 1];
      if (topOfTo !== undefined && disc > topOfTo) {
        window.ArcadeCommon.toast("Can't place a bigger disc on a smaller one!");
        selected = null;
      } else {
        fromPeg.pop();
        toPeg.push(disc);
        moves++;
        selected = null;
        refreshHud();
        checkWin();
      }
    }
    render();
  }

  function checkWin() {
    if (pegs[2].length === N) {
      over = true;
      var improved = window.ArcadeCommon.setBestLowerIsBetter(GAME_ID, moves);
      resultBanner.innerHTML = '<span class="overlay-win">' + window.ArcadeI18n.t("common.youWin") +
        " — " + moves + " " + window.ArcadeI18n.t("common.moves") +
        (moves === optimal ? " (optimal!)" : "") + (improved ? " 🏆" : "") + "</span>";
      refreshHud();
    }
  }

  pegEls.forEach(function (pegEl, i) {
    pegEl.addEventListener("click", function () { handlePeg(i); });
  });

  restartBtn.addEventListener("click", newGame);
  newGame();
})();
