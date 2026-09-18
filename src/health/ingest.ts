import {
  DayRecord,
  HealthStore,
  HeartEventRecord,
  HeartRatePoint,
  IngestSummary,
  SleepRecord,
  WorkoutRecord,
  WorkoutSegment,
} from "./types";

/**
 * Parser for the JSON that the Health Auto Export iOS app POSTs to a
 * REST endpoint (Automations → REST API). Shape:
 *
 *   { "data": { "metrics": [ { name, units, data: [ { date, qty | Min/Avg/Max | sleep fields } ] } ],
 *               "workouts": [ { id?, name, start, end, duration?, activeEnergyBurned?, distance?, ... } ] } }
 *
 * Dates arrive as "yyyy-MM-dd HH:mm:ss Z" in the phone's timezone. We
 * attribute each point to its device-local calendar day by taking the
 * leading yyyy-MM-dd, which avoids UTC day-shift bugs entirely.
 *
 * Parsing is deliberately tolerant: the app's field names have drifted
 * between versions, and a manual export has no "data" wrapper.
 */

function num(v: unknown): number | undefined {
  if (typeof v === "number" && isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v);
    if (isFinite(n)) return n;
  }
  return undefined;
}

function normalizeName(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

/**
 * "2026-10-25 07:30:00 +0100" → epoch milliseconds. The UTC offset is carried
 * in the string, so the arithmetic stays right across a clock change: the night
 * Spain leaves summer time really is 25 hours long, and subtracting local wall
 * clock readings would quietly lose that hour.
 */
export function parseStamp(value: unknown): number | undefined {
  if (typeof value !== "string") return undefined;
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?\s*([+-]\d{2}):?(\d{2})?/);
  if (!m) return undefined;
  const [, y, mo, d, h, mi, s, offH, offM] = m;
  const utc = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s ?? 0));
  const sign = offH.startsWith("-") ? -1 : 1;
  const offsetMin = sign * (Math.abs(Number(offH)) * 60 + Number(offM ?? 0));
  return utc - offsetMin * 60000;
}

/** Hours between two of those stamps, when both parse. */
function hoursBetween(from: unknown, to: unknown): number | undefined {
  const a = parseStamp(from);
  const b = parseStamp(to);
  if (a === undefined || b === undefined || b <= a) return undefined;
  return (b - a) / 3600000;
}

/**
 * Sleep arithmetic that has to hold for a real night. Anything here failing
 * means the numbers are wrong, not merely unusual — most often because two
 * devices recorded the same hours, or because a wake-up was never written and
 * the record runs to the end of the day.
 */
function checkSleep(sleep: SleepRecord): string[] {
  const problems: string[] = [];
  const r = (v: number) => Math.round(v * 100) / 100;
  const total = sleep.totalSleepHours;
  const window = hoursBetween(sleep.sleepStart, sleep.sleepEnd);
  const stages = [sleep.coreHours, sleep.deepHours, sleep.remHours].filter(
    (v): v is number => typeof v === "number"
  );
  const stageSum = stages.reduce((a, b) => a + b, 0);

  if (total !== undefined && (total <= 0 || total > 14)) {
    problems.push(`total sleep of ${r(total)}h is outside anything a night can be`);
  }
  if (window !== undefined && window > 16) {
    problems.push(`sleepStart to sleepEnd spans ${r(window)}h, so one of them is wrong`);
  }
  if (total !== undefined && window !== undefined && total > window + 0.25) {
    problems.push(`total sleep of ${r(total)}h exceeds the ${r(window)}h between sleepStart and sleepEnd`);
  }
  if (total !== undefined && sleep.inBedHours !== undefined && total > sleep.inBedHours + 0.25) {
    problems.push(`total sleep of ${r(total)}h exceeds the ${r(sleep.inBedHours)}h spent in bed`);
  }
  if (stages.length > 0 && total !== undefined && Math.abs(stageSum - total) > Math.max(0.5, total * 0.15)) {
    problems.push(`stages add up to ${r(stageSum)}h but total sleep says ${r(total)}h`);
  }
  return problems;
}

