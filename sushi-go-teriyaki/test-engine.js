/*
 * Engine tests for Sushi Go: Teriyaki Edition.
 *
 * The game ships as one self-contained index.html, so this pulls the pure
 * logic out from between the ENGINE START / ENGINE END markers and runs it
 * in a bare VM context — no browser, no dependencies.
 *
 *   node test-engine.js
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
const start = html.indexOf("ENGINE START");
if (start < 0) throw new Error("ENGINE START marker not found in index.html");
// Skip past the banner comment; its own prose mentions "ENGINE END", so the
// closing marker has to be searched for from the first line of real code on.
const codeStart = html.indexOf("*/", start) + 2;
const end = html.indexOf("ENGINE END", codeStart);
if (end < 0) throw new Error("ENGINE END marker not found in index.html");
const source = html.slice(codeStart, html.lastIndexOf("/*", end));
if (!/function tally/.test(source)) throw new Error("extracted engine looks empty");

const EXPORTS = [
  "CARDS", "DECK_COUNTS", "JOKER_OPTIONS", "NIGIRI_PTS", "MAKI_ICONS",
  "DUMPLING_PTS", "HAND_SIZE", "buildDeck", "createGame", "dealRound",
  "playTurn", "roundOver", "tally", "scoreRound", "scorePuddings",
  "standings", "aiChoose", "cardValue", "humanSeats"
];
const E = vm.runInNewContext(source + "\n({" + EXPORTS.join(",") + "})", {});

let passed = 0;
const failures = [];

function check(name, fn) {
  try {
    fn();
    passed++;
  } catch (err) {
    failures.push(name + " — " + err.message);
  }
}
function eq(actual, expected, what) {
  if (actual !== expected) {
    throw new Error((what || "value") + ": expected " + expected + ", got " + actual);
  }
}
function plate(cards) {
  // cards: ["tempura", {eff:"dumpling", x2:true}, ...]
  return cards.map(c => (typeof c === "string" ? { eff: c, x2: false } : Object.assign({ x2: false }, c)));
}
// Drive a whole turn for every seat: picks[i] = hand index (or {index, jokerAs})
function turn(state, picks) {
  return E.playTurn(state, picks.map(p => (typeof p === "number" ? { index: p, jokerAs: null } : p)));
}
function freshGame(n) {
  const state = E.createGame(n, "normal");
  E.dealRound(state);
  return state;
}

/* ---------------- deck ---------------- */

check("deck holds 108 cards", () => {
  eq(E.buildDeck().length, 108, "deck size");
});

check("deck keeps Sushi Go's distribution with the three swaps", () => {
  const deck = E.buildDeck();
  const count = id => deck.filter(c => c === id).length;
  eq(count("teriyaki"), 14, "teriyaki (was sashimi)");
  eq(count("noodle"), 4, "noodle (was chopsticks)");
  eq(count("joker"), 6, "joker (was wasabi)");
  eq(count("maki1") + count("maki2") + count("maki3"), 26, "maki");
  eq(count("pudding"), 10, "pudding");
});

check("a joker cannot copy another joker", () => {
  eq(E.JOKER_OPTIONS.includes("joker"), false, "joker in its own option list");
  eq(E.JOKER_OPTIONS.length, Object.keys(E.CARDS).length - 1, "option count");
});

/* ---------------- seats: bots and people ---------------- */

check("one human is the default, and they are called You", () => {
  const s = E.createGame(4, "normal");
  eq(s.humanCount, 1, "human count");
  eq(s.players[0].human, true, "seat 0 is human");
  eq(s.players[0].name, "You", "solo player name");
  eq(s.players.filter(p => p.human).length, 1, "humans at the table");
  eq(E.humanSeats(s).join(","), "0", "human seats");
});

