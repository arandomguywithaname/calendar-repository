(function () {
  var GAME_ID = "pacman-lite";
  var canvas = document.getElementById("board");
  var ctx = canvas.getContext("2d");
  var scoreEl = document.getElementById("score");
  var bestEl = document.getElementById("best");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");

  var CELLS = 15;
  var GRID = canvas.width / CELLS;
  var GHOST_MS = 420;

  function isWall(r, c) {
    if (r < 0 || c < 0 || r >= CELLS || c >= CELLS) return true;
    if (r === 0 || r === CELLS - 1 || c === 0 || c === CELLS - 1) return true;
    if (r % 2 === 0 && c % 2 === 0 && r >= 2 && r <= CELLS - 3 && c >= 2 && c <= CELLS - 3) return true;
    return false;
  }

  var dots, player, ghosts, score, over, won, ghostTimer;

  function buildDots() {
    var d = [];
    for (var r = 0; r < CELLS; r++) {
      d.push([]);
      for (var c = 0; c < CELLS; c++) {
        d[r].push(!isWall(r, c));
      }
    }
    return d;
  }

  function countDots() {
    var n = 0;
    for (var r = 0; r < CELLS; r++) {
      for (var c = 0; c < CELLS; c++) {
        if (dots[r][c]) n++;
      }
    }
    return n;
  }

  function refreshHud() {
    scoreEl.textContent = score;
    bestEl.textContent = window.ArcadeCommon.getBest(GAME_ID) || 0;
  }

  function newGame() {
    dots = buildDots();
    player = { r: 1, c: 1, dir: { x: 1, y: 0 } };
    dots[player.r][player.c] = false;
    ghosts = [
      { r: CELLS - 2, c: CELLS - 2, color: "#ff5d5d" },
      { r: 1, c: CELLS - 2, color: "#7c5cff" }
    ];
    ghosts.forEach(function (g) { dots[g.r][g.c] = false; });
    score = 0;
    over = false;
    won = false;
    resultBanner.innerHTML = "";
    refreshHud();
    clearInterval(ghostTimer);
    ghostTimer = setInterval(tickGhosts, GHOST_MS);
    draw();
  }

  function cellsEqual(a, b) { return a.r === b.r && a.c === b.c; }

  function checkCollision() {
    for (var i = 0; i < ghosts.length; i++) {
      if (cellsEqual(ghosts[i], player)) return true;
    }
    return false;
  }

  function endGame(win) {
    over = true;
    won = win;
    clearInterval(ghostTimer);
    if (win) {
      window.ArcadeCommon.setBest(GAME_ID, score);
      resultBanner.innerHTML = '<span class="overlay-win">' + window.ArcadeI18n.t("common.youWin") + "</span>";
    } else {
      window.ArcadeCommon.setBest(GAME_ID, score);
      resultBanner.innerHTML = '<span class="overlay-lose">' + window.ArcadeI18n.t("common.gameOver") + "</span>";
    }
    refreshHud();
    draw();
  }

  function movePlayer(dx, dy) {
    if (over) return;
    var nr = player.r + dy;
    var nc = player.c + dx;
    if (isWall(nr, nc)) return;
    player.r = nr;
    player.c = nc;
    player.dir = { x: dx, y: dy };
    if (dots[nr][nc]) {
      dots[nr][nc] = false;
      score += 10;
      refreshHud();
    }
    if (checkCollision()) {
      endGame(false);
      return;
    }
    if (countDots() === 0) {
      endGame(true);
      return;
    }
    draw();
  }

  function neighbors(cell) {
    var opts = [
      { r: cell.r - 1, c: cell.c, x: 0, y: -1 },
      { r: cell.r + 1, c: cell.c, x: 0, y: 1 },
      { r: cell.r, c: cell.c - 1, x: -1, y: 0 },
      { r: cell.r, c: cell.c + 1, x: 1, y: 0 }
    ];
    return opts.filter(function (o) { return !isWall(o.r, o.c); });
  }

  function tickGhosts() {
    if (over) return;
    ghosts.forEach(function (g) {
      var opts = neighbors(g);
      if (!opts.length) return;
      var choice;
      if (Math.random() < 0.65) {
        var best = null, bestDist = Infinity;
        opts.forEach(function (o) {
          var dist = Math.abs(o.r - player.r) + Math.abs(o.c - player.c);
          if (dist < bestDist) { bestDist = dist; best = [o]; }
          else if (dist === bestDist) { best.push(o); }
        });
        choice = window.ArcadeCommon.pick(best);
      } else {
        choice = window.ArcadeCommon.pick(opts);
      }
      g.r = choice.r;
      g.c = choice.c;
    });
    if (checkCollision()) {
      endGame(false);
      return;
    }
    draw();
  }

  function draw() {
    ctx.fillStyle = "#0f1220";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (var r = 0; r < CELLS; r++) {
      for (var c = 0; c < CELLS; c++) {
        if (isWall(r, c)) {
          ctx.fillStyle = "#242a45";
          ctx.fillRect(c * GRID, r * GRID, GRID, GRID);
        } else if (dots[r][c]) {
          ctx.fillStyle = "#ffd166";
          ctx.beginPath();
          ctx.arc(c * GRID + GRID / 2, r * GRID + GRID / 2, Math.max(2, GRID * 0.09), 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // player
    var cx = player.c * GRID + GRID / 2;
    var cy = player.r * GRID + GRID / 2;
    var rad = GRID / 2 - 2;
    var dirAngle = 0;
    if (player.dir.x === 1) dirAngle = 0;
    else if (player.dir.x === -1) dirAngle = Math.PI;
    else if (player.dir.y === 1) dirAngle = Math.PI / 2;
    else if (player.dir.y === -1) dirAngle = -Math.PI / 2;
    var open = 0.22 * Math.PI;
    ctx.fillStyle = "#ffd166";
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, rad, dirAngle + open, dirAngle - open + Math.PI * 2);
    ctx.closePath();
    ctx.fill();

    // ghosts
    ghosts.forEach(function (g) {
      var gx = g.c * GRID + GRID / 2;
      var gy = g.r * GRID + GRID / 2;
      var grad = GRID / 2 - 2;
      ctx.fillStyle = g.color;
      ctx.beginPath();
      ctx.arc(gx, gy, grad, Math.PI, 0, false);
      ctx.lineTo(gx + grad, gy + grad);
      ctx.lineTo(gx - grad, gy + grad);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(gx - grad * 0.35, gy - grad * 0.1, grad * 0.22, 0, Math.PI * 2);
      ctx.arc(gx + grad * 0.35, gy - grad * 0.1, grad * 0.22, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#1c2138";
      ctx.beginPath();
      ctx.arc(gx - grad * 0.35, gy - grad * 0.1, grad * 0.1, 0, Math.PI * 2);
      ctx.arc(gx + grad * 0.35, gy - grad * 0.1, grad * 0.1, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  document.addEventListener("keydown", function (e) {
    var map = {
      ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0]
    };
    if (map[e.key]) { e.preventDefault(); movePlayer(map[e.key][0], map[e.key][1]); }
  });

  document.getElementById("touch-controls").addEventListener("click", function (e) {
    var btn = e.target.closest("[data-dir]");
    if (!btn) return;
    var map = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
    var d = map[btn.getAttribute("data-dir")];
    movePlayer(d[0], d[1]);
  });

  var touchStart = null;
  canvas.addEventListener("touchstart", function (e) { touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY }; });
  canvas.addEventListener("touchend", function (e) {
    if (!touchStart) return;
    var dx = e.changedTouches[0].clientX - touchStart.x;
    var dy = e.changedTouches[0].clientY - touchStart.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) > 20) {
      if (Math.abs(dx) > Math.abs(dy)) movePlayer(dx > 0 ? 1 : -1, 0);
      else movePlayer(0, dy > 0 ? 1 : -1);
    }
    touchStart = null;
  });

  restartBtn.addEventListener("click", newGame);
  newGame();
})();
