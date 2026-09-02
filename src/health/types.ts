/**
 * Types for the Apple Health → Claude connector.
 *
 * Apple Health has no cloud API — HealthKit data lives on the phone.
 * This connector ingests Apple Health data pushed off the phone by the
 * Health Auto Export iOS app (or uploaded manually) and serves it to
 * Claude over MCP, including recovery/exertion estimates computed from it.
 */

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
