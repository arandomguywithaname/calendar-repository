(function () {
  var GAME_ID = "snake";
  var canvas = document.getElementById("board");
  var ctx = canvas.getContext("2d");
  var scoreEl = document.getElementById("score");
  var bestEl = document.getElementById("best");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");

  var GRID = 20;
  var CELLS = canvas.width / GRID;
  var snake, dir, nextDir, food, score, over, timer;
  var SPEED_MS = 110;

  function refreshHud() {
    scoreEl.textContent = score;
    bestEl.textContent = window.ArcadeCommon.getBest(GAME_ID) || 0;
  }

  function randomFood() {
    var pos;
    do {
      pos = { x: window.ArcadeCommon.randInt(0, CELLS - 1), y: window.ArcadeCommon.randInt(0, CELLS - 1) };
    } while (snake.some(function (s) { return s.x === pos.x && s.y === pos.y; }));
    return pos;
  }

  function newGame() {
    snake = [{ x: 8, y: 10 }, { x: 7, y: 10 }, { x: 6, y: 10 }];
    dir = { x: 1, y: 0 };
    nextDir = dir;
    score = 0;
    over = false;
    food = randomFood();
    resultBanner.innerHTML = "";
    refreshHud();
    clearInterval(timer);
    timer = setInterval(tick, SPEED_MS);
    draw();
  }

  function tick() {
    if (over) return;
    dir = nextDir;
    var head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };

    if (head.x < 0 || head.y < 0 || head.x >= CELLS || head.y >= CELLS ||
        snake.some(function (s) { return s.x === head.x && s.y === head.y; })) {
      endGame();
      return;
    }

    snake.unshift(head);
    if (head.x === food.x && head.y === food.y) {
      score += 10;
      refreshHud();
      food = randomFood();
    } else {
      snake.pop();
    }
    draw();
  }

  function endGame() {
    over = true;
    clearInterval(timer);
    window.ArcadeCommon.setBest(GAME_ID, score);
    refreshHud();
    resultBanner.innerHTML = '<span class="overlay-lose">' + window.ArcadeI18n.t("common.gameOver") + "</span>";
  }

  function draw() {
    ctx.fillStyle = "#171b2e";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "#ff5da2";
    ctx.fillRect(food.x * GRID + 2, food.y * GRID + 2, GRID - 4, GRID - 4);

    snake.forEach(function (s, i) {
      ctx.fillStyle = i === 0 ? "#29e0c9" : "#3ddc84";
      ctx.fillRect(s.x * GRID + 1, s.y * GRID + 1, GRID - 2, GRID - 2);
    });
  }

  function setDir(x, y) {
    if (dir.x === -x && dir.y === -y) return;
    nextDir = { x: x, y: y };
  }

  document.addEventListener("keydown", function (e) {
    var map = {
      ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0]
    };
    if (map[e.key]) { e.preventDefault(); setDir(map[e.key][0], map[e.key][1]); }
  });

  document.getElementById("touch-controls").addEventListener("click", function (e) {
    var btn = e.target.closest("[data-dir]");
    if (!btn) return;
    var map = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
    var d = map[btn.getAttribute("data-dir")];
    setDir(d[0], d[1]);
  });

  var touchStart = null;
  canvas.addEventListener("touchstart", function (e) { touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY }; });
  canvas.addEventListener("touchend", function (e) {
    if (!touchStart) return;
    var dx = e.changedTouches[0].clientX - touchStart.x;
    var dy = e.changedTouches[0].clientY - touchStart.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) > 20) {
      if (Math.abs(dx) > Math.abs(dy)) setDir(dx > 0 ? 1 : -1, 0);
      else setDir(0, dy > 0 ? 1 : -1);
    }
    touchStart = null;
  });

  restartBtn.addEventListener("click", newGame);
  newGame();
})();