/** "2026-08-26 07:01:12 +0200" → "2026-08-26" (device-local day). */
function localDay(dateStr: unknown): string | undefined {
  if (typeof dateStr !== "string") return undefined;
  const m = dateStr.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : undefined;
}

function getDay(store: HealthStore, date: string): DayRecord {
  if (!store.days[date]) {
    store.days[date] = { date, workouts: [], other: {} };
  }
  const day = store.days[date];
  if (!day.workouts) day.workouts = [];
  if (!day.other) day.other = {};
  return day;
}

/** Convert a duration to hours given the metric's units ("hr", "min", "s"). */
function toHours(value: number, units?: string): number {
  const u = (units || "hr").toLowerCase();
  if (u.startsWith("min")) return value / 60;
  if (u === "s" || u.startsWith("sec")) return value / 3600;
  return value;
}

/** Metrics that should be summed across the day; everything else is averaged. */
const SUM_METRICS = new Set([
  "active_energy",
  "basal_energy_burned",
  "step_count",
  "walking_running_distance",
  "cycling_distance",
  "swimming_distance",
  "flights_climbed",
  "apple_exercise_time",
  "apple_stand_time",
  "time_in_daylight",
]);

interface Acc {
  sum: number;
  count: number;
}

function pushAvg(map: Map<string, Map<string, Acc>>, metric: string, date: string, value: number) {
  let byDate = map.get(metric);
  if (!byDate) {
    byDate = new Map();
    map.set(metric, byDate);
  }
  const acc = byDate.get(date) || { sum: 0, count: 0 };
  acc.sum += value;
  acc.count += 1;
  byDate.set(date, acc);
}

function round(v: number, places = 2): number {
  const f = Math.pow(10, places);
  return Math.round(v * f) / f;
}

function parseSleepRow(row: any, units?: string): SleepRecord {
  const h = (v: unknown): number | undefined => {
    const n = num(v);
    return n === undefined ? undefined : round(toHours(n, units), 2);
  };
  const sleep: SleepRecord = {};
  // Aggregated sleep_analysis fields across Health Auto Export versions.
  const total = h(row.totalSleep) ?? h(row.asleep);
  if (total !== undefined) sleep.totalSleepHours = total;
  const inBed = h(row.inBed);
  if (inBed !== undefined) sleep.inBedHours = inBed;
  const core = h(row.core);
  if (core !== undefined) sleep.coreHours = core;
  const deep = h(row.deep);
  if (deep !== undefined) sleep.deepHours = deep;
  const rem = h(row.rem);
  if (rem !== undefined) sleep.remHours = rem;
  const awake = h(row.awake);
  if (awake !== undefined) sleep.awakeHours = awake;
  if (typeof row.sleepStart === "string") sleep.sleepStart = row.sleepStart;
  if (typeof row.sleepEnd === "string") sleep.sleepEnd = row.sleepEnd;
  const curve = parseHeartRateSeries(row.heartRateSeries);
  if (curve) sleep.heartRateSeries = curve;
  if (typeof row.source === "string") sleep.source = row.source;
  if (Array.isArray(row.sources)) {
    const list = row.sources.filter((v: unknown): v is string => typeof v === "string");
    if (list.length > 0) sleep.sources = list;
  }
  return sleep;
}

/** Pull a quantity out of the several shapes workouts have used: 42, {qty: 42}, {qty: "42"}. */
function qtyOf(v: any): number | undefined {
  if (v === null || v === undefined) return undefined;
  if (typeof v === "object") return num(v.qty);
  return num(v);
}

