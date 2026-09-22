import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { loadStore, saveStore, sortedDates, storePath } from "./store";
import { parseStamp } from "./ingest";
import { computeExertion, computeRecovery, computeTrend } from "./metrics";
import { DayRecord, DrinkRecord, HealthStore, HeartRatePoint, WorkoutRecord } from "./types";
import { HealthUser } from "./users";

/**
 * The MCP server Claude connects to (the Apple Health connector).
 * Each tool reloads the store from disk so freshly-synced data from the
 * phone is visible immediately without restarting anything.
 */

const ESTIMATE_NOTE =
  "Recovery/exertion are estimates computed from this person's Apple Health data " +
  "(HRV vs personal baseline, resting HR, sleep, heart-rate training load) — " +
  "similar in spirit to fitness apps' readiness scores, not values from any app.";

function json(result: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
}

function noData(slug?: string) {
  return json({
    error: "No health data has been synced yet.",
    howToFix:
      "Send data from the phone with the Vital app (paste this person's connection link in its settings), " +
      "or with Health Auto Export, or run `npm run demo` on the computer. See APPLE_HEALTH.md in the repository.",
    dataFile: storePath(slug),
  });
}

function latestDate(dates: string[]): string | undefined {
  return dates.length ? dates[dates.length - 1] : undefined;
}

/** Every calendar date in the N-day window ending at `end`, gaps included. */
function calendarWindow(end: string, days: number): string[] {
  const [y, m, d] = end.split("-").map(Number);
  const base = Date.UTC(y, m - 1, d);
  const out: string[] = [];
  for (let i = days - 1; i >= 0; i--) out.push(new Date(base - i * 86400000).toISOString().slice(0, 10));
  return out;
}

/**
 * A day the person is still living. Totals for it are partial by definition, and
 * reporting today's recovery as though the day were over is how a lunchtime sync
 * gets read as a full day's verdict.
 */
export function isPartial(store: HealthStore, date: string): boolean {
  // Deliberately not "is this today?" — the server has no idea what day it is
  // where the person lives. Comparing a stored date against the server's own
  // UTC date gets it wrong by a day for anyone west of Greenwich, who syncs in
  // their evening and lands on the next UTC day. The timezone-free truth is
  // that a sync can only ever capture the day it ran up to the moment it ran,
  // so the most recent day on record is the one that may still be incomplete.
  const dates = sortedDates(store);
  return dates.length > 0 && date === dates[dates.length - 1];
}

/** How fresh the data is. Every answer carries this, because the alternative is
 *  a four-day-old snapshot read back as though it were this morning. */
export function freshness(store: HealthStore) {
  const lastSync = store.updatedAt;
  if (!lastSync) return { dataAsOf: null };
  const ageHours = (Date.now() - Date.parse(lastSync)) / 3600000;
  if (!Number.isFinite(ageHours)) return { dataAsOf: lastSync };
  const out: Record<string, unknown> = { dataAsOf: lastSync, syncedHoursAgo: Math.round(ageHours) };
  if (ageHours >= 24) {
    out.staleNote =
      `The phone last synced ${Math.floor(ageHours / 24)} day(s) ago, so nothing below reflects ` +
      "anything since then. Say so rather than presenting it as current.";
  }
  return out;
}

/** Dates in the window with nothing stored — the difference between "did not
 *  sleep" and "wore nothing to bed", which a caller cannot otherwise tell. */
function missingIn(store: HealthStore, window: string[]): string[] {
  return window.filter((d) => !store.days[d]);
}

/**
 * Why there is no recovery score. The default answer blames missing baselines,
 * which is usually right but is a lie on a day whose one usable signal — the
 * night's sleep — was thrown out for not adding up. Saying "insufficient
 * history" there sends the reader looking for the wrong problem.
 */
