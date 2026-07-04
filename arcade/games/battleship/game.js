(function () {
  var GAME_ID = "battleship";
  var SIZE = 8;
  var FLEET = [5, 4, 3, 3, 2];

  var playerBoardEl = document.getElementById("player-board");
  var cpuBoardEl = document.getElementById("cpu-board");
  var movesEl = document.getElementById("moves");
  var bestEl = document.getElementById("best");
  var turnStat = document.getElementById("turn-stat");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");

  var player, cpu, playerShots, cpuShots, cpuAI, turn, over, moves;

  function emptyGrid(fill) {
    var g = [];
    for (var r = 0; r < SIZE; r++) {
      var row = [];
      for (var c = 0; c < SIZE; c++) row.push(fill === undefined ? null : fill);
      g.push(row);
    }
    return g;
  }

  function inBounds(r, c) {
    return r >= 0 && r < SIZE && c >= 0 && c < SIZE;
  }

  function placeFleet() {
    var grid = emptyGrid(null);
    var ships = [];
    FLEET.forEach(function (size, idx) {
      var placed = false;
      var attempts = 0;
      while (!placed && attempts < 500) {
        attempts++;
        var horiz = Math.random() < 0.5;
        var r = window.ArcadeCommon.randInt(0, SIZE - 1);
        var c = window.ArcadeCommon.randInt(0, SIZE - 1);
        var cells = [];
        var ok = true;
        for (var i = 0; i < size; i++) {
          var rr = horiz ? r : r + i;
          var cc = horiz ? c + i : c;
          if (!inBounds(rr, cc) || grid[rr][cc] !== null) { ok = false; break; }
          cells.push([rr, cc]);
        }
        if (ok) {
          cells.forEach(function (cell) { grid[cell[0]][cell[1]] = idx; });
          ships.push({ size: size, cells: cells, hits: 0, sunk: false });
          placed = true;
        }
      }
    });
    return { grid: grid, ships: ships };
  }

  function allSunk(fleet) {
    return fleet.ships.every(function (s) { return s.sunk; });
  }

  function refreshHud() {
    movesEl.textContent = moves;
    var best = window.ArcadeCommon.getBest(GAME_ID);
    bestEl.textContent = best === null ? "-" : best;
    if (!over) {
      turnStat.innerHTML = turn === "player"
        ? '<span data-i18n="common.yourTurn">' + window.ArcadeI18n.t("common.yourTurn") + "</span>"
        : '<span data-i18n="common.cpuTurn">' + window.ArcadeI18n.t("common.cpuTurn") + "</span>";
    }
  }

  function newGame() {
    player = placeFleet();
    cpu = placeFleet();
    playerShots = emptyGrid(null);
    cpuShots = emptyGrid(null);
    cpuAI = { queue: [] };
    turn = "player";
    over = false;
    moves = 0;
    resultBanner.innerHTML = "";
    refreshHud();
    render();
  }

  function renderBoard(el, isPlayerBoard) {
    el.innerHTML = "";
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        var cell = document.createElement("div");
        cell.className = "cell";
        if (isPlayerBoard) {
          var shotState = cpuShots[r][c];
          var shipIdx = player.grid[r][c];
          if (shotState === "hit") {
            var ship = shipIdx !== null ? player.ships[shipIdx] : null;
            cell.className += ship && ship.sunk ? " sunk" : " hit";
            cell.textContent = "💥";
          } else if (shotState === "miss") {
            cell.className += " miss";
            cell.textContent = "🌊";
          } else if (shipIdx !== null) {
            cell.className += " ship";
            cell.textContent = "🚢";
          }
        } else {
          var pShot = playerShots[r][c];
          if (pShot === "hit") {
            cell.className += " hit";
            cell.textContent = "💥";
          } else if (pShot === "miss") {
            cell.className += " miss";
            cell.textContent = "🌊";
          } else {
            (function (rr, cc) {
              cell.addEventListener("click", function () { fireAtCpu(rr, cc); });
            })(r, c);
          }
        }
        el.appendChild(cell);
      }
    }
  }

  function render() {
    renderBoard(playerBoardEl, true);
    renderBoard(cpuBoardEl, false);
  }

  function fireAtCpu(r, c) {
    if (over || turn !== "player" || playerShots[r][c] !== null) return;
    var shipIdx = cpu.grid[r][c];
    if (shipIdx !== null) {
      playerShots[r][c] = "hit";
      var ship = cpu.ships[shipIdx];
      ship.hits++;
      if (ship.hits === ship.size) {
        ship.sunk = true;
        window.ArcadeCommon.toast("You sank a ship!");
      }
    } else {
      playerShots[r][c] = "miss";
    }
    moves++;
    refreshHud();
    render();

    if (allSunk(cpu)) {
      endGame("player");
      return;
    }
    turn = "cpu";
    refreshHud();
    setTimeout(cpuTurn, 450);
  }

  function nextCpuTarget() {
    while (cpuAI.queue.length) {
      var cand = cpuAI.queue.shift();
      if (inBounds(cand[0], cand[1]) && cpuShots[cand[0]][cand[1]] === null) return cand;
    }
    var untried = [];
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        if (cpuShots[r][c] === null) untried.push([r, c]);
      }
    }
    return window.ArcadeCommon.pick(untried);
  }

  function cpuTurn() {
    if (over) return;
    var target = nextCpuTarget();
    if (!target) return;
    var r = target[0], c = target[1];
    var shipIdx = player.grid[r][c];
    if (shipIdx !== null) {
      cpuShots[r][c] = "hit";
      var ship = player.ships[shipIdx];
      ship.hits++;
      if (ship.hits === ship.size) {
        ship.sunk = true;
        cpuAI.queue = [];
      } else {
        [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].forEach(function (n) {
          if (inBounds(n[0], n[1]) && cpuShots[n[0]][n[1]] === null) cpuAI.queue.push(n);
        });
      }
    } else {
      cpuShots[r][c] = "miss";
    }
    render();

    if (allSunk(player)) {
      endGame("cpu");
      return;
    }
    turn = "player";
    refreshHud();
  }

  function endGame(winner) {
    over = true;
    if (winner === "player") {
      var improved = window.ArcadeCommon.setBestLowerIsBetter(GAME_ID, moves);
      resultBanner.innerHTML = '<span class="overlay-win">' + window.ArcadeI18n.t("common.youWin") +
        (improved ? " 🏆" : "") + "</span>";
    } else {
      resultBanner.innerHTML = '<span class="overlay-lose">' + window.ArcadeI18n.t("common.youLose") + "</span>";
    }
    refreshHud();
    render();
  }

  restartBtn.addEventListener("click", newGame);
  newGame();
})();
