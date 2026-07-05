(function () {
  var boardEl = document.getElementById("board");
  var winsEl = document.getElementById("wins");
  var lossesEl = document.getElementById("losses");
  var tiesEl = document.getElementById("ties");
  var restartBtn = document.getElementById("restart");
  var resultBanner = document.getElementById("result-banner");
  var modeCpuBtn = document.getElementById("mode-cpu");
  var modeFriendBtn = document.getElementById("mode-friend");
  var friendSetup = document.getElementById("friend-setup");
  var opponentInput = document.getElementById("opponent-code");
  var inviteBtn = document.getElementById("invite-btn");
  var mpStatus = document.getElementById("mp-status");

  var GAME_ID = "tic-tac-toe";
  var board, turn, over, mode, myMark, opponentCode, waitingForOpponent;
  var stats = { wins: 0, losses: 0, ties: 0 };

  function loadStats() {
    try { stats = JSON.parse(localStorage.getItem("arcade.stats." + GAME_ID)) || stats; } catch (e) {}
  }
  function saveStats() {
    try { localStorage.setItem("arcade.stats." + GAME_ID, JSON.stringify(stats)); } catch (e) {}
    winsEl.textContent = stats.wins;
    lossesEl.textContent = stats.losses;
    tiesEl.textContent = stats.ties;
  }

  var WINS = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
  ];

  function checkWinner(b) {
    for (var i = 0; i < WINS.length; i++) {
      var l = WINS[i];
      if (b[l[0]] && b[l[0]] === b[l[1]] && b[l[1]] === b[l[2]]) return b[l[0]];
    }
    if (b.every(function (c) { return c; })) return "draw";
    return null;
  }

  function render() {
    boardEl.innerHTML = "";
    board.forEach(function (val, i) {
      var cell = document.createElement("div");
      cell.className = "cell" + (over || val ? " disabled" : "");
      cell.textContent = val === "X" ? "❌" : val === "O" ? "⭕" : "";
      cell.addEventListener("click", function () { handleClick(i); });
      boardEl.appendChild(cell);
    });
  }

  function newGame() {
    board = Array(9).fill(null);
    turn = "X";
    over = false;
    waitingForOpponent = false;
    resultBanner.innerHTML = "";
    render();
    if (mode === "friend" && myMark === "O") {
      resultBanner.textContent = window.ArcadeI18n.t("common.cpuTurn").replace("CPU", opponentCode);
    }
  }

  function endGame(result) {
    over = true;
    if (result === "draw") {
      stats.ties++;
      resultBanner.innerHTML = '<span class="overlay-win">' + window.ArcadeI18n.t("common.tie") + "</span>";
    } else if ((mode === "cpu" && result === "X") || (mode === "friend" && result === myMark)) {
      stats.wins++;
      resultBanner.innerHTML = '<span class="overlay-win">' + window.ArcadeI18n.t("common.youWin") + "</span>";
    } else {
      stats.losses++;
      resultBanner.innerHTML = '<span class="overlay-lose">' + window.ArcadeI18n.t("common.youLose") + "</span>";
    }
    saveStats();
    render();
  }

  function handleClick(i) {
    if (over || board[i]) return;
    if (mode === "friend") {
      if (turn !== myMark || waitingForOpponent) return;
      playMove(i, myMark);
      window.ArcadeFriends.sendGame(opponentCode, { type: "move", index: i });
      return;
    }
    if (turn !== "X") return;
    playMove(i, "X");
    if (!over) {
      turn = "O";
      render();
      setTimeout(cpuMove, 350);
    }
  }

  function playMove(i, mark) {
    board[i] = mark;
    var result = checkWinner(board);
    if (result) {
      endGame(result);
    } else {
      turn = turn === "X" ? "O" : "X";
      render();
    }
  }

  function cpuMove() {
    if (over) return;
    var i = bestMove(board);
    playMove(i, "O");
  }

  function bestMove(b) {
    var best = -Infinity, move = null;
    for (var i = 0; i < 9; i++) {
      if (!b[i]) {
        b[i] = "O";
        var score = minimax(b, false, 0);
        b[i] = null;
        if (score > best) { best = score; move = i; }
      }
    }
    return move;
  }

  function minimax(b, isMax, depth) {
    var result = checkWinner(b);
    if (result === "O") return 10 - depth;
    if (result === "X") return depth - 10;
    if (result === "draw") return 0;
    if (depth >= 6) return 0;
    var scores = [];
    for (var i = 0; i < 9; i++) {
      if (!b[i]) {
        b[i] = isMax ? "O" : "X";
        scores.push(minimax(b, !isMax, depth + 1));
        b[i] = null;
      }
    }
    return isMax ? Math.max.apply(null, scores) : Math.min.apply(null, scores);
  }

  // ---- Friend mode ----

  function setMode(m) {
    mode = m;
    modeCpuBtn.classList.toggle("active", m === "cpu");
    modeFriendBtn.classList.toggle("active", m === "friend");
    friendSetup.style.display = m === "friend" ? "block" : "none";
    myMark = "X";
    newGame();
  }

  modeCpuBtn.addEventListener("click", function () { setMode("cpu"); });
  modeFriendBtn.addEventListener("click", function () { setMode("friend"); });

  // The invite is re-announced until the friend's TIC TAC TOE page answers
  // with "joined". A single send isn't enough: if the friend is on the hub
  // or another game when it arrives, this page's listener doesn't exist
  // there and the invite is silently dropped.
  var inviteTimer = null;
  var joined = false;

  inviteBtn.addEventListener("click", function () {
    var code = opponentInput.value.trim().toUpperCase();
    if (!code) return;
    opponentCode = code;
    joined = false;
    window.ArcadeFriends.addFriend(code);
    waitingForOpponent = true;
    myMark = "X";
    mpStatus.textContent = "Connecting to " + code + "...";
    newGame();
    waitingForOpponent = false;
    window.ArcadeFriends.sendGame(opponentCode, { type: "invite", mark: "O" });

    clearInterval(inviteTimer);
    var tries = 0;
    inviteTimer = setInterval(function () {
      if (joined || mode !== "friend" || ++tries > 40) {
        clearInterval(inviteTimer);
        if (!joined && tries > 40) {
          mpStatus.textContent = "Couldn't reach " + code + ". Make sure they have THIS Tic Tac Toe page open, then invite again.";
        }
        return;
      }
      if (window.ArcadeFriends.isOnline(opponentCode)) {
        window.ArcadeFriends.sendGame(opponentCode, { type: "invite", mark: "O" });
        mpStatus.textContent = "Friend is online — waiting for them to open Tic Tac Toe...";
      } else {
        window.ArcadeFriends.connect(opponentCode);
        mpStatus.textContent = "Connecting to " + code + "... (they need the site open)";
      }
    }, 3000);
  });

  window.ArcadeFriends.onGameMessage(function (fromCode, payload) {
    if (payload.type === "invite") {
      // Duplicate invites are normal (re-announced until we answer). Only
      // reset the board on the first one, or when no move has been made yet.
      var alreadyPlaying = mode === "friend" && opponentCode === fromCode &&
        board && board.some(function (c) { return c; });
      opponentCode = fromCode;
      mode = "friend";
      myMark = payload.mark;
      modeFriendBtn.classList.add("active");
      modeCpuBtn.classList.remove("active");
      friendSetup.style.display = "block";
      opponentInput.value = fromCode;
      if (!alreadyPlaying) {
        mpStatus.textContent = "Match started with " + fromCode + "!";
        newGame();
      }
      window.ArcadeFriends.sendGame(fromCode, { type: "joined" });
    } else if (payload.type === "joined" && mode === "friend" && fromCode === opponentCode) {
      if (!joined) {
        joined = true;
        clearInterval(inviteTimer);
        mpStatus.textContent = "Friend joined! Your move — you're X.";
      }
    } else if (payload.type === "move" && mode === "friend" && fromCode === opponentCode) {
      playMove(payload.index, myMark === "X" ? "O" : "X");
    }
  });

  restartBtn.addEventListener("click", function () {
    if (mode === "friend" && opponentCode) {
      window.ArcadeFriends.sendGame(opponentCode, { type: "invite", mark: myMark === "X" ? "O" : "X" });
    }
    newGame();
  });

  loadStats();
  saveStats();
  setMode("cpu");
})();
