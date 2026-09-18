/**
 * Types for the Apple Health → Claude connector.
 *
 * Apple Health has no cloud API — HealthKit data lives on the phone.
 * This connector ingests Apple Health data pushed off the phone by the
 * Health Auto Export iOS app (or uploaded manually) and serves it to
 * Claude over MCP, including recovery/exertion estimates computed from it.
 */

/** A lap, pause or segment inside a workout — the shape of the session. */
export interface WorkoutSegment {
  type: string; // lap | pause | resume | segment | marker | motionPaused | …
  start: string;
  end?: string;
  durationSec?: number;
}

/** A single workout session, normalized from Health Auto Export. */
export interface WorkoutRecord {
  id?: string;
  name: string;
  start: string; // ISO-ish local timestamp as sent by the phone
  end?: string;
  durationMin?: number;
  activeEnergyKcal?: number;
  distanceKm?: number;
  avgHeartRate?: number;
  maxHeartRate?: number;
  elevationUpM?: number;
  /**
   * A workout is one sample, so unlike a daily total it really does belong to
   * one device and one place: who recorded it, on what, and the timezone it
   * happened in.
   */
  source?: string;
  device?: string;
  timeZone?: string;
  segments?: WorkoutSegment[];
}

/**
 * Something the watch raised on its own — a high or low heart rate, or an
 * irregular rhythm. Rare and individually meaningful, so each keeps its own
 * timestamp instead of being folded into a daily number.
 */
export interface HeartEventRecord {
  type: string; // high_heart_rate | low_heart_rate | irregular_heart_rhythm
  id?: string;
  start: string;
  end?: string;
  source?: string;
  device?: string;
  timeZone?: string;
  /** The rate the watch was watching for; without it "high" is a word, not a number. */
  thresholdBpm?: number;
}

/** One night of sleep, normalized. All durations are in hours. */
export interface SleepRecord {
  totalSleepHours?: number;
  inBedHours?: number;
  coreHours?: number;
  deepHours?: number;
  remHours?: number;
  awakeHours?: number;
  sleepStart?: string;
  sleepEnd?: string;
  /**
   * Bundle identifier of the device whose account of this night was used
   * (e.g. "com.apple.health.<uuid>" for the watch). Nights are never summed
   * across devices — one is chosen — and this says which.
   */
  source?: string;
  /** Every device that recorded this night, when more than one did. */
  sources?: string[];
  /**
   * Why this night's numbers don't add up, if they don't — e.g. stages summing
   * to more hours than lie between sleepStart and sleepEnd. A night with this
   * set is not trustworthy, and anything reading it should say so rather than
   * quietly averaging it in.
   */
  suspect?: string[];
}

/** Everything known about one calendar day. */
export interface DayRecord {
  date: string; // YYYY-MM-DD (device-local)
  hrvMs?: number; // heart rate variability (SDNN), daily average
  restingHeartRate?: number; // bpm
  heartRateMin?: number;
  heartRateAvg?: number;
  heartRateMax?: number;
  respiratoryRate?: number; // breaths/min
  bloodOxygenPct?: number;
  vo2Max?: number;
  wristTemperatureC?: number;
  activeEnergyKcal?: number;
  steps?: number;
  sleep?: SleepRecord;
  workouts: WorkoutRecord[];
  /** Watch-raised heart events on this day, if any. */
  heartEvents?: HeartEventRecord[];
  /** Any other daily-aggregated metrics we don't model explicitly, keyed by normalized name. */
  other: { [metric: string]: number };
}

export interface HealthStore {
  version: 1;
  /** ISO timestamp of the last successful ingest. */
  updatedAt?: string;
  lastIngestSource?: string;
  days: { [date: string]: DayRecord };
  /** Units per metric as last reported by the phone (e.g. { flights_climbed: "count" }). */
  units?: { [metric: string]: string };
  /**
   * Device behind each metric, where there is one — the bundle identifier the
   * phone reported alongside it. Only metrics for which Vital deliberately
   * picked one device (sleep, HRV) carry this; a figure HealthKit aggregated
   * across every source is absent here rather than attributed to a guess.
   */
  sources?: { [metric: string]: string };
}

/** Result summary returned to the ingest caller (shown in Health Auto Export). */
export interface IngestSummary {
  daysTouched: number;
  dataPoints: number;
  workoutsAdded: number;
  metricsSeen: string[];
  firstDate?: string;
  lastDate?: string;
}