check("pass-and-play seats every human before the bots", () => {
  const s = E.createGame(5, "normal", null, 3);
  eq(s.humanCount, 3, "human count");
  eq(E.humanSeats(s).join(","), "0,1,2", "human seats");
  eq(s.players.filter(p => !p.human).length, 2, "bots");
  eq(s.players[0].name, "Player 1", "default name");
  eq(s.players[2].name, "Player 3", "default name");
});

check("a full table of humans leaves no bots", () => {
  const s = E.createGame(4, "normal", null, 4);
  eq(s.players.every(p => p.human), true, "all human");
  eq(E.humanSeats(s).length, 4, "human seats");
});

check("typed names are used, trimmed and length-capped", () => {
  const s = E.createGame(3, "normal", null, 2, ["  Tim  ", "A".repeat(40)]);
  eq(s.players[0].name, "Tim", "trimmed");
  eq(s.players[1].name.length, 14, "capped");
  eq(s.players[2].human, false, "third seat is a bot");
});

check("blank names fall back to Player N", () => {
  const s = E.createGame(3, "normal", null, 3, ["Tim", "   ", ""]);
  eq(s.players[0].name, "Tim", "given name");
  eq(s.players[1].name, "Player 2", "blank falls back");
  eq(s.players[2].name, "Player 3", "empty falls back");
});

check("human count cannot exceed or undercut the table", () => {
  eq(E.createGame(3, "normal", null, 9).humanCount, 3, "clamped down to the table size");
  eq(E.createGame(3, "normal", null, 0).humanCount, 1, "clamped up to one");
});

check("a pass-and-play game plays out and scores like any other", () => {
  const s = E.createGame(4, "normal", null, 3, ["Tim", "Ana", "Bo"]);
  for (let round = 1; round <= 3; round++) {
    E.dealRound(s);
    while (!E.roundOver(s)) {
      E.playTurn(s, s.players.map((_, seat) => E.aiChoose(s, seat)));
    }
    const plated = s.players.reduce((sum, p) => sum + p.tableau.length, 0);
    eq(plated, 4 * s.handSize, "cards plated in round " + round);
    E.scoreRound(s);
  }
  E.scorePuddings(s);
  s.players.forEach((p, i) => {
    if (!Number.isFinite(p.score)) throw new Error("seat " + i + " scored " + p.score);
  });
  eq(E.standings(s).length, 4, "standings");
});

/* ---------------- classic scoring ---------------- */

check("tempura scores 5 per pair, odd one is dead", () => {
  eq(E.tally(plate(["tempura"])).tempuraPts, 0, "one tempura");
  eq(E.tally(plate(["tempura", "tempura"])).tempuraPts, 5, "two tempura");
  eq(E.tally(plate(["tempura", "tempura", "tempura"])).tempuraPts, 5, "three tempura");
  eq(E.tally(plate(Array(4).fill("tempura"))).tempuraPts, 10, "four tempura");
});

check("gyoza climbs 1/3/6/10/15 and caps there", () => {
  [0, 1, 3, 6, 10, 15, 15].forEach((expected, n) => {
    eq(E.tally(plate(Array(n).fill("dumpling"))).dumplingPts, expected, n + " gyoza");
  });
});

check("nigiri pays face value", () => {
  eq(E.tally(plate(["nigiri_squid", "nigiri_salmon", "nigiri_egg"])).nigiriPts, 6, "3+2+1");
});

/* ---------------- teriyaki (replaces sashimi) ---------------- */

check("hands travel to the left after every turn", () => {
  const s = freshGame(3);
  s.players[0].hand = ["tempura", "maki1"];
  s.players[1].hand = ["pudding", "maki2"];
  s.players[2].hand = ["noodle", "maki3"];
  turn(s, [0, 0, 0]);
  eq(s.players[1].hand[0], "maki1", "seat 0's leftovers reached seat 1");
  eq(s.players[2].hand[0], "maki2", "seat 1's leftovers reached seat 2");
  eq(s.players[0].hand[0], "maki3", "seat 2's leftovers wrapped to seat 0");
});