export function noRecoveryReason(day: DayRecord): string {
  const suspect = day.sleep?.suspect?.[0];
  if (suspect) {
    return `no score: this day's sleep was set aside (${suspect}), and there was nothing else to go on`;
  }
  return "insufficient data (needs ~5 prior days of HRV/resting-HR history for baselines)";
}

function daySummary(slug: string | undefined, dateArg?: string) {
  const store = loadStore(slug);
  const dates = sortedDates(store);
  const date = dateArg ?? latestDate(dates);
  if (!date) return noData(slug);
  const day = store.days[date];
  if (!day) {
    return json({
      error: `No data stored for ${date}.`,
      availableRange: { first: dates[0], last: latestDate(dates) },
    });
  }
  const recovery = computeRecovery(store, date);
  const exertion = computeExertion(store, date);
  const partial = isPartial(store, date);
  return json({
    ...freshness(store),
    date,
    partial,
    ...(partial
      ? { partialNote: "This day is still in progress — totals and scores below cover only what has been synced so far." }
      : {}),
    note: ESTIMATE_NOTE,
    recovery: recovery ?? noRecoveryReason(day),
    exertion: exertion ?? "insufficient data",
    sleep: day.sleep ? withoutCurve(day.sleep) : null,
    vitals: {
      hrvMs: day.hrvMs ?? null,
      restingHeartRate: day.restingHeartRate ?? null,
      heartRate: { min: day.heartRateMin ?? null, avg: day.heartRateAvg ?? null, max: day.heartRateMax ?? null },
      respiratoryRate: day.respiratoryRate ?? null,
      bloodOxygenPct: day.bloodOxygenPct ?? null,
      wristTemperatureC: day.wristTemperatureC ?? null,
      vo2Max: day.vo2Max ?? null,
    },
    activity: {
      steps: day.steps ?? null,
      activeEnergyKcal: day.activeEnergyKcal ?? null,
      workouts: day.workouts.map(withoutCurve),
    },
    // Everything else synced for this day — body composition, basal energy,
    // flights, exercise minutes, running form and so on. Without this they
    // would only be reachable one at a time through get_raw_metric, so a
    // question like "how was my day" would silently miss most of what was
    // measured.
    ...(Object.keys(day.other).length > 0 ? { otherMetrics: day.other } : {}),
    // Rare enough that listing them costs nothing and omitting one matters.
    ...(day.heartEvents?.length ? { heartEvents: day.heartEvents } : {}),
    // A handful of entries at most, and the thing most likely to explain a bad
    // night sitting directly above it. Anything still showing kind: null was
    // tapped but never described — ask what it was rather than assuming.
    ...(day.drinks?.length
      ? {
          drinks: {
            total: Math.round(day.drinks.reduce((sum, d) => sum + d.count, 0) * 100) / 100,
            items: day.drinks.map((drink) => briefDrink({ date, drink })),
          },
        }
      : {}),
  });
}

/**
 * The same record with its heart-rate curve taken out, and a count left in its
 * place.
 *
 * A workout's curve is a couple of hundred points. Left in, it would ride along
 * in every daily summary, every workout listing and every sleep query — turning
 * "how did I sleep" into thousands of tokens of numbers nobody asked to see,
 * and crowding out the answer. The count is there so the curve is discoverable:
 * something has to say it exists, or get_heart_rate_curve would only ever be
 * called by someone who already knew.
 */
export function withoutCurve<T extends { heartRateSeries?: HeartRatePoint[] }>(record: T) {
  const { heartRateSeries, ...rest } = record;
  if (!heartRateSeries?.length) return rest;
  return { ...rest, heartRateCurvePoints: heartRateSeries.length };
}

/**
 * How much of the window this metric actually covers.
 *
 * Handing back only the days that hold a value reads as a series of zeros:
 * four drinks logged in a month looks like twenty-six sober days, when it may
 * be twenty-six days nobody wrote anything down. For anything a person enters
 * by hand that distinction decides the answer, so the gap is stated rather
 * than left to be inferred from a short list.
 */
