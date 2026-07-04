(function () {
  var GAME_ID = "tank-battle";
  var canvas = document.getElementById("board");
  var ctx = canvas.getContext("2d");
  var scoreEl = document.getElementById("score");
  var bestEl = document.getElementById("best");
  var livesEl = document.getElementById("lives");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");
  var fireBtn = document.getElementById("fire-btn");

  var W = canvas.width, H = canvas.height;
  var TANK_HALF = 15;
  var PLAYER_SPEED = 2.6;
  var CPU_SPEED = 2.0;
  var BULLET_SPEED = 6.5;
  var BULLET_R = 4;
  var FIRE_COOLDOWN = 420;
  var START_HEALTH = 3;

  var DIRS = {
    up: { x: 0, y: -1, deg: -90 },
    down: { x: 0, y: 1, deg: 90 },
    left: { x: -1, y: 0, deg: 180 },
    right: { x: 1, y: 0, deg: 0 }
  };

  var WALLS = [
    { x: 150, y: 70, w: 20, h: 150 },
    { x: 310, y: 260, w: 20, h: 150 },
    { x: 70, y: 330, w: 150, h: 20 },
    { x: 260, y: 90, w: 150, h: 20 }
  ];

  var player, cpu, bullets, over, hits, keys;
  var cpuMoveTimer, cpuFireTimer, cpuDir;

  function refreshHud() {
    scoreEl.textContent = hits;
    bestEl.textContent = window.ArcadeCommon.getBest(GAME_ID) || 0;
    livesEl.textContent = Math.max(0, player.health);
  }

  function newGame() {
    player = { x: 60, y: 420, dir: "up", health: START_HEALTH, cooldown: 0, invuln: 0 };
    cpu = { x: 420, y: 60, dir: "down", health: START_HEALTH, cooldown: 0, invuln: 0 };
    bullets = [];
    over = false;
    hits = 0;
    keys = {};
    cpuMoveTimer = 0;
    cpuFireTimer = 900;
    cpuDir = "down";
    resultBanner.innerHTML = "";
    refreshHud();
  }

  function rectsOverlap(ax, ay, ah, bx, by, bw, bh) {
    return ax - ah < bx + bw && ax + ah > bx && ay - ah < by + bh && ay + ah > by;
  }

  function collides(x, y) {
    if (x - TANK_HALF < 0 || x + TANK_HALF > W || y - TANK_HALF < 0 || y + TANK_HALF > H) return true;
    for (var i = 0; i < WALLS.length; i++) {
      var w = WALLS[i];
      if (rectsOverlap(x, y, TANK_HALF, w.x, w.y, w.w, w.h)) return true;
    }
    return false;
  }

  function otherTank(tank) { return tank === player ? cpu : player; }

  function moveTank(tank, dx, dy) {
    var other = otherTank(tank);
    var newX = tank.x + dx;
    if (!collides(newX, tank.y) && !rectsOverlap(newX, tank.y, TANK_HALF, other.x - TANK_HALF, other.y - TANK_HALF, TANK_HALF * 2, TANK_HALF * 2)) {
      tank.x = newX;
    }
    var newY = tank.y + dy;
    if (!collides(tank.x, newY) && !rectsOverlap(tank.x, newY, TANK_HALF, other.x - TANK_HALF, other.y - TANK_HALF, TANK_HALF * 2, TANK_HALF * 2)) {
      tank.y = newY;
    }
  }

  function fire(tank) {
    if (over || tank.cooldown > 0) return;
    tank.cooldown = FIRE_COOLDOWN;
    var d = DIRS[tank.dir];
    bullets.push({
      x: tank.x + d.x * (TANK_HALF + 8),
      y: tank.y + d.y * (TANK_HALF + 8),
      vx: d.x * BULLET_SPEED,
      vy: d.y * BULLET_SPEED,
      owner: tank
    });
  }

  function updateBullets(dt) {
    bullets.forEach(function (b) {
      b.x += b.vx;
      b.y += b.vy;
    });
    bullets = bullets.filter(function (b) {
      if (b.x < 0 || b.x > W || b.y < 0 || b.y > H) return false;
      for (var i = 0; i < WALLS.length; i++) {
        var w = WALLS[i];
        if (b.x > w.x - BULLET_R && b.x < w.x + w.w + BULLET_R && b.y > w.y - BULLET_R && b.y < w.y + w.h + BULLET_R) return false;
      }
      var target = b.owner === player ? cpu : player;
      var dx = b.x - target.x, dy = b.y - target.y;
      if (Math.sqrt(dx * dx + dy * dy) < TANK_HALF && target.invuln <= 0) {
        target.health--;
        target.invuln = 500;
        if (target === cpu) { hits++; window.ArcadeCommon.toast("Hit!"); }
        checkGameOver();
        return false;
      }
      return true;
    });
  }

  function checkGameOver() {
    if (over) return;
    if (cpu.health <= 0) {
      over = true;
      var improved = window.ArcadeCommon.setBest(GAME_ID, hits);
      resultBanner.innerHTML = '<span class="overlay-win">' + window.ArcadeI18n.t("common.youWin") + (improved ? " 🏆" : "") + "</span>";
    } else if (player.health <= 0) {
      over = true;
      window.ArcadeCommon.setBest(GAME_ID, hits);
      resultBanner.innerHTML = '<span class="overlay-lose">' + window.ArcadeI18n.t("common.youLose") + "</span>";
    }
    refreshHud();
  }

  function updatePlayer(dt) {
    if (player.cooldown > 0) player.cooldown -= dt;
    if (player.invuln > 0) player.invuln -= dt;
    var dx = 0, dy = 0, dir = null;
    if (keys.up) { dy = -1; dir = "up"; }
    else if (keys.down) { dy = 1; dir = "down"; }
    else if (keys.left) { dx = -1; dir = "left"; }
    else if (keys.right) { dx = 1; dir = "right"; }
    if (dir) {
      player.dir = dir;
      moveTank(player, dx * PLAYER_SPEED, dy * PLAYER_SPEED);
    }
    if (keys.fire) fire(player);
  }

  function updateCpu(dt) {
    if (over) return;
    if (cpu.cooldown > 0) cpu.cooldown -= dt;
    if (cpu.invuln > 0) cpu.invuln -= dt;

    cpuMoveTimer -= dt;
    if (cpuMoveTimer <= 0) {
      cpuMoveTimer = 700 + Math.random() * 500;
      var dx = player.x - cpu.x, dy = player.y - cpu.y;
      var choices = [];
      if (Math.random() < 0.75) {
        if (Math.abs(dx) > Math.abs(dy)) choices.push(dx > 0 ? "right" : "left");
        else choices.push(dy > 0 ? "down" : "up");
      }
      choices.push(window.ArcadeCommon.pick(["up", "down", "left", "right"]));
      cpuDir = choices[0];
    }
    var d = DIRS[cpuDir];
    var before = { x: cpu.x, y: cpu.y };
    cpu.dir = cpuDir;
    moveTank(cpu, d.x * CPU_SPEED, d.y * CPU_SPEED);
    if (cpu.x === before.x && cpu.y === before.y) {
      cpuMoveTimer = 0; // blocked, re-decide immediately next frame
    }

    cpuFireTimer -= dt;
    if (cpuFireTimer <= 0) {
      cpuFireTimer = 1000 + Math.random() * 900;
      var ddx = player.x - cpu.x, ddy = player.y - cpu.y;
      cpu.dir = Math.abs(ddx) > Math.abs(ddy) ? (ddx > 0 ? "right" : "left") : (ddy > 0 ? "down" : "up");
      fire(cpu);
    }
  }

  function draw() {
    ctx.fillStyle = "#20261b";
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = "#4a5540";
    WALLS.forEach(function (w) { ctx.fillRect(w.x, w.y, w.w, w.h); });
    ctx.strokeStyle = "#171b2e";
    WALLS.forEach(function (w) { ctx.strokeRect(w.x, w.y, w.w, w.h); });

    drawTank(player, "#29e0c9");
    if (cpu.health > 0) drawTank(cpu, "#ff5d5d");

    ctx.fillStyle = "#ffd24d";
    bullets.forEach(function (b) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, BULLET_R, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function drawTank(tank, color) {
    ctx.save();
    ctx.translate(tank.x, tank.y);
    if (tank.invuln > 0 && Math.floor(tank.invuln / 100) % 2 === 0) ctx.globalAlpha = 0.4;
    ctx.fillStyle = color;
    ctx.fillRect(-TANK_HALF, -TANK_HALF, TANK_HALF * 2, TANK_HALF * 2);
    ctx.strokeStyle = "#171b2e";
    ctx.lineWidth = 2;
    ctx.strokeRect(-TANK_HALF, -TANK_HALF, TANK_HALF * 2, TANK_HALF * 2);
    var d = DIRS[tank.dir];
    ctx.strokeStyle = "#171b2e";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(d.x * (TANK_HALF + 12), d.y * (TANK_HALF + 12));
    ctx.stroke();
    ctx.restore();
  }

  var lastTime = null;
  function loop(ts) {
    if (lastTime === null) lastTime = ts;
    var dt = Math.min(ts - lastTime, 40);
    lastTime = ts;
    if (!over) {
      updatePlayer(dt);
      updateCpu(dt);
      updateBullets(dt);
    }
    draw();
    requestAnimationFrame(loop);
  }

  var KEY_MAP = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", " ": "fire" };
  document.addEventListener("keydown", function (e) {
    var k = KEY_MAP[e.key];
    if (k) { e.preventDefault(); keys[k] = true; }
  });
  document.addEventListener("keyup", function (e) {
    var k = KEY_MAP[e.key];
    if (k) { e.preventDefault(); keys[k] = false; }
  });

  document.getElementById("touch-controls").addEventListener("click", function (e) {
    var btn = e.target.closest("[data-dir]");
    if (btn) {
      var dir = btn.getAttribute("data-dir");
      player.dir = dir;
      var d = DIRS[dir];
      moveTank(player, d.x * PLAYER_SPEED * 6, d.y * PLAYER_SPEED * 6);
    }
  });
  fireBtn.addEventListener("click", function () { fire(player); });
  canvas.addEventListener("mousedown", function () { fire(player); });

  restartBtn.addEventListener("click", newGame);
  newGame();
  requestAnimationFrame(loop);
})();
