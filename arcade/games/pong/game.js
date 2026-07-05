(function () {
  var GAME_ID = "pong";
  var canvas = document.getElementById("board");
  var ctx = canvas.getContext("2d");
  var scoreEl = document.getElementById("score");
  var cpuScoreEl = document.getElementById("cpuScore");
  var bestEl = document.getElementById("best");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");
  var diffEl = document.getElementById("difficulty");
  var modeCpuBtn = document.getElementById("mode-cpu");
  var modeFriendBtn = document.getElementById("mode-friend");
  var friendSetup = document.getElementById("friend-setup");
  var opponentInput = document.getElementById("opponent-code");
  var inviteBtn = document.getElementById("invite-btn");
  var mpStatus = document.getElementById("mp-status");
  var p2Label = document.getElementById("p2-label");

  var W = canvas.width, H = canvas.height;
  var WIN_SCORE = 7;

  // Per-difficulty tuning. paddleH = your paddle height, ballSpeed = launch speed,
  // accel = how much the ball speeds up on each paddle hit, cpuSpeed/cpuErr = CPU quality,
  // english = how much vertical speed an angled paddle hit imparts.
  // cpuSpeed must stay BELOW english for a level to be winnable - "impossible"
  // deliberately breaks that rule (the CPU can always outrun the ball), which
  // is the whole joke of the mode.
  var DIFFICULTIES = {
    easy: { paddleH: 104, ballSpeed: 3.4, accel: 1.02, cpuSpeed: 3.0, cpuErr: 60, maxSpeed: 10, english: 7 },
    medium: { paddleH: 76, ballSpeed: 4.4, accel: 1.05, cpuSpeed: 4.2, cpuErr: 46, maxSpeed: 12, english: 8 },
    hard: { paddleH: 58, ballSpeed: 5.4, accel: 1.08, cpuSpeed: 5.4, cpuErr: 30, maxSpeed: 14, english: 9 },
    impossible: { paddleH: 58, ballSpeed: 5.6, accel: 1.08, cpuSpeed: 14, cpuErr: 0, maxSpeed: 15, english: 9 }
  };
  var cfg = DIFFICULTIES.medium;

  var PADDLE_W = 12;
  var player, cpu, ball, trail, particles, score, cpuScore, over, loopId;

  // ---- Friend mode state ----
  // Host runs the real physics; the guest just renders the host's state and
  // streams its paddle position back. First to 7 still wins.
  var mode = "cpu";        // "cpu" | "friend"
  var isHost = true;
  var opponentCode = null;
  var remoteY = H / 2;     // guest paddle position as last reported to the host
  var myGuestY = H / 2;    // guest's own paddle (right side), locally echoed
  var frameNo = 0;

  function refreshHud() {
    if (mode === "friend" && !isHost) {
      // Guest sees their own score first; host's score is the opponent's.
      scoreEl.textContent = cpuScore;
      cpuScoreEl.textContent = score;
    } else {
      scoreEl.textContent = score;
      cpuScoreEl.textContent = cpuScore;
    }
    bestEl.textContent = window.ArcadeCommon.getBest(GAME_ID) || 0;
  }

  function resetBall(dir) {
    ball = {
      x: W / 2, y: H / 2,
      vx: cfg.ballSpeed * (dir || (Math.random() < 0.5 ? 1 : -1)),
      vy: (Math.random() * 4 - 2)
    };
    trail = [];
  }

  function newGame() {
    player = { y: H / 2 - cfg.paddleH / 2 };
    cpu = { y: H / 2 - cfg.paddleH / 2, err: 0 };
    remoteY = H / 2 - cfg.paddleH / 2;
    myGuestY = H / 2 - cfg.paddleH / 2;
    score = 0;
    cpuScore = 0;
    over = false;
    particles = [];
    resultBanner.innerHTML = "";
    resetBall();
    refreshHud();
    cancelAnimationFrame(loopId);
    loop();
  }

  function spawnParticles(x, y, color, count) {
    for (var i = 0; i < (count || 14); i++) {
      var ang = Math.random() * Math.PI * 2;
      var spd = 1 + Math.random() * 3.5;
      particles.push({
        x: x, y: y,
        vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
        life: 1, color: color
      });
    }
  }

  function update() {
    if (over) return;

    trail.push({ x: ball.x, y: ball.y });
    if (trail.length > 14) trail.shift();

    ball.x += ball.vx;
    ball.y += ball.vy;

    if (ball.y < 6) { ball.y = 6; ball.vy *= -1; }
    if (ball.y > H - 6) { ball.y = H - 6; ball.vy *= -1; }

    var ph = cfg.paddleH;

    // Player paddle collision (left side)
    if (ball.x - 6 < PADDLE_W + 4 && ball.x - 6 > 4 &&
        ball.y > player.y && ball.y < player.y + ph && ball.vx < 0) {
      ball.x = PADDLE_W + 10;
      ball.vx *= -cfg.accel;
      var rel = (ball.y - (player.y + ph / 2)) / (ph / 2);
      ball.vy = rel * cfg.english;
      spawnParticles(ball.x, ball.y, "#29e0c9", 12);
    }

    // Right paddle collision (CPU, or the guest's paddle in friend mode)
    if (ball.x + 6 > W - PADDLE_W - 4 && ball.x + 6 < W - 4 &&
        ball.y > cpu.y && ball.y < cpu.y + ph && ball.vx > 0) {
      ball.x = W - PADDLE_W - 10;
      ball.vx *= -cfg.accel;
      var rel2 = (ball.y - (cpu.y + ph / 2)) / (ph / 2);
      ball.vy = rel2 * cfg.english;
      spawnParticles(ball.x, ball.y, "#ff5da2", 12);
    }

    // Cap speed
    var maxSpeed = cfg.maxSpeed;
    ball.vx = Math.max(-maxSpeed, Math.min(maxSpeed, ball.vx));
    ball.vy = Math.max(-maxSpeed, Math.min(maxSpeed, ball.vy));

    // Score
    if (ball.x < -10) {
      cpuScore++;
      spawnParticles(20, ball.y, "#ff5da2", 22);
      refreshHud();
      checkWin();
      if (!over) resetBall(1);
    } else if (ball.x > W + 10) {
      score++;
      spawnParticles(W - 20, ball.y, "#29e0c9", 22);
      refreshHud();
      checkWin();
      if (!over) resetBall(-1);
    }

    if (mode === "friend") {
      // Right paddle is the remote friend, not an AI.
      cpu.y = Math.max(0, Math.min(H - ph, remoteY));
    } else {
      // CPU AI: track ball with lag/imperfection scaled by difficulty.
      cpu.err += (Math.random() - 0.5) * (cfg.cpuErr / 24);
      cpu.err = Math.max(-cfg.cpuErr, Math.min(cfg.cpuErr, cpu.err));
      var target = ball.y - ph / 2 + cpu.err;
      if (cpu.y < target) cpu.y = Math.min(cpu.y + cfg.cpuSpeed, target);
      else cpu.y = Math.max(cpu.y - cfg.cpuSpeed, target);
      cpu.y = Math.max(0, Math.min(H - ph, cpu.y));
    }
  }

  function checkWin() {
    var hostWon = null;
    if (score >= WIN_SCORE) { over = true; hostWon = true; }
    else if (cpuScore >= WIN_SCORE) { over = true; hostWon = false; }
    if (!over) return;

    if (mode === "friend") {
      // Host decides; tell the guest who won (from the host's perspective).
      if (isHost && opponentCode) {
        window.ArcadeFriends.sendGame(opponentCode, { type: "pong-over", hostWon: hostWon });
      }
      showFriendResult(hostWon);
    } else if (hostWon) {
      window.ArcadeCommon.setBest(GAME_ID, score);
      resultBanner.innerHTML = '<span class="overlay-win">' + window.ArcadeI18n.t("common.youWin") + "</span>";
    } else {
      resultBanner.innerHTML = '<span class="overlay-lose">' + window.ArcadeI18n.t("common.youLose") + "</span>";
    }
  }

  function showFriendResult(hostWon) {
    var iWon = isHost ? hostWon : !hostWon;
    resultBanner.innerHTML = iWon
      ? '<span class="overlay-win">' + window.ArcadeI18n.t("common.youWin") + "</span>"
      : '<span class="overlay-lose">' + window.ArcadeI18n.t("common.youLose") + "</span>";
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function glowPaddle(x, y, color) {
    var ph = cfg.paddleH;
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 22;
    var g = ctx.createLinearGradient(x, y, x + PADDLE_W, y + ph);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(0.4, color);
    g.addColorStop(1, color);
    ctx.fillStyle = g;
    roundRect(x, y, PADDLE_W, ph, 6);
    ctx.fill();
    ctx.restore();
  }

  function draw() {
    // Dark background with faint vertical glow.
    ctx.fillStyle = "#0b0e1c";
    ctx.fillRect(0, 0, W, H);
    var bg = ctx.createRadialGradient(W / 2, H / 2, 20, W / 2, H / 2, H);
    bg.addColorStop(0, "rgba(124,92,255,0.10)");
    bg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Center dashed glowing line.
    ctx.save();
    ctx.shadowColor = "#7c5cff";
    ctx.shadowBlur = 12;
    ctx.strokeStyle = "rgba(124,92,255,0.7)";
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 12]);
    ctx.beginPath();
    ctx.moveTo(W / 2, 0);
    ctx.lineTo(W / 2, H);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    var rightY = (mode === "friend" && !isHost) ? myGuestY : cpu.y;
    glowPaddle(4, player.y, "#29e0c9");
    glowPaddle(W - PADDLE_W - 4, rightY, "#ff5da2");

    // Ball motion trail.
    trail.forEach(function (t, i) {
      var frac = i / trail.length;
      ctx.globalAlpha = frac * 0.5;
      ctx.fillStyle = "#eaf6ff";
      ctx.beginPath();
      ctx.arc(t.x, t.y, 6 * frac, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    // Glowing ball.
    ctx.save();
    var grad = ctx.createRadialGradient(ball.x, ball.y, 1, ball.x, ball.y, 16);
    grad.addColorStop(0, "#ffffff");
    grad.addColorStop(0.4, "#bff6ff");
    grad.addColorStop(1, "rgba(41,224,201,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowColor = "#29e0c9";
    ctx.shadowBlur = 18;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Particles.
    particles = particles.filter(function (p) { return p.life > 0; });
    particles.forEach(function (p) {
      p.x += p.vx; p.y += p.vy; p.vx *= 0.94; p.vy *= 0.94; p.life -= 0.05;
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.1, 3 * p.life + 0.5), 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  function loop() {
    frameNo++;
    if (mode === "friend" && !isHost) {
      // Guest: physics lives on the host. Just stream our paddle position
      // and animate the local ball trail between state packets.
      if (!over && frameNo % 2 === 0 && opponentCode) {
        window.ArcadeFriends.sendGame(opponentCode, { type: "pong-pad", y: myGuestY });
      }
      if (!over && ball) {
        trail.push({ x: ball.x, y: ball.y });
        if (trail.length > 14) trail.shift();
      }
    } else {
      update();
      // Host: broadcast authoritative state every frame (tiny messages).
      if (mode === "friend" && isHost && !over && opponentCode) {
        window.ArcadeFriends.sendGame(opponentCode, {
          type: "pong-state",
          bx: ball.x, by: ball.y,
          py: player.y, s: score, cs: cpuScore
        });
      }
    }
    draw();
    if (!over) loopId = requestAnimationFrame(loop);
    else drawFinalParticles();
  }

  // Keep drawing a few frames so the scoring particle flash finishes after game over.
  function drawFinalParticles() {
    if (!particles.length) return;
    draw();
    requestAnimationFrame(drawFinalParticles);
  }

  // ---- Input: left paddle for CPU-mode and host, right paddle for guest ----

  function applyInputY(y) {
    if (mode === "friend" && !isHost) {
      myGuestY = Math.max(0, Math.min(H - cfg.paddleH, y - cfg.paddleH / 2));
    } else {
      player.y = Math.max(0, Math.min(H - cfg.paddleH, y - cfg.paddleH / 2));
    }
  }

  function nudgeInput(delta) {
    if (mode === "friend" && !isHost) {
      myGuestY = Math.max(0, Math.min(H - cfg.paddleH, myGuestY + delta));
    } else {
      player.y = Math.max(0, Math.min(H - cfg.paddleH, player.y + delta));
    }
  }

  canvas.addEventListener("mousemove", function (e) {
    var rect = canvas.getBoundingClientRect();
    applyInputY((e.clientY - rect.top) * (H / rect.height));
  });

  canvas.addEventListener("touchmove", function (e) {
    e.preventDefault();
    var rect = canvas.getBoundingClientRect();
    applyInputY((e.touches[0].clientY - rect.top) * (H / rect.height));
  }, { passive: false });

  var keys = {};
  document.addEventListener("keydown", function (e) {
    if (e.key === "ArrowUp" || e.key === "ArrowDown") e.preventDefault();
    keys[e.key] = true;
  });
  document.addEventListener("keyup", function (e) { keys[e.key] = false; });

  setInterval(function () {
    if (over) return;
    if (keys.ArrowUp) nudgeInput(-6);
    if (keys.ArrowDown) nudgeInput(6);
  }, 16);

  document.getElementById("touch-controls").addEventListener("click", function (e) {
    var btn = e.target.closest("[data-dir]");
    if (!btn || over) return;
    nudgeInput(btn.getAttribute("data-dir") === "up" ? -30 : 30);
  });

  // ---- Mode switching & friend matchmaking ----

  function setMode(m) {
    mode = m;
    modeCpuBtn.classList.toggle("active", m === "cpu");
    modeFriendBtn.classList.toggle("active", m === "friend");
    friendSetup.style.display = m === "friend" ? "block" : "none";
    diffEl.style.display = m === "friend" ? "none" : "";
    p2Label.textContent = m === "friend" ? "Friend" : "CPU";
    if (m === "cpu") { isHost = true; opponentCode = null; mpStatus.textContent = ""; }
    newGame();
  }

  modeCpuBtn.addEventListener("click", function () { setMode("cpu"); });
  modeFriendBtn.addEventListener("click", function () { setMode("friend"); });

  inviteBtn.addEventListener("click", function () {
    var code = opponentInput.value.trim().toUpperCase();
    if (!code) return;
    opponentCode = code;
    isHost = true;
    window.ArcadeFriends.addFriend(code);
    mpStatus.textContent = "Connecting to " + code + "...";
    window.ArcadeFriends.sendGame(opponentCode, { type: "pong-invite" });
    window.ArcadeFriends.whenReady(opponentCode, function (connected) {
      mpStatus.textContent = connected
        ? "Connected! Match on — first to " + WIN_SCORE + "."
        : "Still trying to reach " + code + " — they need this Pong page open. (Some networks block peer-to-peer.)";
      if (connected) newGame();
    }, 10000);
  });

  window.ArcadeFriends.onGameMessage(function (fromCode, payload) {
    if (!payload || typeof payload.type !== "string" || payload.type.indexOf("pong-") !== 0) return;

    if (payload.type === "pong-invite") {
      opponentCode = fromCode;
      isHost = false;
      setMode("friend");
      opponentInput.value = fromCode;
      mpStatus.textContent = "Match started with " + fromCode + "! You're the pink paddle (right).";
      window.ArcadeFriends.sendGame(fromCode, { type: "pong-accept" });
      return;
    }
    if (fromCode !== opponentCode || mode !== "friend") return;

    if (payload.type === "pong-accept" && isHost) {
      mpStatus.textContent = "Friend joined! First to " + WIN_SCORE + ".";
      newGame();
    } else if (payload.type === "pong-pad" && isHost) {
      remoteY = payload.y;
    } else if (payload.type === "pong-state" && !isHost) {
      if (!ball) resetBall();
      ball.x = payload.bx; ball.y = payload.by;
      player.y = payload.py;
      if (payload.s !== score || payload.cs !== cpuScore) {
        score = payload.s; cpuScore = payload.cs;
        refreshHud();
      }
    } else if (payload.type === "pong-over" && !isHost) {
      over = true;
      score = WIN_SCORE; // ensure loop stops cleanly
      showFriendResult(payload.hostWon);
    } else if (payload.type === "pong-restart" && isHost) {
      newGame();
    }
  });

  restartBtn.addEventListener("click", function () {
    if (mode === "friend" && !isHost && opponentCode) {
      // Guest asks the host to restart so both stay in sync.
      window.ArcadeFriends.sendGame(opponentCode, { type: "pong-restart" });
      mpStatus.textContent = "Asked your friend to start a new game...";
      return;
    }
    newGame();
  });

  window.ArcadeCommon.mountDifficulty(diffEl, GAME_ID, {
    defaultKey: "medium",
    levels: [
      { key: "easy", label: "Easy" },
      { key: "medium", label: "Medium" },
      { key: "hard", label: "Hard" },
      { key: "impossible", label: "Impossible" }
    ],
    onChange: function (level) {
      cfg = DIFFICULTIES[level] || DIFFICULTIES.medium;
      if (mode === "cpu") newGame();
    }
  });
})();