export function coverage(
  name: string,
  dates: string[],
  values: { date: string; value: number }[]
) {
  const found = new Set(values.map((v) => v.date));
  const missing = dates.filter((d) => !found.has(d));
  if (missing.length === 0) {
    return { daysInWindow: dates.length, daysWithValue: values.length, daysWithoutValue: 0 };
  }
  return {
    daysInWindow: dates.length,
    daysWithValue: values.length,
    daysWithoutValue: missing.length,
    // Listed while short enough to read; a count alone otherwise, because a
    // year of gaps is not something to print into an answer.
    ...(missing.length <= 31 ? { datesWithoutValue: missing } : {}),
    missingNote:
      `${missing.length} of these ${dates.length} days hold other health data but no '${name}'. ` +
      "That means it was not recorded, which is not the same as zero — especially for a metric a " +
      "person enters by hand.",
  };
}

/**
 * Grams of pure alcohol in a serving. Ethanol is 0.789 g/ml, so this is
 * arithmetic on two numbers the person actually gave — it is computed only
 * when both are present, and nothing here ever decides what "a beer" holds or
 * how strong it is. An average stood in for a real glass is exactly what this
 * whole path exists to avoid.
 */
export function alcoholGrams(volumeMl: number, abvPct: number): number {
  return Math.round(volumeMl * (abvPct / 100) * 0.789 * 10) / 10;
}

/**
 * Every drink on record, newest first. Each entry still points at the record
 * inside the store, so writing a type here writes it there.
 */
export function collectDrinks(store: HealthStore): { date: string; drink: DrinkRecord }[] {
  const out: { date: string; drink: DrinkRecord }[] = [];
  for (const date of sortedDates(store)) {
    for (const drink of store.days[date].drinks ?? []) out.push({ date, drink });
  }
  // By real instant, not by string: the timestamps carry their UTC offset, and
  // one logged abroad would sort into the wrong place read as text.
  out.sort((a, b) => (parseStamp(b.drink.at) ?? 0) - (parseStamp(a.drink.at) ?? 0));
  return out;
}

function briefDrink(entry: { date: string; drink: DrinkRecord }) {
  const d = entry.drink;
  return {
    id: d.id ?? null,
    date: entry.date,
    at: d.at,
    count: d.count,
    kind: d.kind ?? null,
    ...(d.volumeMl !== undefined ? { volumeMl: d.volumeMl } : {}),
    ...(d.abvPct !== undefined ? { abvPct: d.abvPct } : {}),
    ...(d.alcoholGrams !== undefined ? { alcoholGrams: d.alcoholGrams } : {}),
    ...(d.note ? { note: d.note } : {}),
  };
}

export interface DrinkLabel {
  kind: string;
  volumeMl?: number;
  abvPct?: number;
  note?: string;
}

const NOTHING_LOGGED =
  "The drink has to be tapped on the phone first: the 'Had a drink' button in Vital writes it to Apple " +
  "Health, and the phone sends it a few seconds later. If it was only just tapped, the sync may not have " +
  "landed yet.";

/**
 * Record what a drink was.
 *
 * The button deliberately asks nothing — one tap, one drink — because that is
 * the only thing someone with a glass in their hand will reliably do. The kind
 * is added here afterwards, in conversation, where saying "that was a beer, a
 * half litre" costs nothing.
 *
 * With no id it takes the most recent drinks that have no type yet, which is
 * what "that was a beer" means straight after tapping. It will not silently
 * overwrite a drink that already has one: changing an answer takes that
 * drink's id, so a second remark about tonight cannot rewrite last night.
 */
