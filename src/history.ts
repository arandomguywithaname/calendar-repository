import * as fs from "fs";
import * as path from "path";
import { CalendarEvent } from "./types";

export interface EventRecord {
  id: string;
  event: CalendarEvent;
  createdAt: string;
  status: "parsed" | "created";
  calendarLink?: string;
}

const HISTORY_FILE = path.resolve(__dirname, "../event_history.json");

function ensureHistoryFile(): void {
  if (!fs.existsSync(HISTORY_FILE)) {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify([], null, 2));
  }
}

export function loadHistory(): EventRecord[] {
  ensureHistoryFile();
  const data = fs.readFileSync(HISTORY_FILE, "utf-8");
  return JSON.parse(data) || [];
}

export function saveHistory(records: EventRecord[]): void {
  ensureHistoryFile();
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(records, null, 2));
}

export function addEventRecord(
  event: CalendarEvent,
  status: "parsed" | "created" = "parsed",
  calendarLink?: string
): EventRecord {
  const records = loadHistory();
  const record: EventRecord = {
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    event,
    createdAt: new Date().toISOString(),
    status,
    calendarLink,
  };
  records.push(record);
  saveHistory(records);
  return record;
}

export function getEventHistory(limit?: number): EventRecord[] {
  const records = loadHistory();
  return limit ? records.slice(-limit).reverse() : records.reverse();
}

export function getEventById(id: string): EventRecord | undefined {
  const records = loadHistory();
  return records.find((r) => r.id === id);
}
