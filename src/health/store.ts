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

/** Each family member gets their own file; no slug = the original "default" user. */
export function storePath(userSlug?: string): string {
  if (userSlug) return path.join(dataDir(), "users", `${userSlug}.json`);
  return path.join(dataDir(), "apple-health.json");
}

/** Pre-rename data file; read as a fallback so existing data keeps working. */
function legacyStorePath(): string {
  return path.join(dataDir(), "athlytic-health.json");
}

export function emptyStore(): HealthStore {
  return { version: 1, days: {} };
}

export function loadStore(userSlug?: string): HealthStore {
  let p = storePath(userSlug);
  if (!fs.existsSync(p)) {
    if (userSlug) return emptyStore();
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
export function saveStore(store: HealthStore, userSlug?: string): void {
  const p = storePath(userSlug);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(store, null, 1), "utf-8");
  fs.renameSync(tmp, p);
}

/** How many family members have their own store (excludes the default user). */
export function userStoreCount(): number {
  const dir = path.join(dataDir(), "users");
  if (!fs.existsSync(dir)) return 0;
  return fs.readdirSync(dir).filter((f) => f.endsWith(".json")).length;
}

/**
 * Aggregate state of the per-person stores, for the public status page.
 * Counts only — no names and no health values, because /health needs no
 * password and listing who signed up would leak that.
 */
export function userStoreStats(): { connected: number; withData: number; lastSync: string | null } {
  const dir = path.join(dataDir(), "users");
  if (!fs.existsSync(dir)) return { connected: 0, withData: 0, lastSync: null };
  let connected = 0;
  let withData = 0;
  let lastSync: string | null = null;
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith(".json")) continue;
    connected++;
    const store = loadStore(file.slice(0, -".json".length));
    if (Object.keys(store.days).length > 0) withData++;
    if (store.updatedAt && (!lastSync || store.updatedAt > lastSync)) lastSync = store.updatedAt;
  }
  return { connected, withData, lastSync };
}

/** Dates present in the store, ascending. */
export function sortedDates(store: HealthStore): string[] {
  return Object.keys(store.days).sort();
}