export function applyDrinkLabel(
  store: HealthStore,
  label: DrinkLabel,
  target: { id?: string; howMany?: number },
  now: string
) {
  const all = collectDrinks(store);
  if (all.length === 0) {
    return { ok: false as const, error: "No drinks have been recorded.", howToFix: NOTHING_LOGGED, drinks: [] };
  }

  let targets: { date: string; drink: DrinkRecord }[];
  if (target.id) {
    const one = all.find((e) => e.drink.id === target.id || e.drink.at === target.id);
    if (!one) {
      return {
        ok: false as const,
        error: `No recorded drink matches '${target.id}'.`,
        howToFix: "Call get_drinks and pass one of the ids it returns.",
        drinks: all.slice(0, 10).map(briefDrink),
      };
    }
    targets = [one];
  } else {
    const untyped = all.filter((e) => !e.drink.kind);
    if (untyped.length === 0) {
      return {
        ok: false as const,
        error: "Every drink on record already has a type, so there is nothing this would apply to.",
        howToFix:
          "If this is a correction, call get_drinks and pass the id of the drink to change. If it is a new " +
          "drink, it has to be tapped on the phone first — this tool describes drinks, it does not add them.",
        drinks: all.slice(0, 10).map(briefDrink),
      };
    }
    targets = untyped.slice(0, Math.max(1, Math.min(target.howMany ?? 1, untyped.length)));
  }

  for (const { drink } of targets) {
    // Each call states the whole thing, so an earlier volume or strength is
    // dropped rather than left attached to a different drink's name.
    drink.kind = label.kind.trim();
    delete drink.volumeMl;
    delete drink.abvPct;
    delete drink.alcoholGrams;
    delete drink.note;
    if (label.volumeMl !== undefined) drink.volumeMl = label.volumeMl;
    if (label.abvPct !== undefined) drink.abvPct = label.abvPct;
    if (label.volumeMl !== undefined && label.abvPct !== undefined) {
      drink.alcoholGrams = alcoholGrams(label.volumeMl, label.abvPct);
    }
    if (label.note) drink.note = label.note;
    drink.labelledAt = now;
  }

  return {
    ok: true as const,
    labelled: targets.map(briefDrink),
    stillWithoutAType: all.filter((e) => !e.drink.kind).length,
  };
}

type ToolResult = { content: { type: "text"; text: string }[] };

// server.registerTool's generic inference overflows TypeScript's instantiation
// budget (TS2589) with this SDK+zod pairing, so registrations go through this
// loosely-typed wrapper. Runtime behavior is identical; the zod schemas still
// validate input and are still advertised to Claude, and each handler types its
// own arguments explicitly.
function addTool(
  server: McpServer,
  name: string,
  config: { title: string; description: string; inputSchema: z.ZodRawShape },
  handler: (args: any) => Promise<ToolResult>
): void {
  (server.registerTool as (n: string, c: unknown, h: unknown) => unknown)(name, config, handler);
}

