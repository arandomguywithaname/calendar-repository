import { DayRecord, HealthStore } from "./types";
import { sortedDates } from "./store";

/**
 * Athlytic-style scores computed from the raw Apple Health inputs.
 *
 * Athlytic's exact formulas are proprietary and unpublished, so these are
 * transparent estimates built the same way Athlytic describes its scores:
 *  - Recovery (0–100): today's HRV vs your rolling personal baseline,
 *    adjusted by resting heart rate and sleep.
 *  - Exertion (0–10): cardiovascular load (a TRIMP-style heart-rate ×
 *    duration sum) scaled against your own recent training history.
 *  - Target exertion range: derived from recovery, like Athlytic's
 *    daily "train in this range" guidance.
 * Every tool response labels them as estimates.
 */

const BASELINE_DAYS = 42;
const MIN_BASELINE_SAMPLES = 5;

export interface Baseline {
  mean: number;
  std: number;
  count: number;
}

function baselineOf(values: number[]): Baseline | undefined {
  if (values.length < MIN_BASELINE_SAMPLES) return undefined;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) * (b - mean), 0) / values.length;
  return { mean, std: Math.sqrt(variance), count: values.length };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function round(v: number, places = 1): number {
  const f = Math.pow(10, places);
  return Math.round(v * f) / f;
}

/** Days strictly before `date`, most recent first, limited to the baseline window. */
function previousDays(store: HealthStore, date: string, window = BASELINE_DAYS): DayRecord[] {
  return sortedDates(store)
    .filter((d) => d < date)
    .slice(-window)
    .map((d) => store.days[d]);
}

function pick(days: DayRecord[], get: (d: DayRecord) => number | undefined): number[] {
  return days.map(get).filter((v): v is number => v !== undefined && isFinite(v));
}

/**
 * Map a value to 0–100 where 50 = personal baseline and each standard
 * deviation moves the score 25 points. direction=+1 → higher is better.
 */
function deviationScore(value: number, base: Baseline, direction: 1 | -1, minStd: number): number {
  const std = Math.max(base.std, minStd);
  const z = ((value - base.mean) / std) * direction;
  return clamp(50 + 25 * z, 0, 100);
}

export interface RecoveryResult {
  score: number; // 0–100
  band: "low" | "moderate" | "high";
  components: {
    hrvScore?: number;
    restingHrScore?: number;
    sleepScore?: number;
  };
  inputs: {
    hrvMs?: number;
    hrvBaselineMs?: number;
    restingHeartRate?: number;
    restingHrBaseline?: number;
    sleepHours?: number;
  };
}

export function computeRecovery(store: HealthStore, date: string): RecoveryResult | undefined {
  const day = store.days[date];
  if (!day) return undefined;
  const history = previousDays(store, date);

  const parts: { score: number; weight: number; key: keyof RecoveryResult["components"] }[] = [];
  const components: RecoveryResult["components"] = {};
  const inputs: RecoveryResult["inputs"] = {};

  if (day.hrvMs !== undefined) {
    const base = baselineOf(pick(history, (d) => d.hrvMs));
    if (base) {
      const s = deviationScore(day.hrvMs, base, 1, 4); // ≥4ms std so one noisy week can't peg the score
      components.hrvScore = round(s, 0);
      inputs.hrvMs = day.hrvMs;
      inputs.hrvBaselineMs = round(base.mean, 1);
      parts.push({ score: s, weight: 0.5, key: "hrvScore" });
    }
  }

  if (day.restingHeartRate !== undefined) {
    const base = baselineOf(pick(history, (d) => d.restingHeartRate));
    if (base) {
      const s = deviationScore(day.restingHeartRate, base, -1, 1.5); // lower RHR is better
      components.restingHrScore = round(s, 0);
      inputs.restingHeartRate = day.restingHeartRate;
      inputs.restingHrBaseline = round(base.mean, 1);
      parts.push({ score: s, weight: 0.25, key: "restingHrScore" });
    }
  }

  const sleepHours = day.sleep?.totalSleepHours;
  if (sleepHours !== undefined) {
    // 7.5h of sleep scores 100; each missing hour costs ~13 points.
    const s = clamp((sleepHours / 7.5) * 100, 0, 100);
    components.sleepScore = round(s, 0);
    inputs.sleepHours = sleepHours;
    parts.push({ score: s, weight: 0.25, key: "sleepScore" });
  }

  if (parts.length === 0) return undefined;
  const totalWeight = parts.reduce((a, p) => a + p.weight, 0);
  const score = Math.round(parts.reduce((a, p) => a + p.score * p.weight, 0) / totalWeight);
  const band = score >= 67 ? "high" : score >= 34 ? "moderate" : "low";
  return { score, band, components, inputs };
}

