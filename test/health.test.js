/**
 * The connector's first tests. Plain Node, no framework — run them with:
 *
 *   npm test
 *
 * Every case here is a real bug that reached dad's phone, or the edge that
 * would have caused the next one. If you change how sleep or the scores are
 * computed, these are the numbers that must keep holding.
 */
const assert = require("assert");
const { ingestPayload, parseStamp } = require("../dist/health/ingest");
const { emptyStore } = require("../dist/health/store");
const { computeRecovery, computeExertion, exertionScore } = require("../dist/health/metrics");
const { noRecoveryReason } = require("../dist/health/mcp");

let passed = 0;
const failures = [];
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log("  ok   " + name);
  } catch (err) {
    failures.push({ name, err });
    console.log("  FAIL " + name + "\n         " + err.message);
  }
}
function group(name) {
  console.log("\n" + name);
}

/** Ingest one night and hand back the stored sleep record. */
function night(date, fields) {
  const store = emptyStore();
  ingestPayload(
    store,
    {
      data: {
        metrics: [
          {
            name: "sleep_analysis",
            units: "hr",
            data: [Object.assign({ date: date + " 12:00:00 +0200" }, fields)],
          },
        ],
        workouts: [],
      },
    },
    "test"
  );
  return store.days[date].sleep;
}

const sound = {
  totalSleep: 7.1,
  core: 4.2,
  deep: 1.3,
  rem: 1.6,
  awake: 0.4,
  inBed: 7.8,
  sleepStart: "2026-09-06 23:10:00 +0200",
  sleepEnd: "2026-09-07 06:56:00 +0200",
};

group("timestamps carry their own UTC offset");

test("a plain stamp parses", () => {
  assert.strictEqual(parseStamp("2026-09-07 06:56:00 +0200"), Date.UTC(2026, 8, 7, 4, 56));
});

test("a negative offset moves the other way", () => {
  assert.strictEqual(parseStamp("2026-09-07 06:56:00 -0500"), Date.UTC(2026, 8, 7, 11, 56));
});

test("the night the clocks go back really is 9.5 hours, not 8.5", () => {
  const from = parseStamp("2026-10-24 23:00:00 +0200");
  const to = parseStamp("2026-10-25 07:30:00 +0100");
  assert.strictEqual((to - from) / 3600000, 9.5);
});

test("nonsense parses to nothing rather than to a plausible number", () => {
  assert.strictEqual(parseStamp("not a date"), undefined);
  assert.strictEqual(parseStamp(undefined), undefined);
});

group("sleep arithmetic that has to hold");

test("an ordinary night raises no complaint", () => {
  assert.strictEqual(night("2026-09-07", sound).suspect, undefined);
});

test("a night crossing midnight is fine", () => {
  const s = night("2026-09-07", sound);
  assert.strictEqual(s.totalSleepHours, 7.1);
  assert.strictEqual(s.suspect, undefined);
});

test("the DST night is NOT flagged — the extra hour is real", () => {
  const s = night("2026-10-25", {
    totalSleep: 9.0,
    core: 5.4,
    deep: 1.6,
    rem: 2.0,
    inBed: 9.4,
    sleepStart: "2026-10-24 23:00:00 +0200",
    sleepEnd: "2026-10-25 07:30:00 +0100",
  });
  assert.strictEqual(s.suspect, undefined);
});

test("two devices double-counting one night is caught", () => {
  // What dad actually saw: stages adding to more than the night was long.
  const s = night("2026-09-03", {
    totalSleep: 15.7,
    core: 9.4,
    deep: 2.3,
    rem: 4.0,
    sleepStart: "2026-09-02 22:40:00 +0200",
    sleepEnd: "2026-09-03 07:57:00 +0200",
  });
  assert.ok(s.suspect && s.suspect.length > 0, "should be flagged");
  assert.ok(s.suspect.some((w) => w.includes("exceeds")), "should say it exceeds the window");
});

test("a wake-up that was never written, leaving the night open to 23:59", () => {
  const s = night("2026-09-05", {
    totalSleep: 7.2,
    sleepStart: "2026-09-05 00:03:00 +0200",
    sleepEnd: "2026-09-05 23:59:30 +0200",
  });
  assert.ok(s.suspect.some((w) => w.includes("spans")), "should call out the window");
});

test("more sleep than time spent in bed is impossible", () => {
  const s = night("2026-09-06", {
    totalSleep: 13.79,
    inBed: 8.51,
    sleepStart: "2026-09-05 23:20:00 +0200",
    sleepEnd: "2026-09-06 07:50:00 +0200",
  });
  assert.ok(s.suspect.some((w) => w.includes("in bed")), "should mention time in bed");
});

group("empty and missing data");

test("an empty but well-formed export is accepted, not an error", () => {
  const store = emptyStore();
  const summary = ingestPayload(store, { data: { metrics: [], workouts: [] } }, "test");
  assert.strictEqual(summary.dataPoints, 0);
  assert.strictEqual(summary.daysTouched, 0);
});

test("a payload of the wrong shape is still rejected", () => {
  assert.throws(() => ingestPayload(emptyStore(), { hello: "world" }, "test"));
});