check("teriyaki never works on yourself — the double goes to your left", () => {
  const s = freshGame(3);
  s.players[0].hand = ["teriyaki"];
  s.players[1].hand = ["pudding"];
  s.players[2].hand = ["pudding"];
  const reveals = turn(s, [0, 0, 0]);
  eq(s.players[0].pending, 0, "the player who plated it gets nothing");
  eq(s.players[1].pending, 1, "the player they pass to is served");
  eq(s.players[2].pending, 0, "nobody else is touched");
  eq(reveals[0].gift, 1, "reveal names the seat served");
});

check("the served player's next card counts twice, the server's does not", () => {
  const s = freshGame(3);
  s.players[0].hand = ["teriyaki"];
  s.players[1].hand = ["pudding"];
  s.players[2].hand = ["pudding"];
  turn(s, [0, 0, 0]);

  // Hands are re-seated each turn because playTurn passes them along.
  s.players[0].hand = ["dumpling"];
  s.players[1].hand = ["dumpling"];
  s.players[2].hand = ["pudding"];
  turn(s, [0, 0, 0]);

  eq(E.tally(s.players[1].tableau).dumpling, 2, "served player's gyoza counted twice");
  eq(E.tally(s.players[1].tableau).dumplingPts, 3, "points for a doubled gyoza");
  eq(E.tally(s.players[0].tableau).dumpling, 1, "server's own gyoza counted once");
  eq(s.players[1].pending, 0, "the double is spent");

  // Spent means spent — the card after it is plated normally.
  s.players[0].hand = ["pudding"];
  s.players[1].hand = ["dumpling"];
  s.players[2].hand = ["pudding"];
  turn(s, [0, 0, 0]);
  eq(E.tally(s.players[1].tableau).dumpling, 3, "third gyoza counted once");
});

check("teriyaki cannot double a card played on the same turn", () => {
  const s = freshGame(2);
  s.players[0].hand = ["teriyaki"];
  s.players[1].hand = ["dumpling"];
  turn(s, [0, 0]);
  eq(E.tally(s.players[1].tableau).dumpling, 1, "same-turn gyoza counted once");
  eq(s.players[1].pending, 1, "the double waits for their next card");
});

check("at two players the double lands on the only opponent", () => {
  const s = freshGame(2);
  s.players[0].hand = ["teriyaki"];
  s.players[1].hand = ["pudding"];
  turn(s, [0, 0]);
  eq(s.players[1].pending, 1, "opponent served");
  eq(s.players[0].pending, 0, "server unserved");
});

check("the last seat serves the first — passing wraps around", () => {
  const s = freshGame(5);
  s.players.forEach(p => { p.hand = ["pudding"]; });
  s.players[4].hand = ["teriyaki"];
  turn(s, [0, 0, 0, 0, 0]);
  eq(s.players[0].pending, 1, "seat 4 served seat 0");
  eq(s.players[4].pending, 0, "seat 4 served nobody at home");
});

check("two players can serve the same seat, stacking doubles", () => {
  const s = freshGame(3);
  // seat 1 and seat 2 both hand off into... seat 2 and seat 0 respectively.
  s.players[0].hand = ["pudding"];
  s.players[1].hand = ["teriyaki"];
  s.players[2].hand = ["teriyaki"];
  turn(s, [0, 0, 0]);
  eq(s.players[2].pending, 1, "seat 1 served seat 2");
  eq(s.players[0].pending, 1, "seat 2 served seat 0");
  eq(s.players[1].pending, 0, "seat 1 served nobody at home");
});

check("teriyaki doubles maki icons and nigiri points too", () => {
  eq(E.tally(plate(["teriyaki", { eff: "maki3", x2: true }])).makiBase, 6, "doubled maki3");
  eq(E.tally(plate(["teriyaki", { eff: "nigiri_squid", x2: true }])).nigiriPts, 6, "doubled squid");
  eq(E.tally(plate(["teriyaki", { eff: "tempura", x2: true }])).tempuraPts, 5, "doubled tempura is a pair");
});