const dailySummaryInput: z.ZodRawShape = {
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
    .describe("Day to summarize, YYYY-MM-DD. Omit for the latest day with data."),
};
const trendsInput: z.ZodRawShape = {
  days: z.number().int().min(2).max(365).optional()
    .describe("How many days back to include (default 14)."),
};
const workoutsInput: z.ZodRawShape = {
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Earliest day, YYYY-MM-DD (inclusive)."),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Latest day, YYYY-MM-DD (inclusive)."),
  limit: z.number().int().min(1).max(200).optional().describe("Max workouts to return (default 20)."),
};
const sleepInput: z.ZodRawShape = {
  days: z.number().int().min(1).max(90).optional().describe("How many nights back (default 7)."),
};
const heartRateCurveInput: z.ZodRawShape = {
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
    .describe("Day to read, YYYY-MM-DD. Omit for the latest day with data."),
  which: z.enum(["all", "sleep", "workouts"]).optional()
    .describe("Which curves to return (default all). Each is a few hundred points."),
};
const drinksInput: z.ZodRawShape = {
  days: z.number().int().min(1).max(365).optional().describe("How many days back to list (default 30)."),
};
const setDrinkTypeInput: z.ZodRawShape = {
  kind: z.string().min(1).max(60)
    .describe("What it was, in the person's own words: 'beer', 'champagne', 'red wine', 'whisky'."),
  id: z.string().optional()
    .describe(
      "The drink to describe, from get_drinks. Omit to take the most recent drink(s) that have no type yet — " +
      "which is what 'that was a beer' means right after tapping. Required to change a drink already described."
    ),
  howMany: z.number().int().min(1).max(20).optional()
    .describe("Apply to this many of the most recent untyped drinks (default 1). Ignored when id is given."),
  volumeMl: z.number().min(1).max(5000).optional()
    .describe("Serving size in ml — ONLY if the person said it. Never fill in a typical size."),
  abvPct: z.number().min(0).max(100).optional()
    .describe("Strength in percent — ONLY if the person said it. Never fill in a typical strength."),
  note: z.string().max(280).optional().describe("Anything else worth keeping, e.g. 'with dinner'."),
};
const rawMetricInput: z.ZodRawShape = {
  name: z.string().describe("Metric name, e.g. 'hrvMs' or an 'other' key like 'flights_climbed'."),
  days: z.number().int().min(1).max(365).optional().describe("How many days back (default 30)."),
};