test("zero active energy is left out — it means nothing was measured", () => {
  const store = emptyStore();
  ingestPayload(
    store,
    {
      data: {
        metrics: [
          { name: "active_energy", units: "kcal", data: [{ date: "2026-09-04 12:00:00 +0200", qty: 0 }] },
          { name: "step_count", units: "steps", data: [{ date: "2026-09-04 12:00:00 +0200", qty: 7048 }] },
        ],
        workouts: [],
      },
    },
    "test"
  );
  const day = store.days["2026-09-04"];
  assert.strictEqual(day.steps, 7048);
  assert.strictEqual(
    day.activeEnergyKcal,
    undefined,
    "a day with 7048 steps did not burn zero calories — the field should be absent, not 0"
  );
});

group("recovery does not swallow a poisoned input");

function storeWithHistory(finalDay) {
  const store = emptyStore();
  for (let i = 0; i < 45; i++) {
    const d = new Date(Date.UTC(2026, 6, 20) + i * 86400000).toISOString().slice(0, 10);
    store.days[d] = { date: d, hrvMs: 50 + (i % 9), restingHeartRate: 55 + (i % 4), workouts: [], other: {} };
  }
  store.days["2026-09-01"] = Object.assign(
    { date: "2026-09-01", hrvMs: 52, restingHeartRate: 55, workouts: [], other: {} },
    finalDay
  );
  return store;
}

test("a flagged night is excluded and the answer says so", () => {
  const store = storeWithHistory({
    sleep: { totalSleepHours: 15.2, suspect: ["total sleep of 15.2h is outside anything a night can be"] },
  });
  const r = computeRecovery(store, "2026-09-01");
  assert.strictEqual(r.confidence, "limited");
  assert.strictEqual(r.components.sleepScore, undefined, "the impossible night must not score");
  assert.ok(r.caveats.some((c) => c.includes("sleep was left out")));
});

test("with nothing but a discarded night, the answer says which", () => {
  // No history, so no baselines — but blaming missing history would send the
  // reader hunting for the wrong problem when the night was simply thrown out.
  const store = emptyStore();
  store.days["2026-09-01"] = {
    date: "2026-09-01",
    workouts: [],
    other: {},
    sleep: { totalSleepHours: 15.2, suspect: ["total sleep of 15.2h is outside anything a night can be"] },
  };
  assert.strictEqual(computeRecovery(store, "2026-09-01"), undefined, "nothing usable is left to score");
  const reason = noRecoveryReason(store.days["2026-09-01"]);
  assert.ok(/set aside/.test(reason), `should say the night was set aside, got: ${reason}`);
  assert.ok(!/insufficient/.test(reason), "must not blame missing history for a discarded night");
});

test("a sound night is used and confidence is clean", () => {
  const r = computeRecovery(storeWithHistory({ sleep: { totalSleepHours: 7.4 } }), "2026-09-01");
  assert.strictEqual(r.confidence, "ok");
  assert.ok(r.components.sleepScore > 0);
  assert.strictEqual(r.caveats, undefined);
});

group("exertion keeps hard days apart");

test("a typical hard day still lands on 7", () => {
  assert.strictEqual(exertionScore(25, 25), 7);
});

test("the two loads that used to both read 10.0 are now distinct", () => {
  // Dad's readings. The old curve was a straight line clipped at 10, so once
  // his baseline collapsed to the floor these two days — a jog and a race —
  // both came back as exactly 10.0 and the score stopped meaning anything.
  const light = exertionScore(18.9, 10);
  const heavy = exertionScore(59.3, 10);
  assert.ok(light < heavy, `a jog scored ${light}, a race ${heavy} — they must differ`);
  assert.ok(light < 10, `${light}: an ordinary day must leave room above it`);
});

test("a moderate day and a brutal one stay apart at a normal baseline too", () => {
  assert.ok(exertionScore(18.9, 25) < exertionScore(59.3, 25));
});

test("the scale never runs backwards", () => {
  let previous = -1;
  for (let load = 0; load <= 200; load += 2.5) {
    const score = exertionScore(load, 25);
    assert.ok(score >= previous, `score fell at load ${load}`);
    previous = score;
  }
});

test("nothing done is nothing scored", () => {
  assert.strictEqual(exertionScore(0, 25), 0);
});

test("a real day of training is reported alongside its raw load", () => {
  const store = emptyStore();
  store.days["2026-09-09"] = {
    date: "2026-09-09",
    restingHeartRate: 55,
    workouts: [
      {
        name: "Outdoor Run",
        start: "2026-09-09 07:00:00 +0200",
        end: "2026-09-09 08:00:00 +0200",
        durationMin: 60,
        avgHeartRate: 150,
      },
    ],
    other: {},
  };
  const e = computeExertion(store, "2026-09-09");
  assert.ok(e.trainingLoad > 0, "the raw load must stay visible next to the score");
  assert.ok(e.score > 0 && e.score <= 10);
});

console.log(
  "\n" +
    (failures.length === 0
      ? `all ${passed} tests passed`
      : `${passed} passed, ${failures.length} FAILED`)
);
process.exit(failures.length === 0 ? 0 : 1);