export interface ExertionResult {
  score: number; // 0–10
  trainingLoad: number; // raw TRIMP-style load for the day
  loadBaseline?: number; // typical (P75) daily load over the window
  targetRange?: { low: number; high: number }; // from recovery, Athlytic-style
}

/** Max observed heart rate anywhere in the data; a sane default otherwise. */
function estimateHrMax(store: HealthStore): number {
  let max = 0;
  for (const d of Object.values(store.days)) {
    if (d.heartRateMax) max = Math.max(max, d.heartRateMax);
    for (const w of d.workouts) if (w.maxHeartRate) max = Math.max(max, w.maxHeartRate);
  }
  return max >= 120 ? max : 190;
}

function estimateHrRest(store: HealthStore, date: string): number {
  const values = pick(previousDays(store, date), (d) => d.restingHeartRate);
  if (values.length === 0) return store.days[date]?.restingHeartRate ?? 60;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** TRIMP-style load for one day: Σ workout minutes × heart-rate-reserve fraction. */
function dayLoad(day: DayRecord, hrMax: number, hrRest: number): number {
  let load = 0;
  for (const w of day.workouts) {
    const mins = w.durationMin ?? 0;
    if (mins <= 0) continue;
    let frac: number;
    if (w.avgHeartRate !== undefined && hrMax > hrRest) {
      frac = clamp((w.avgHeartRate - hrRest) / (hrMax - hrRest), 0.05, 1);
    } else if (w.activeEnergyKcal !== undefined && mins > 0) {
      // No HR on this workout: approximate intensity from kcal/min (~12 kcal/min ≈ hard).
      frac = clamp(w.activeEnergyKcal / mins / 12, 0.05, 1);
    } else {
      frac = 0.4; // duration only — assume easy-moderate
    }
    load += mins * frac;
  }
  // Non-workout movement contributes a little (10k steps ≈ 10 load).
  if (day.steps) load += day.steps / 1000;
  return load;
}

export function computeExertion(store: HealthStore, date: string): ExertionResult | undefined {
  const day = store.days[date];
  if (!day) return undefined;
  const hrMax = estimateHrMax(store);
  const hrRest = estimateHrRest(store, date);

  const load = dayLoad(day, hrMax, hrRest);
  const historyLoads = previousDays(store, date)
    .map((d) => dayLoad(d, hrMax, hrRest))
    .filter((l) => l > 0)
    .sort((a, b) => a - b);

  // Scale so a typical hard day (75th percentile) lands around 7/10.
  let p75 = 60; // sensible default until there's history
  if (historyLoads.length >= MIN_BASELINE_SAMPLES) {
    p75 = historyLoads[Math.min(historyLoads.length - 1, Math.floor(historyLoads.length * 0.75))];
  }
  const score = round(clamp((load / Math.max(p75, 10)) * 7, 0, 10), 1);

  const result: ExertionResult = {
    score,
    trainingLoad: round(load, 1),
    loadBaseline: round(p75, 1),
  };

  const recovery = computeRecovery(store, date);
  if (recovery) {
    // Athlytic-style guidance: the readier you are, the harder you may go.
    const center = recovery.score / 10;
    result.targetRange = {
      low: round(clamp(center - 2, 0, 8), 1),
      high: round(clamp(center + 0.5, 2, 10), 1),
    };
  }
  return result;
}

export interface TrendPoint {
  date: string;
  recovery?: number;
  exertion?: number;
  trainingLoad?: number;
  hrvMs?: number;
  restingHeartRate?: number;
  sleepHours?: number;
  steps?: number;
  activeEnergyKcal?: number;
  workouts: number;
}

export function computeTrend(store: HealthStore, days: number): TrendPoint[] {
  const dates = sortedDates(store).slice(-days);
  return dates.map((date) => {
    const d = store.days[date];
    const recovery = computeRecovery(store, date);
    const exertion = computeExertion(store, date);
    const point: TrendPoint = { date, workouts: d.workouts.length };
    if (recovery) point.recovery = recovery.score;
    if (exertion) {
      point.exertion = exertion.score;
      point.trainingLoad = exertion.trainingLoad;
    }
    if (d.hrvMs !== undefined) point.hrvMs = d.hrvMs;
    if (d.restingHeartRate !== undefined) point.restingHeartRate = d.restingHeartRate;
    if (d.sleep?.totalSleepHours !== undefined) point.sleepHours = d.sleep.totalSleepHours;
    if (d.steps !== undefined) point.steps = d.steps;
    if (d.activeEnergyKcal !== undefined) point.activeEnergyKcal = d.activeEnergyKcal;
    return point;
  });
}
