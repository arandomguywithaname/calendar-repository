import { DayRecord, HealthStore, IngestSummary, SleepRecord, WorkoutRecord } from "./types";

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

  return { date, workout };
}

/**
 * Merge one Health Auto Export payload into the store (mutates it).
 * Re-sent days simply overwrite — the export is the source of truth.
 */
export function ingestPayload(store: HealthStore, payload: any, source?: string): IngestSummary {
  const body = payload?.data && typeof payload.data === "object" ? payload.data : payload;
  const metrics: any[] = Array.isArray(body?.metrics) ? body.metrics : [];
  const workouts: any[] = Array.isArray(body?.workouts) ? body.workouts : [];
  if (metrics.length === 0 && workouts.length === 0) {
    throw new Error(
      'No "metrics" or "workouts" found. Expected a Health Auto Export JSON payload: {"data": {"metrics": [...], "workouts": [...]}}'
    );
  }

  const summary: IngestSummary = { daysTouched: 0, dataPoints: 0, workoutsAdded: 0, metricsSeen: [] };
  const touched = new Set<string>();
  const seen = new Set<string>();

  // metric -> date -> accumulated value (avg or sum resolved at the end)
  const accs = new Map<string, Map<string, Acc>>();
  // heart_rate keeps Min/Avg/Max; hold separate accumulators
  const hrAcc = new Map<string, { min: Acc; avg: Acc; max: Acc }>();

  for (const metric of metrics) {
    const name = typeof metric?.name === "string" ? normalizeName(metric.name) : undefined;
    if (!name || !Array.isArray(metric?.data)) continue;
    seen.add(name);
    const units: string | undefined = typeof metric.units === "string" ? metric.units : undefined;

    for (const row of metric.data) {
      const date = localDay(row?.date);
      if (!date) continue;

      if (name === "sleep_analysis") {
        const sleep = parseSleepRow(row, units);
        if (Object.keys(sleep).length > 0) {
          getDay(store, date).sleep = { ...store.days[date].sleep, ...sleep };
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
          day.activeEnergyKcal = round(value, 0);
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

  const dates = [...touched].sort();
  summary.daysTouched = dates.length;
  summary.firstDate = dates[0];
  summary.lastDate = dates[dates.length - 1];
  summary.metricsSeen = [...seen].sort();

  store.updatedAt = new Date().toISOString();
  store.lastIngestSource = source || "api";
  return summary;
}