function parseWorkout(w: any): { date: string; workout: WorkoutRecord } | undefined {
  const date = localDay(w?.start);
  const name = typeof w?.name === "string" ? w.name : undefined;
  if (!date || !name) return undefined;

  const workout: WorkoutRecord = { name, start: w.start };
  if (typeof w.id === "string") workout.id = w.id;
  if (typeof w.end === "string") workout.end = w.end;

  // Prefer start/end for duration; fall back to the duration field (seconds in v2).
  const startMs = Date.parse(w.start);
  const endMs = typeof w.end === "string" ? Date.parse(w.end) : NaN;
  if (isFinite(startMs) && isFinite(endMs) && endMs > startMs) {
    workout.durationMin = round((endMs - startMs) / 60000, 1);
  } else {
    const d = qtyOf(w.duration);
    if (d !== undefined) workout.durationMin = round(d / 60, 1);
  }

  const kcal = qtyOf(w.activeEnergyBurned) ?? qtyOf(w.activeEnergy);
  if (kcal !== undefined) workout.activeEnergyKcal = round(kcal, 0);

  const dist = qtyOf(w.distance);
  if (dist !== undefined) {
    const distUnits = (typeof w.distance === "object" && w.distance?.units) || "km";
    workout.distanceKm = round(String(distUnits).toLowerCase().startsWith("mi") ? dist * 1.60934 : dist, 2);
  }

  const hr = w.heartRate ?? {};
  const avgHr = num(hr.avg) ?? num(hr.Avg) ?? qtyOf(w.avgHeartRate);
  const maxHr = num(hr.max) ?? num(hr.Max) ?? qtyOf(w.maxHeartRate);
  if (avgHr !== undefined) workout.avgHeartRate = round(avgHr, 0);
  if (maxHr !== undefined) workout.maxHeartRate = round(maxHr, 0);

  const elev = qtyOf(w.elevationUp) ?? qtyOf(w.elevation);
  if (elev !== undefined) workout.elevationUpM = round(elev, 0);

  if (typeof w.source === "string") workout.source = w.source;
  if (typeof w.device === "string") workout.device = w.device;
  if (typeof w.timeZone === "string") workout.timeZone = w.timeZone;

  if (Array.isArray(w.segments)) {
    const segments: WorkoutSegment[] = [];
    for (const raw of w.segments) {
      if (typeof raw?.type !== "string" || typeof raw?.start !== "string") continue;
      const segment: WorkoutSegment = { type: raw.type, start: raw.start };
      if (typeof raw.end === "string") segment.end = raw.end;
      const seconds = num(raw.duration);
      if (seconds !== undefined) segment.durationSec = round(seconds, 1);
      segments.push(segment);
    }
    if (segments.length > 0) workout.segments = segments;
  }

  const curve = parseHeartRateSeries(w.heartRateSeries);
  if (curve) workout.heartRateSeries = curve;

  return { date, workout };
}

/**
 * A heart-rate curve, defensively. The phone caps each one, but the endpoint
 * accepts anything anyone posts, so the cap is re-applied here — a store file
 * is loaded whole into memory on every read, and one runaway curve would be
 * paid for on every question anyone ever asks.
 */
const MAX_CURVE_POINTS = 480;

function parseHeartRateSeries(raw: unknown): HeartRatePoint[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const points: HeartRatePoint[] = [];
  for (const p of raw) {
    if (typeof p?.t !== "string") continue;
    const bpm = num(p.bpm) ?? num(p.qty);
    if (bpm === undefined) continue;
    points.push({ t: p.t, bpm: round(bpm, 0) });
    if (points.length >= MAX_CURVE_POINTS) break;
  }
  return points.length > 0 ? points : undefined;
}

function parseHeartEvent(raw: any): { date: string; event: HeartEventRecord } | undefined {
  const date = localDay(raw?.start);
  const type = typeof raw?.type === "string" ? raw.type : undefined;
  if (!date || !type) return undefined;

  const event: HeartEventRecord = { type, start: raw.start };
  if (typeof raw.id === "string") event.id = raw.id;
  if (typeof raw.end === "string") event.end = raw.end;
  if (typeof raw.source === "string") event.source = raw.source;
  if (typeof raw.device === "string") event.device = raw.device;
  if (typeof raw.timeZone === "string") event.timeZone = raw.timeZone;
  const threshold = num(raw.thresholdBpm);
  if (threshold !== undefined) event.thresholdBpm = round(threshold, 0);
  return { date, event };
}

