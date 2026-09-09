import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { loadStore, sortedDates, storePath } from "./store";
import { computeExertion, computeRecovery, computeTrend } from "./metrics";
import { DayRecord, HealthStore, WorkoutRecord } from "./types";
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
function isPartial(store: HealthStore, date: string): boolean {
  const lastSync = store.updatedAt?.slice(0, 10);
  return lastSync !== undefined && date >= lastSync;
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
    date,
    partial,
    ...(partial
      ? { partialNote: "This day is still in progress — totals and scores below cover only what has been synced so far." }
      : {}),
    note: ESTIMATE_NOTE,
    recovery: recovery ?? noRecoveryReason(day),
    exertion: exertion ?? "insufficient data",
    sleep: day.sleep ?? null,
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
      workouts: day.workouts,
    },
  });
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
        "and any other synced HealthKit metrics, plus recovery/exertion estimates computed from them (Apple Health " +
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
        for (const k of Object.keys(day.other)) bump(`other:${k}`);
      }
      return json({
        daysStored: dates.length,
        firstDate: dates[0],
        lastDate: latestDate(dates),
        lastSync: store.updatedAt ?? null,
        totalWorkouts: workouts,
        daysWithMetric: counts,
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
        for (const w of store.days[date].workouts) all.push({ date, ...w });
      }
      all.sort((a, b) => (a.start < b.start ? 1 : -1));
      return json({ totalMatching: all.length, workouts: all.slice(0, limit ?? 20) });
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
        .map((d) => ({ date: d, ...store.days[d].sleep }));
      // Nights whose own numbers contradict each other are listed but kept out
      // of the average: an average over broken values is broken to two decimals.
      const sound = nights.filter((n) => !(n.suspect && n.suspect.length));
      const totals = sound.map((n) => n.totalSleepHours).filter((v): v is number => v !== undefined);
      const avg = totals.length ? Math.round((totals.reduce((a, b) => a + b, 0) / totals.length) * 100) / 100 : null;
      return json({
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
    "get_raw_metric",
    {
      title: "Raw metric",
      description:
        "Daily values for one stored metric over the last N days. Valid names: hrvMs, restingHeartRate, heartRateAvg, " +
        "heartRateMax, respiratoryRate, bloodOxygenPct, vo2Max, wristTemperatureC, activeEnergyKcal, steps — " +
        "plus anything listed under 'other:*' by get_data_status (e.g. mindful_minutes). Escape hatch when the " +
        "summary tools don't cover a metric.",
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
      return json({ metric: name, units: store.units?.[name], values });
    }
  );

  return server;
}