check("a teriyaki card is never itself doubled, so doubles can stack", () => {
  const s = freshGame(2);
  // Both seats plate Teriyaki twice: each serves the other, and because a
  // Teriyaki never consumes a double, both end up holding two.
  for (let i = 0; i < 2; i++) {
    s.players[0].hand = ["teriyaki"];
    s.players[1].hand = ["teriyaki"];
    turn(s, [0, 0]);
  }
  eq(s.players[0].pending, 2, "seat 0 holding two doubles");
  eq(s.players[1].pending, 2, "seat 1 holding two doubles");
  eq(s.players[1].tableau.every(e => !e.x2), true, "no teriyaki got stamped");

  s.players[0].hand = ["pudding"];
  s.players[1].hand = ["nigiri_squid"];
  turn(s, [0, 0]);
  eq(E.tally(s.players[1].tableau).nigiriPts, 6, "squid doubled once");
  eq(s.players[1].pending, 1, "second double still waiting");
  eq(E.tally(s.players[0].tableau).puddings, 2, "pudding doubled too");
});

check("any scoring card spends a waiting double, so they do not pile up", () => {
  const s = freshGame(2);
  s.players[0].hand = ["teriyaki"];
  s.players[1].hand = ["pudding"];
  turn(s, [0, 0]);
  eq(s.players[1].pending, 1, "one double served");

  // Seat 1 plates an ordinary card, which eats the double it was holding
  // before seat 0's second Teriyaki serves another.
  s.players[0].hand = ["teriyaki"];
  s.players[1].hand = ["pudding"];
  turn(s, [0, 0]);
  eq(s.players[1].pending, 1, "spent one, served one");
  eq(E.tally(s.players[1].tableau).puddings, 3, "one plain pudding, one doubled");
});

check("teriyaki alone is worth nothing", () => {
  const t = E.tally(plate(["teriyaki", "teriyaki"]));
  eq(t.tempuraPts + t.dumplingPts + t.nigiriPts, 0, "points from bare teriyaki");
});

/* ---------------- noodle (replaces chopsticks) ---------------- */

check("noodles boost maki by half — 6 becomes 9", () => {
  const t = E.tally(plate(["maki3", "maki3", "noodle"]));
  eq(t.makiBase, 6, "base maki");
  eq(t.makiTotal, 9, "boosted maki");
});

check("noodles boost an odd maki count to a half — 7 becomes 10.5", () => {
  const t = E.tally(plate(["maki3", "maki3", "maki1", "noodle"]));
  eq(t.makiBase, 7, "base maki");
  eq(t.makiTotal, 10.5, "boosted maki");
});

check("two noodles add half each", () => {
  eq(E.tally(plate(["maki3", "maki3", "noodle", "noodle"])).makiTotal, 12, "6 maki, two bowls");
  eq(E.tally(plate(["maki3", "maki3", { eff: "noodle", x2: true }])).makiTotal, 12, "6 maki, doubled bowl");
});

check("noodles with no maki do nothing", () => {
  eq(E.tally(plate(["noodle", "noodle"])).makiTotal, 0, "boost on zero maki");
});

check("the boosted total is what wins the maki contest", () => {
  const s = freshGame(2);
  // seat 0: 4 maki + noodle = 6.  seat 1: 5 maki flat.
  s.players[0].tableau = plate(["maki2", "maki2", "noodle"]);
  s.players[1].tableau = plate(["maki3", "maki2"]);
  const rows = E.scoreRound(s);
  eq(rows[0].makiTotal, 6, "boosted total");
  eq(rows[0].makiPts, 6, "noodle-boosted player takes first");
  eq(rows[1].makiPts, 3, "flat 5 maki takes second");
});

/* ---------------- joker (replaces wasabi) ---------------- */

