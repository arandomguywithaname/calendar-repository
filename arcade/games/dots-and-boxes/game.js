(function () {
  var GAME_ID = "dots-and-boxes";
  var boardEl = document.getElementById("board");
  var scoreEl = document.getElementById("score");
  var bestEl = document.getElementById("best");
  var turnStatEl = document.getElementById("turn-stat");
  var resultBanner = document.getElementById("result-banner");
  var restartBtn = document.getElementById("restart");

  var DOTS = 5;
  var BOX_N = DOTS - 1; // 4x4 boxes
  var CPU_DELAY = 550;

  // edgesH[r][c]: r in 0..DOTS-1, c in 0..BOX_N-1 (top edges of row r)
  // edgesV[r][c]: r in 0..BOX_N-1, c in 0..DOTS-1 (left edges of col c)
  var edgesH, edgesV, boxes, scores, turn, over;

  function newGame() {
    edgesH = [];
    for (var r = 0; r < DOTS; r++) {
      var rowH = [];
      for (var c = 0; c < BOX_N; c++) rowH.push(null);
      edgesH.push(rowH);
    }
    edgesV = [];
    for (var r2 = 0; r2 < BOX_N; r2++) {
      var rowV = [];
      for (var c2 = 0; c2 < DOTS; c2++) rowV.push(null);
      edgesV.push(rowV);
    }
    boxes = [];
    for (var r3 = 0; r3 < BOX_N; r3++) {
      var rowB = [];
      for (var c3 = 0; c3 < BOX_N; c3++) rowB.push(null);
      boxes.push(rowB);
    }
    scores = { player: 0, cpu: 0 };
    turn = "player";
    over = false;
    resultBanner.innerHTML = "";
    refreshHud();
    render();
  }

  function boxCount(r, c) {
    var n = 0;
    if (edgesH[r][c]) n++;
    if (edgesH[r + 1][c]) n++;
    if (edgesV[r][c]) n++;
    if (edgesV[r][c + 1]) n++;
    return n;
  }

  function affectedBoxes(type, r, c) {
    var list = [];
    if (type === "h") {
      if (r - 1 >= 0) list.push([r - 1, c]);
      if (r < BOX_N) list.push([r, c]);
    } else {
      if (c - 1 >= 0) list.push([r, c - 1]);
      if (c < BOX_N) list.push([r, c]);
    }
    return list;
  }

  function isFilled(type, r, c) {
    return type === "h" ? !!edgesH[r][c] : !!edgesV[r][c];
  }

  function placeEdge(type, r, c, who) {
    if (type === "h") edgesH[r][c] = who;
    else edgesV[r][c] = who;
    var scored = false;
    affectedBoxes(type, r, c).forEach(function (pair) {
      var br = pair[0], bc = pair[1];
      if (!boxes[br][bc] && boxCount(br, bc) === 4) {
        boxes[br][bc] = who;
        scores[who]++;
        scored = true;
      }
    });
    return scored;
  }

  function availableEdges() {
    var list = [];
    for (var r = 0; r < DOTS; r++) {
      for (var c = 0; c < BOX_N; c++) {
        if (!edgesH[r][c]) list.push({ type: "h", r: r, c: c });
      }
    }
    for (var r2 = 0; r2 < BOX_N; r2++) {
      for (var c2 = 0; c2 < DOTS; c2++) {
        if (!edgesV[r2][c2]) list.push({ type: "v", r: r2, c: c2 });
      }
    }
    return list;
  }

  function isFreeMove(edge) {
    return affectedBoxes(edge.type, edge.r, edge.c).some(function (pair) {
      var br = pair[0], bc = pair[1];
      return !boxes[br][bc] && boxCount(br, bc) === 3;
    });
  }

  function isSafeMove(edge) {
    return affectedBoxes(edge.type, edge.r, edge.c).every(function (pair) {
      var br = pair[0], bc = pair[1];
      return boxes[br][bc] || boxCount(br, bc) <= 1;
    });
  }

  function chooseCpuMove() {
    var avail = availableEdges();
    if (!avail.length) return null;
    var free = avail.filter(isFreeMove);
    if (free.length) return window.ArcadeCommon.pick(free);
    var safe = avail.filter(isSafeMove);
    if (safe.length) return window.ArcadeCommon.pick(safe);
    return window.ArcadeCommon.pick(avail);
  }

  function totalBoxes() { return BOX_N * BOX_N; }

  function checkGameOver() {
    if (scores.player + scores.cpu < totalBoxes()) return false;
    over = true;
    var improved = window.ArcadeCommon.setBest(GAME_ID, scores.player);
    var best = window.ArcadeCommon.getBest(GAME_ID);
    var msg;
    if (scores.player > scores.cpu) {
      msg = '<span class="overlay-win">' + window.ArcadeI18n.t("common.youWin") + "</span>";
    } else if (scores.player < scores.cpu) {
      msg = '<span class="overlay-lose">' + window.ArcadeI18n.t("common.youLose") + "</span>";
    } else {
      msg = '<span class="overlay-win">' + window.ArcadeI18n.t("common.tie") + "</span>";
    }
    resultBanner.innerHTML = msg + '<div class="quiz-summary">' +
      window.ArcadeI18n.t("common.score") + ": " + scores.player + "-" + scores.cpu +
      (improved ? " 🏆" : "") + "<br>" +
      window.ArcadeI18n.t("common.best") + ": " + (best === null ? "-" : best) +
      "</div>";
    refreshHud();
    render();
    return true;
  }

  function handleEdgeClick(type, r, c) {
    if (over || turn !== "player" || isFilled(type, r, c)) return;
    var scored = placeEdge(type, r, c, "player");
    refreshHud();
    render();
    if (checkGameOver()) return;
    if (scored) {
      turnStatEl.textContent = window.ArcadeI18n.t("common.yourTurn");
    } else {
      turn = "cpu";
      turnStatEl.textContent = window.ArcadeI18n.t("common.cpuTurn");
      setTimeout(cpuTurn, CPU_DELAY);
    }
  }

  function cpuTurn() {
    if (over) return;
    var move = chooseCpuMove();
    if (!move) { checkGameOver(); return; }
    var scored = placeEdge(move.type, move.r, move.c, "cpu");
    refreshHud();
    render();
    if (checkGameOver()) return;
    if (scored) {
      setTimeout(cpuTurn, CPU_DELAY);
    } else {
      turn = "player";
      turnStatEl.textContent = window.ArcadeI18n.t("common.yourTurn");
    }
  }

  function refreshHud() {
    scoreEl.textContent = scores.player + "-" + scores.cpu;
    var best = window.ArcadeCommon.getBest(GAME_ID);
    bestEl.textContent = best === null ? "-" : best;
  }

  function render() {
    boardEl.innerHTML = "";
    var n = 2 * DOTS - 1;
    for (var i = 0; i < n; i++) {
      for (var j = 0; j < n; j++) {
        var el;
        if (i % 2 === 0 && j % 2 === 0) {
          el = document.createElement("div");
          el.className = "dab-dot";
        } else if (i % 2 === 0 && j % 2 === 1) {
          var hr = i / 2, hc = (j - 1) / 2;
          el = document.createElement("button");
          el.className = "dab-edge";
          var hOwner = edgesH[hr][hc];
          if (hOwner) el.className += " filled " + hOwner;
          (function (r, c) {
            el.addEventListener("click", function () { handleEdgeClick("h", r, c); });
          })(hr, hc);
        } else if (i % 2 === 1 && j % 2 === 0) {
          var vr = (i - 1) / 2, vc = j / 2;
          el = document.createElement("button");
          el.className = "dab-edge";
          var vOwner = edgesV[vr][vc];
          if (vOwner) el.className += " filled " + vOwner;
          (function (r, c) {
            el.addEventListener("click", function () { handleEdgeClick("v", r, c); });
          })(vr, vc);
        } else {
          var br = (i - 1) / 2, bc = (j - 1) / 2;
          el = document.createElement("div");
          el.className = "dab-box";
          var owner = boxes[br][bc];
          if (owner) {
            el.className += " " + owner;
            el.textContent = owner === "player" ? "P" : "C";
          }
        }
        boardEl.appendChild(el);
      }
    }
  }

  restartBtn.addEventListener("click", newGame);
  newGame();
})();
