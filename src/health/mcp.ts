import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { loadStore, sortedDates, storePath } from "./store";
import { computeExertion, computeRecovery, computeTrend } from "./metrics";
import { DayRecord, WorkoutRecord } from "./types";

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

function noData() {
  return json({
    error: "No health data has been synced yet.",
    howToFix:
      "Send data from the phone with the Health Auto Export app (Automations → REST API → POST to /api/health/ingest), " +
      "or upload an export on the /health page. See APPLE_HEALTH.md in the repository.",
    dataFile: storePath(),
  });
}

function latestDate(dates: string[]): string | undefined {
  return dates.length ? dates[dates.length - 1] : undefined;
}

function daySummary(dateArg?: string) {
  const store = loadStore();
  const dates = sortedDates(store);
  const date = dateArg ?? latestDate(dates);
  if (!date) return noData();
  const day = store.days[date];
  if (!day) {
    return json({
      error: `No data stored for ${date}.`,
      availableRange: { first: dates[0], last: latestDate(dates) },
    });
  }
  const recovery = computeRecovery(store, date);
  const exertion = computeExertion(store, date);
  return json({
    date,
    note: ESTIMATE_NOTE,
    recovery: recovery ?? "insufficient data (needs ~5 prior days of HRV/resting-HR history for baselines)",
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

export function buildHealthMcpServer(): McpServer {
  const server = new McpServer(
    { name: "apple-health", version: "1.0.0" },
    {
      instructions:
        "One person's Apple Health data: sleep, heart metrics, workouts, activity, and any other synced HealthKit " +
        "metrics, plus recovery/exertion estimates computed from them (Apple Health has no cloud API, so the phone " +
        "pushes this data to the server). Dates are YYYY-MM-DD in the user's local time. " +
        "Start with get_data_status if unsure what's available.",
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
      const store = loadStore();
      const dates = sortedDates(store);
      if (dates.length === 0) return noData();
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
    async ({ date }: { date?: string }) => daySummary(date)
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
      const store = loadStore();
      if (sortedDates(store).length === 0) return noData();
      return json({ note: ESTIMATE_NOTE, days: computeTrend(store, days ?? 14) });
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
      const store = loadStore();
      const dates = sortedDates(store);
      if (dates.length === 0) return noData();
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
      const store = loadStore();
      const dates = sortedDates(store).slice(-(days ?? 7));
      if (dates.length === 0) return noData();
      const nights = dates
        .filter((d) => store.days[d].sleep)
        .map((d) => ({ date: d, ...store.days[d].sleep }));
      const totals = nights.map((n) => n.totalSleepHours).filter((v): v is number => v !== undefined);
      const avg = totals.length ? Math.round((totals.reduce((a, b) => a + b, 0) / totals.length) * 100) / 100 : null;
      return json({ nights, averageSleepHours: avg });
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
      const store = loadStore();
      const dates = sortedDates(store).slice(-(days ?? 30));
      if (dates.length === 0) return noData();
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