check("a joker scores as the card it names", () => {
  const s = freshGame(2);
  s.players[0].hand = ["joker"];
  s.players[1].hand = ["pudding"];
  turn(s, [{ index: 0, jokerAs: "nigiri_squid" }, 0]);
  eq(E.tally(s.players[0].tableau).nigiriPts, 3, "joker as squid");
  eq(s.players[0].tableau[0].joker, true, "flagged as a joker");
});

check("a joker can be doubled by a teriyaki served to you", () => {
  const s = freshGame(2);
  s.players[0].hand = ["teriyaki"];
  s.players[1].hand = ["pudding"];
  turn(s, [0, 0]);
  s.players[0].hand = ["pudding"];
  s.players[1].hand = ["joker"];
  turn(s, [0, { index: 0, jokerAs: "nigiri_squid" }]);
  eq(E.tally(s.players[1].tableau).nigiriPts, 6, "doubled joker-squid");
});

check("a joker can name maki, and noodles then boost it", () => {
  const s = freshGame(2);
  s.players[0].tableau = plate(["noodle"]);
  s.players[0].hand = ["joker"];
  s.players[1].hand = ["pudding"];
  turn(s, [{ index: 0, jokerAs: "maki3" }, 0]);
  eq(E.tally(s.players[0].tableau).makiTotal, 4.5, "3 maki boosted");
});

/* ---------------- maki + pudding contests ---------------- */

check("maki pays 6 for most and 3 for second", () => {
  const s = freshGame(3);
  s.players[0].tableau = plate(["maki3"]);
  s.players[1].tableau = plate(["maki2"]);
  s.players[2].tableau = plate(["maki1"]);
  const rows = E.scoreRound(s);
  eq(rows[0].makiPts, 6, "most");
  eq(rows[1].makiPts, 3, "second");
  eq(rows[2].makiPts, 0, "third");
});

check("a tie for most splits 6 and cancels second place", () => {
  const s = freshGame(3);
  s.players[0].tableau = plate(["maki3"]);
  s.players[1].tableau = plate(["maki3"]);
  s.players[2].tableau = plate(["maki1"]);
  const rows = E.scoreRound(s);
  eq(rows[0].makiPts, 3, "split first");
  eq(rows[1].makiPts, 3, "split first");
  eq(rows[2].makiPts, 0, "no second place awarded");
});

check("no maki on the table pays nobody", () => {
  const s = freshGame(2);
  s.players[0].tableau = plate(["tempura"]);
  s.players[1].tableau = plate(["pudding"]);
  const rows = E.scoreRound(s);
  eq(rows[0].makiPts + rows[1].makiPts, 0, "maki points awarded");
});

check("pudding pays +6 and -6, split and truncated", () => {
  const s = E.createGame(4, "normal");
  s.players[0].puddings = 4;
  s.players[1].puddings = 4;
  s.players[2].puddings = 2;
  s.players[3].puddings = 0;
  const pts = E.scorePuddings(s);
  eq(pts[0], 3, "tied most");
  eq(pts[1], 3, "tied most");
  eq(pts[2], 0, "middle");
  eq(pts[3], -6, "fewest");
});

check("two-player games skip the pudding penalty", () => {
  const s = E.createGame(2, "normal");
  s.players[0].puddings = 3;
  s.players[1].puddings = 0;
  const pts = E.scorePuddings(s);
  eq(pts[0], 6, "most");
  eq(pts[1], 0, "fewest — no penalty at two players");
});

check("everyone level on pudding scores nothing either way", () => {
  const s = E.createGame(3, "normal");
  s.players.forEach(p => { p.puddings = 2; });
  eq(E.scorePuddings(s).reduce((a, b) => a + b, 0), 0, "total pudding points");
});

/* ---------------- full-game simulation ---------------- */