export function buildHealthMcpServer(user?: HealthUser): McpServer {
  const slug = user?.slug;
  const whose = user ? `${user.name}'s` : "one person's";
  const server = new McpServer(
    { name: "apple-health", version: "1.0.0" },
    {
      instructions:
        `${whose.charAt(0).toUpperCase() + whose.slice(1)} Apple Health data: sleep, heart metrics, workouts, activity, ` +
        "and any other synced HealthKit metrics, plus drinks logged by tapping a button on the phone, plus " +
        "recovery/exertion estimates computed from them (Apple Health " +
        "has no cloud API, so the phone pushes this data to the server). Dates are YYYY-MM-DD in the user's local " +
        "time. Start with get_data_status if unsure what's available.",
    }
  );

  addTool(
    server,
    "get_data_status",
    {
      title: "Data status",
      description:
        "Overview of what health data is stored: date range, days of data, last sync time, and which metrics are present. " +
        "Call this first if a query returns no data or you need to know coverage.",
      inputSchema: {},
    },
    async () => {
      const store = loadStore(slug);
      const dates = sortedDates(store);
      if (dates.length === 0) return noData(slug);
      const counts: Record<string, number> = {};
      const bump = (k: string) => (counts[k] = (counts[k] || 0) + 1);
      let workouts = 0;
      let heartEvents = 0;
      let drinks = 0;
      let drinksWithoutAType = 0;
      for (const d of dates) {
        const day = store.days[d];
        if (day.hrvMs !== undefined) bump("hrv");
        if (day.restingHeartRate !== undefined) bump("restingHeartRate");
        if (day.sleep?.totalSleepHours !== undefined) bump("sleep");
        if (day.steps !== undefined) bump("steps");
        if (day.activeEnergyKcal !== undefined) bump("activeEnergy");
        if (day.respiratoryRate !== undefined) bump("respiratoryRate");
        if (day.vo2Max !== undefined) bump("vo2Max");
        workouts += day.workouts.length;
        heartEvents += day.heartEvents?.length ?? 0;
        for (const drink of day.drinks ?? []) {
          drinks += drink.count;
          if (!drink.kind) drinksWithoutAType++;
        }
        if (day.sleep?.heartRateSeries?.length || day.workouts.some((w) => w.heartRateSeries?.length)) {
          bump("heartRateCurve");
        }
        for (const k of Object.keys(day.other)) bump(`other:${k}`);
      }
      return json({
        daysStored: dates.length,
        firstDate: dates[0],
        lastDate: latestDate(dates),
        lastSync: store.updatedAt ?? null,
        totalWorkouts: workouts,
        totalHeartEvents: heartEvents,
        totalDrinks: Math.round(drinks * 100) / 100,
        drinksWithoutAType,
        daysWithMetric: counts,
        metricUnits: store.units ?? {},
        // Only metrics where one device was deliberately chosen over another
        // appear here. A metric HealthKit aggregated across every source is
        // absent rather than credited to one of them.
        metricSources: store.sources ?? {},
        note: ESTIMATE_NOTE,
      });
    }
  );

  addTool(
    server,
    "get_daily_summary",
    {
      title: "Daily summary",
      description:
        "Full picture for one day: recovery score (0-100) with its HRV/resting-HR/sleep components and personal baselines, " +
        "exertion score (0-10) with target range, sleep breakdown, vitals, steps, energy, and workouts. " +
        "Defaults to the most recent day with data. Use this for questions like 'how recovered am I today?'.",
      inputSchema: dailySummaryInput,
    },
    async ({ date }: { date?: string }) => daySummary(slug, date)
  );

  addTool(
    server,
    "get_trends",
    {
      title: "Trends",
      description:
        "Day-by-day series over the last N days: recovery, exertion, training load, HRV, resting HR, sleep hours, steps, " +
        "active energy, workout count. Use for 'how has my week/month looked?' and spotting patterns.",
      inputSchema: trendsInput,
    },
    async ({ days }: { days?: number }) => {
      const store = loadStore(slug);
      const stored = sortedDates(store);
      if (stored.length === 0) return noData(slug);
      const span = days ?? 14;
      const last = latestDate(stored)!;
      const window = calendarWindow(last, span);
      const missingDates = missingIn(store, window);
      return json({
        ...freshness(store),
        note: ESTIMATE_NOTE,
        requestedDays: span,
        window: { first: window[0], last: window[window.length - 1] },
        daysWithData: span - missingDates.length,
        missingDates,
        partialDates: window.filter((d) => store.days[d] && isPartial(store, d)),
        days: computeTrend(store, span),
      });
    }
  );

  addTool(
    server,
    "get_workouts",
    {
      title: "Workouts",
      description:
        "List workouts (type, start, duration, distance, calories, avg/max heart rate), most recent first. " +
        "Optionally filter by date range.",
      inputSchema: workoutsInput,
    },
    async ({ start, end, limit }: { start?: string; end?: string; limit?: number }) => {
      const store = loadStore(slug);
      const dates = sortedDates(store);
      if (dates.length === 0) return noData(slug);
      const all: (WorkoutRecord & { date: string })[] = [];
      for (const date of dates) {
        if (start && date < start) continue;
        if (end && date > end) continue;
        for (const w of store.days[date].workouts) all.push({ date, ...withoutCurve(w) });
      }
      all.sort((a, b) => (a.start < b.start ? 1 : -1));
      return json({ ...freshness(store), totalMatching: all.length, workouts: all.slice(0, limit ?? 20) });
    }
  );

  addTool(
    server,
    "get_sleep",
    {
      title: "Sleep",
      description:
        "Sleep for the last N nights: total, in-bed, core/deep/REM/awake hours and bed/wake times, plus the average.",
      inputSchema: sleepInput,
    },
    async ({ days }: { days?: number }) => {
      const store = loadStore(slug);
      const stored = sortedDates(store);
      if (stored.length === 0) return noData(slug);
      const span = days ?? 7;
      const window = calendarWindow(latestDate(stored)!, span);
      const nights = window
        .filter((d) => store.days[d]?.sleep)
        .map((d) => ({ date: d, ...withoutCurve(store.days[d].sleep!) }));
      // Nights whose own numbers contradict each other are listed but kept out
      // of the average: an average over broken values is broken to two decimals.
      const sound = nights.filter((n) => !(n.suspect && n.suspect.length));
      const totals = sound.map((n) => n.totalSleepHours).filter((v): v is number => v !== undefined);
      const avg = totals.length ? Math.round((totals.reduce((a, b) => a + b, 0) / totals.length) * 100) / 100 : null;
      return json({
        ...freshness(store),
        requestedNights: span,
        window: { first: window[0], last: window[window.length - 1] },
        nightsFound: nights.length,
        nightsWithoutData: window.filter((d) => !store.days[d]?.sleep),
        suspectNights: nights.filter((n) => n.suspect && n.suspect.length).map((n) => n.date),
        averageSleepHours: avg,
        averagedOver: totals.length,
        nights,
      });
    }
  );

  addTool(
    server,
    "get_heart_rate_curve",
    {
      title: "Heart rate curve",
      description:
        "Heart rate through one day's workouts and night's sleep as a series of points — one per minute inside a " +
        "workout, one per five minutes across a night. Use it for the shape rather than the totals: where the peaks " +
        "were, how fast it came down afterwards, how deep the overnight dip went and when. Kept out of the other " +
        "tools' answers because each curve is a few hundred numbers; they report heartRateCurvePoints where one " +
        "exists. Only roughly the last two weeks carry curves.",
      inputSchema: heartRateCurveInput,
    },
    async ({ date, which }: { date?: string; which?: "all" | "sleep" | "workouts" }) => {
      const store = loadStore(slug);
      const dates = sortedDates(store);
      const day = date ?? latestDate(dates);
      if (!day) return noData(slug);
      const record = store.days[day];
      if (!record) {
        return json({
          error: `No data stored for ${day}.`,
          availableRange: { first: dates[0], last: latestDate(dates) },
        });
      }
      const want = which ?? "all";
      const sleepCurve = want === "workouts" ? undefined : record.sleep?.heartRateSeries;
      const workouts =
        want === "sleep"
          ? []
          : record.workouts
              .filter((w) => w.heartRateSeries?.length)
              .map((w) => ({
                id: w.id ?? null,
                name: w.name,
                start: w.start,
                bucketMinutes: 1,
                points: w.heartRateSeries,
              }));
      const empty = !sleepCurve?.length && workouts.length === 0;
      return json({
        ...freshness(store),
        date: day,
        // Say why it is empty rather than returning a bare pair of nulls, which
        // reads as "your heart stopped" instead of "nothing was recorded".
        ...(empty
          ? {
              note:
                "No heart-rate curve stored for this day. Curves are kept only for roughly the last two weeks, and " +
                "only where a watch recorded heart rate during sleep or a workout.",
            }
          : {}),
        sleep: sleepCurve?.length ? { bucketMinutes: 5, points: sleepCurve } : null,
        workouts,
      });
    }
  );

  addTool(
    server,
    "get_drinks",
    {
      title: "Drinks",
      description:
        "Every drink logged on the phone over the last N days: when it was, and what it was if that has been " +
        "said. The phone records only the tap — one tap, one drink, no type — so entries with kind: null are " +
        "drinks nobody has described yet. Use set_drink_type to fill those in. A day with no entries means " +
        "nothing was logged, which is not the same as nothing drunk: the button only records what someone " +
        "pressed it for.",
      inputSchema: drinksInput,
    },
    async ({ days }: { days?: number }) => {
      const store = loadStore(slug);
      const stored = sortedDates(store);
      if (stored.length === 0) return noData(slug);
      const window = calendarWindow(latestDate(stored)!, days ?? 30);
      const first = window[0];
      const last = window[window.length - 1];
      const inWindow = collectDrinks(store).filter((e) => e.date >= first && e.date <= last);
      const byDate: Record<string, number> = {};
      for (const e of inWindow) byDate[e.date] = Math.round((byDate[e.date] ?? 0) * 100 + e.drink.count * 100) / 100;
      const untyped = inWindow.filter((e) => !e.drink.kind);
      return json({
        ...freshness(store),
        window: { first, last },
        totalDrinks: Math.round(inWindow.reduce((sum, e) => sum + e.drink.count, 0) * 100) / 100,
        daysWithADrink: Object.keys(byDate).length,
        perDay: byDate,
        withoutAType: untyped.length,
        ...(untyped.length > 0
          ? {
              askNote:
                `${untyped.length} of these were tapped but never described. If it matters to the answer, ask ` +
                "what they were and record it with set_drink_type rather than guessing.",
            }
          : {}),
        drinks: inWindow.map(briefDrink),
      });
    }
  );

  addTool(
    server,
    "set_drink_type",
    {
      title: "Set what a drink was",
      description:
        "Record what a logged drink actually was. The button on the phone deliberately asks nothing — one tap, " +
        "one drink — so the type is added here afterwards: 'that was a beer', 'the last two were champagne'. " +
        "With no id it describes the most recent drink(s) that have no type yet, so it can be called straight " +
        "after someone says what they had.\n\n" +
        "Record only what the person actually said. Do NOT fill in a typical volume, strength or calorie " +
        "figure for a kind of drink — a made-up number for an 'average beer' is worse than no number, because " +
        "it reads back later as though it were measured. Pass volumeMl and abvPct only when they were stated, " +
        "and grams of alcohol are then computed from them. Each call states the whole thing: passing kind " +
        "alone clears any volume or strength recorded for that drink before.\n\n" +
        "This describes drinks; it does not add them. A drink that was never tapped on the phone is not here.",
      inputSchema: setDrinkTypeInput,
    },
    async (args: DrinkLabel & { id?: string; howMany?: number }) => {
      const store = loadStore(slug);
      const result = applyDrinkLabel(
        store,
        { kind: args.kind, volumeMl: args.volumeMl, abvPct: args.abvPct, note: args.note },
        { id: args.id, howMany: args.howMany },
        new Date().toISOString()
      );
      if (!result.ok) return json(result);
      // The only write this server makes. Load, change and save run with no
      // await between them, so an ingest arriving from the phone cannot
      // interleave and be lost — Node gives that for free here, and it would
      // stop being true the moment an await appeared in the middle.
      saveStore(store, slug);
      return json(result);
    }
  );

  addTool(
    server,
    "get_raw_metric",
    {
      title: "Raw metric",
      description:
        "Daily values for one stored metric over the last N days. Valid names: hrvMs, restingHeartRate, heartRateAvg, " +
        "heartRateMax, respiratoryRate, bloodOxygenPct, vo2Max, wristTemperatureC, activeEnergyKcal, steps — " +
        "plus anything listed under 'other:*' by get_data_status (e.g. flights_climbed). Escape hatch when the " +
        "summary tools don't cover a metric. For alcohol use get_drinks, which has one entry per drink rather " +
        "than a daily total. " +
        "Read daysWithoutValue before drawing a conclusion: a missing day means nothing was recorded, which is " +
        "not the same as a zero — most of all for anything a person logs by hand.",
      inputSchema: rawMetricInput,
    },
    async ({ name, days }: { name: string; days?: number }) => {
      const store = loadStore(slug);
      const dates = sortedDates(store).slice(-(days ?? 30));
      if (dates.length === 0) return noData(slug);
      const values = dates
        .map((date) => {
          const day = store.days[date] as DayRecord & Record<string, unknown>;
          const direct = day[name];
          const value = typeof direct === "number" ? direct : day.other[name];
          return value === undefined ? undefined : { date, value };
        })
        .filter((v): v is { date: string; value: number } => v !== undefined);
      if (values.length === 0) {
        return json({ error: `No values stored for metric '${name}'.`, hint: "Call get_data_status to see available metrics." });
      }
      return json({
        ...freshness(store),
        metric: name,
        units: store.units?.[name],
        ...coverage(name, dates, values),
        values,
      });
    }
  );

  return server;
}