/**
 * Merge one Health Auto Export payload into the store (mutates it).
 * Re-sent days simply overwrite — the export is the source of truth.
 */
export function ingestPayload(store: HealthStore, payload: any, source?: string): IngestSummary {
  const body = payload?.data && typeof payload.data === "object" ? payload.data : payload;
  const hasMetrics = Array.isArray(body?.metrics);
  const hasWorkouts = Array.isArray(body?.workouts);
  const metrics: any[] = hasMetrics ? body.metrics : [];
  const workouts: any[] = hasWorkouts ? body.workouts : [];
  // Optional and newer than the rest of the contract: a payload without it is
  // not malformed, it is a phone that has nothing to report or an older build.
  const heartEvents: any[] = Array.isArray(body?.heartEvents) ? body.heartEvents : [];
  // Reject only a payload of the wrong shape. A correctly formed export with
  // nothing in it is what a phone sends when Health access was declined or the
  // range holds no data, and answering that with an error puts a developer
  // message on the person's screen instead of something they can act on.
  if (!hasMetrics && !hasWorkouts) {
    throw new Error(
      'No "metrics" or "workouts" found. Expected a Health Auto Export JSON payload: {"data": {"metrics": [...], "workouts": [...]}}'
    );
  }

  const summary: IngestSummary = { daysTouched: 0, dataPoints: 0, workoutsAdded: 0, metricsSeen: [] };
  const touched = new Set<string>();
  const seen = new Set<string>();

  // metric -> date -> accumulated value (avg or sum resolved at the end)
  const accs = new Map<string, Map<string, Acc>>();
  const unitsSeen: { [metric: string]: string } = {};
  const sourcesSeen: { [metric: string]: string } = {};
  // heart_rate keeps Min/Avg/Max; hold separate accumulators
  const hrAcc = new Map<string, { min: Acc; avg: Acc; max: Acc }>();

  for (const metric of metrics) {
    const name = typeof metric?.name === "string" ? normalizeName(metric.name) : undefined;
    if (!name || !Array.isArray(metric?.data)) continue;
    seen.add(name);
    const units: string | undefined = typeof metric.units === "string" ? metric.units : undefined;
    if (units) unitsSeen[name] = units;
    if (typeof metric.source === "string" && metric.source) sourcesSeen[name] = metric.source;

    for (const row of metric.data) {
      const date = localDay(row?.date);
      if (!date) continue;

      if (name === "sleep_analysis") {
        const sleep = parseSleepRow(row, units);
        if (Object.keys(sleep).length > 0) {
          const merged: SleepRecord = { ...store.days[date]?.sleep, ...sleep };
          delete merged.suspect; // recomputed below against the merged numbers
          const problems = checkSleep(merged);
          if (problems.length > 0) merged.suspect = problems;
          getDay(store, date).sleep = merged;
          touched.add(date);
          summary.dataPoints++;
        }
        continue;
      }

      if (name === "heart_rate") {
        const mn = num(row.Min) ?? num(row.min);
        const av = num(row.Avg) ?? num(row.avg) ?? num(row.qty);
        const mx = num(row.Max) ?? num(row.max);
        if (mn === undefined && av === undefined && mx === undefined) continue;
        const acc = hrAcc.get(date) || {
          min: { sum: 0, count: 0 },
          avg: { sum: 0, count: 0 },
          max: { sum: 0, count: 0 },
        };
        if (mn !== undefined) { acc.min.sum += mn; acc.min.count++; }
        if (av !== undefined) { acc.avg.sum += av; acc.avg.count++; }
        if (mx !== undefined) { acc.max.sum = Math.max(acc.max.sum, mx); acc.max.count = 1; }
        hrAcc.set(date, acc);
        touched.add(date);
        summary.dataPoints++;
        continue;
      }

      const qty = num(row.qty) ?? num(row.Avg) ?? num(row.avg);
      if (qty === undefined) continue;
      pushAvg(accs, name, date, qty);
      touched.add(date);
      summary.dataPoints++;
    }
  }

  // Resolve accumulators into day records.
  for (const [metric, byDate] of accs) {
    for (const [date, acc] of byDate) {
      const value = SUM_METRICS.has(metric) ? acc.sum : acc.sum / acc.count;
      const day = getDay(store, date);
      switch (metric) {
        case "heart_rate_variability":
          day.hrvMs = round(value, 1);
          break;
        case "resting_heart_rate":
          day.restingHeartRate = round(value, 0);
          break;
        case "respiratory_rate":
          day.respiratoryRate = round(value, 1);
          break;
        case "blood_oxygen_saturation":
          day.bloodOxygenPct = round(value <= 1 ? value * 100 : value, 1);
          break;
        case "vo2_max":
          day.vo2Max = round(value, 1);
          break;
        case "apple_sleeping_wrist_temperature":
        case "wrist_temperature":
          day.wristTemperatureC = round(value, 2);
          break;
        case "active_energy":
          // A watch that was not worn produces no samples, and a day with a
          // genuine zero active energy does not exist. Storing the zero makes
          // "nothing was measured" indistinguishable from "you burned nothing",
          // so leave the field absent instead.
          if (value > 0) day.activeEnergyKcal = round(value, 0);
          break;
        case "step_count":
          day.steps = round(value, 0);
          break;
        default:
          day.other[metric] = round(value, 2);
      }
    }
  }

  for (const [date, acc] of hrAcc) {
    const day = getDay(store, date);
    if (acc.min.count) day.heartRateMin = round(acc.min.sum / acc.min.count, 0);
    if (acc.avg.count) day.heartRateAvg = round(acc.avg.sum / acc.avg.count, 0);
    if (acc.max.count) day.heartRateMax = round(acc.max.sum, 0);
  }

  // Workouts: replace-by-identity so re-sent exports don't duplicate.
  for (const raw of workouts) {
    const parsed = parseWorkout(raw);
    if (!parsed) continue;
    const day = getDay(store, parsed.date);
    const key = (w: WorkoutRecord) => w.id || `${w.name}|${w.start}`;
    const existing = day.workouts.findIndex((w) => key(w) === key(parsed.workout));
    if (existing >= 0) {
      day.workouts[existing] = parsed.workout;
    } else {
      day.workouts.push(parsed.workout);
      summary.workoutsAdded++;
    }
    touched.add(parsed.date);
    summary.dataPoints++;
  }

  // Heart events: replace-by-identity, so re-sending a range cannot duplicate
  // one. An event with no uuid falls back to its type and timestamp, which is
  // as unique as such an event gets.
  for (const raw of heartEvents) {
    const parsed = parseHeartEvent(raw);
    if (!parsed) continue;
    const day = getDay(store, parsed.date);
    if (!day.heartEvents) day.heartEvents = [];
    const key = (e: HeartEventRecord) => e.id || `${e.type}|${e.start}`;
    const existing = day.heartEvents.findIndex((e) => key(e) === key(parsed.event));
    if (existing >= 0) day.heartEvents[existing] = parsed.event;
    else day.heartEvents.push(parsed.event);
    touched.add(parsed.date);
    summary.dataPoints++;
  }

  const dates = [...touched].sort();
  summary.daysTouched = dates.length;
  summary.firstDate = dates[0];
  summary.lastDate = dates[dates.length - 1];
  summary.metricsSeen = [...seen].sort();

  store.units = { ...store.units, ...unitsSeen };
  store.sources = { ...store.sources, ...sourcesSeen };
  store.updatedAt = new Date().toISOString();
  store.lastIngestSource = source || "api";
  return summary;
}