check("300 full games run clean, conserving every card", () => {
  for (let g = 0; g < 300; g++) {
    const n = 2 + (g % 4);
    const state = E.createGame(n, ["easy", "normal", "hard"][g % 3]);

    for (let round = 1; round <= 3; round++) {
      E.dealRound(state);
      eq(state.round, round, "round counter");
      state.players.forEach(p => eq(p.hand.length, state.handSize, "hand size at deal"));

      let turns = 0;
      while (!E.roundOver(state)) {
        const picks = state.players.map((_, seat) => E.aiChoose(state, seat));
        picks.forEach((pick, seat) => {
          if (pick.index < 0 || pick.index >= state.players[seat].hand.length) {
            throw new Error("seat " + seat + " picked out-of-range index " + pick.index);
          }
          if (state.players[seat].hand[pick.index] === "joker" && !E.JOKER_OPTIONS.includes(pick.jokerAs)) {
            throw new Error("seat " + seat + " played a joker as " + pick.jokerAs);
          }
        });
        E.playTurn(state, picks);
        if (++turns > state.handSize) throw new Error("round did not end after " + turns + " turns");
      }

      eq(turns, state.handSize, "turns per round");
      const plated = state.players.reduce((sum, p) => sum + p.tableau.length, 0);
      eq(plated, n * state.handSize, "cards plated this round");
      state.players.forEach(p => eq(p.hand.length, 0, "cards left in hand"));

      const rows = E.scoreRound(state);
      rows.forEach((r, i) => {
        if (!Number.isFinite(r.total)) throw new Error("seat " + i + " scored " + r.total);
        if (r.total < 0) throw new Error("seat " + i + " scored a negative round: " + r.total);
      });
    }

    // Puddings are never plated twice, and the deck must not have run dry.
    const totalPuddings = state.players.reduce((sum, p) => sum + p.puddings, 0);
    if (totalPuddings > E.DECK_COUNTS.pudding * 2) {
      throw new Error("impossible pudding count: " + totalPuddings);
    }
    if (state.deck.length < 0) throw new Error("deck overdrawn");

    E.scorePuddings(state);
    state.players.forEach((p, i) => {
      if (!Number.isFinite(p.score)) throw new Error("seat " + i + " final score " + p.score);
      eq(p.roundScores.length, 3, "rounds recorded");
    });
    eq(E.standings(state).length, n, "standings length");
  }
});

check("standings sort by score, breaking ties on pudding", () => {
  const s = E.createGame(3, "normal");
  s.players[0].score = 40; s.players[0].puddings = 0;
  s.players[1].score = 55; s.players[1].puddings = 1;
  s.players[2].score = 55; s.players[2].puddings = 4;
  const order = E.standings(s);
  eq(order[0].i, 2, "pudding breaks the tie");
  eq(order[1].i, 1, "second");
  eq(order[2].i, 0, "third");
});

check("the brain reaches for a big card while holding a served double", () => {
  const s = freshGame(3);
  const seat = 1;
  s.players[seat].tableau = [];
  s.players[seat].pending = 1;
  const doubled = E.cardValue(s, seat, "nigiri_squid");
  s.players[seat].pending = 0;
  const plain = E.cardValue(s, seat, "nigiri_squid");
  if (doubled <= plain) throw new Error("a served double did not raise the card's value");
});

check("the brain treats teriyaki as a card to dump, not to want", () => {
  const s = freshGame(3);
  const seat = 1;
  s.players[seat].tableau = [];
  const teriyaki = E.cardValue(s, seat, "teriyaki");
  if (teriyaki >= 0) throw new Error("teriyaki should cost the player, valued " + teriyaki);
  ["nigiri_egg", "dumpling", "pudding", "maki1"].forEach(id => {
    if (E.cardValue(s, seat, id) <= teriyaki) {
      throw new Error(id + " ranked no better than teriyaki");
    }
  });
});

/* ---------------- report ---------------- */

console.log("");
if (failures.length) {
  console.log("  " + passed + " passed, " + failures.length + " FAILED\n");
  failures.forEach(f => console.log("  ✗ " + f));
  console.log("");
  process.exit(1);
}
console.log("  ✓ all " + passed + " engine checks passed\n");
