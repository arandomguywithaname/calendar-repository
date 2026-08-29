import * as fs from "fs";
import * as path from "path";
import { HealthStore } from "./types";

/**
 * Where health data lives. A plain JSON file keeps the whole stack
 * dependency-free and easy to back up. Override with DATA_DIR
 * (e.g. a mounted Fly.io volume) so data survives redeploys.
 */
export function dataDir(): string {
  return process.env.DATA_DIR || path.resolve(__dirname, "../../data");
}

export function storePath(): string {
  return path.join(dataDir(), "apple-health.json");
}

/** Pre-rename data file; read as a fallback so existing data keeps working. */
function legacyStorePath(): string {
  return path.join(dataDir(), "athlytic-health.json");
}

export function emptyStore(): HealthStore {
  return { version: 1, days: {} };
}

export function loadStore(): HealthStore {
  let p = storePath();
  if (!fs.existsSync(p)) {
    p = legacyStorePath();
    if (!fs.existsSync(p)) return emptyStore();
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(p, "utf-8")) as HealthStore;
    if (!parsed || typeof parsed !== "object" || !parsed.days) return emptyStore();
    return parsed;
  } catch (err) {
    console.error(`Failed to read ${p}, starting empty:`, err);
    return emptyStore();
  }
}

/** Atomic write (temp file + rename) so a crash mid-write can't corrupt the data. */
export function saveStore(store: HealthStore): void {
  const p = storePath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(store, null, 1), "utf-8");
  fs.renameSync(tmp, p);
}

/** Dates present in the store, ascending. */
export function sortedDates(store: HealthStore): string[] {
  return Object.keys(store.days).sort();
}
