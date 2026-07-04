(function () {
  var GAME_ID = "maze-runner";
  var canvas = document.getElementById("board");
  var ctx = canvas.getContext("2d");
  var movesEl = document.getElementById("moves");
  var timeEl = document.getElementById("time");
  var bestEl = document.getElementById("best");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");

  var W = canvas.width, H = canvas.height;
  var SIZES = [
    { cols: 9, rows: 9 },
    { cols: 11, rows: 9 },
    { cols: 11, rows: 11 }
  ];

  var cols, rows, cell, grid, player, exitPos, moves, seconds, over, timerId;

  function refreshHud() {
    movesEl.textContent = moves;
    timeEl.textContent = seconds;
    var best = window.ArcadeCommon.getBest(GAME_ID);
    bestEl.textContent = best === null ? "-" : best;
  }

  function makeGrid() {
    var g = [];
    for (var r = 0; r < rows; r++) {
      var row = [];
      for (var c = 0; c < cols; c++) {
        row.push({ top: true, right: true, bottom: true, left: true, visited: false });
      }
      g.push(row);
    }
    return g;
  }

  function generateMaze() {
    grid = makeGrid();
    var stack = [{ r: 0, c: 0 }];
    grid[0][0].visited = true;
    while (stack.length) {
      var cur = stack[stack.length - 1];
      var neighbors = [];
      var dirs = [
        { dr: -1, dc: 0, self: "top", other: "bottom" },
        { dr: 1, dc: 0, self: "bottom", other: "top" },
        { dr: 0, dc: -1, self: "left", other: "right" },
        { dr: 0, dc: 1, self: "right", other: "left" }
      ];
      dirs.forEach(function (d) {
        var nr = cur.r + d.dr, nc = cur.c + d.dc;
        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && !grid[nr][nc].visited) {
          neighbors.push({ r: nr, c: nc, dir: d });
        }
      });
      if (neighbors.length) {
        var pick = neighbors[Math.floor(Math.random() * neighbors.length)];
        grid[cur.r][cur.c][pick.dir.self] = false;
        grid[pick.r][pick.c][pick.dir.other] = false;
        grid[pick.r][pick.c].visited = true;
        stack.push({ r: pick.r, c: pick.c });
      } else {
        stack.pop();
      }
    }
  }

  function newGame() {
    var size = window.ArcadeCommon.pick(SIZES);
    cols = size.cols;
    rows = size.rows;
    cell = Math.min(Math.floor(W / cols), Math.floor(H / rows));
    generateMaze();
    player = { r: 0, c: 0 };
    exitPos = { r: rows - 1, c: cols - 1 };
    moves = 0;
    seconds = 0;
    over = false;
    resultBanner.innerHTML = "";
    refreshHud();
    clearInterval(timerId);
    timerId = setInterval(function () {
      if (over) return;
      seconds++;
      refreshHud();
    }, 1000);
    draw();
  }

  function offsetX() { return (W - cols * cell) / 2; }
  function offsetY() { return (H - rows * cell) / 2; }

  function draw() {
    ctx.fillStyle = "#171b2e";
    ctx.fillRect(0, 0, W, H);

    var ox = offsetX(), oy = offsetY();
    ctx.strokeStyle = "#7c5cff";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";

    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var x = ox + c * cell, y = oy + r * cell;
        var g = grid[r][c];
        ctx.beginPath();
        if (g.top) { ctx.moveTo(x, y); ctx.lineTo(x + cell, y); }
        if (g.left) { ctx.moveTo(x, y); ctx.lineTo(x, y + cell); }
        if (g.bottom) { ctx.moveTo(x, y + cell); ctx.lineTo(x + cell, y + cell); }
        if (g.right) { ctx.moveTo(x + cell, y); ctx.lineTo(x + cell, y + cell); }
        ctx.stroke();
      }
    }

    ctx.font = Math.floor(cell * 0.7) + "px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("🚩", ox + exitPos.c * cell + cell / 2, oy + exitPos.r * cell + cell / 2);
    ctx.fillText("🙂", ox + player.c * cell + cell / 2, oy + player.r * cell + cell / 2);
  }

  function move(dir) {
    if (over) return;
    var g = grid[player.r][player.c];
    var nr = player.r, nc = player.c;
    if (dir === "up" && !g.top) nr--;
    else if (dir === "down" && !g.bottom) nr++;
    else if (dir === "left" && !g.left) nc--;
    else if (dir === "right" && !g.right) nc++;
    else return;
    player.r = nr;
    player.c = nc;
    moves++;
    refreshHud();
    draw();
    if (player.r === exitPos.r && player.c === exitPos.c) {
      win();
    }
  }

  function win() {
    over = true;
    clearInterval(timerId);
    var improved = window.ArcadeCommon.setBestLowerIsBetter(GAME_ID, moves);
    resultBanner.innerHTML = '<span class="overlay-win">' + window.ArcadeI18n.t("common.youWin") +
      " — " + moves + " " + window.ArcadeI18n.t("common.moves") + ", " + seconds + "s" + (improved ? " 🏆" : "") + "</span>";
    refreshHud();
  }

  document.addEventListener("keydown", function (e) {
    var map = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };
    if (map[e.key]) { e.preventDefault(); move(map[e.key]); }
  });

  document.getElementById("touch-controls").addEventListener("click", function (e) {
    var btn = e.target.closest("[data-dir]");
    if (btn) move(btn.getAttribute("data-dir"));
  });

  var touchStart = null;
  canvas.addEventListener("touchstart", function (e) { touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY }; });
  canvas.addEventListener("touchend", function (e) {
    if (!touchStart) return;
    var dx = e.changedTouches[0].clientX - touchStart.x;
    var dy = e.changedTouches[0].clientY - touchStart.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) > 20) {
      if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? "right" : "left");
      else move(dy > 0 ? "down" : "up");
    }
    touchStart = null;
  });

  restartBtn.addEventListener("click", newGame);
  newGame();
})();
