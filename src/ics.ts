import { CalendarEvent, ContactsMap } from "./types";

/**
 * Generate an ICS (iCalendar) file string from a parsed CalendarEvent.
 * This allows users to download and import events into any calendar app
 * (Google Calendar, Apple Calendar, Outlook, etc.) without needing
 * Google Cloud credentials.
 */
export function generateICS(
  event: CalendarEvent,
  contacts: ContactsMap
): string {
  const lines: string[] = [];

  lines.push("BEGIN:VCALENDAR");
  lines.push("VERSION:2.0");
  lines.push("PRODID:-//CalendarPlanningAgent//EN");
  lines.push("CALSCALE:GREGORIAN");
  lines.push("METHOD:PUBLISH");

  lines.push("BEGIN:VEVENT");

  // UID — unique identifier for the event
  lines.push(`UID:${generateUID()}`);

  // Timestamps
  lines.push(`DTSTAMP:${formatICSDate(new Date().toISOString())}`);
  lines.push(`DTSTART:${formatICSDate(event.startDateTime)}`);
  lines.push(`DTEND:${formatICSDate(event.endDateTime)}`);

  // Title
  lines.push(`SUMMARY:${escapeICS(event.title)}`);

  // Description
  if (event.description) {
    lines.push(`DESCRIPTION:${escapeICS(event.description)}`);
  }

  // Location
  if (event.location) {
    lines.push(`LOCATION:${escapeICS(event.location)}`);
  }

  // Attendees — resolve @mentions via contacts map
  if (event.attendees && event.attendees.length > 0) {
    for (const attendee of event.attendees) {
      const tag = attendee.tag?.replace("@", "").toLowerCase() || "";
      const email = attendee.email || contacts[tag];
      if (!email) continue;
      const name = attendee.displayName || tag;
      lines.push(
        `ATTENDEE;CN=${escapeICS(name)};RSVP=TRUE:mailto:${email}`
      );
    }
  }

  // Recurrence rules (already in RRULE format from the parser)
  if (event.recurrence && event.recurrence.length > 0) {
    for (const rule of event.recurrence) {
      lines.push(rule);
    }
  }

  // Reminders as VALARM components
  if (event.reminders && event.reminders.length > 0) {
    for (const reminder of event.reminders) {
      lines.push("BEGIN:VALARM");
      lines.push(`TRIGGER:-PT${reminder.minutes}M`);
      if (reminder.method === "email") {
        lines.push("ACTION:EMAIL");
        lines.push(`DESCRIPTION:Reminder: ${escapeICS(event.title)}`);
        lines.push(`SUMMARY:Reminder: ${escapeICS(event.title)}`);
      } else {
        lines.push("ACTION:DISPLAY");
        lines.push(`DESCRIPTION:Reminder: ${escapeICS(event.title)}`);
      }
      lines.push("END:VALARM");
    }
  }

  lines.push("END:VEVENT");
  lines.push("END:VCALENDAR");

  return lines.join("\r\n");
}

/** Format an ISO 8601 datetime string to ICS format (YYYYMMDDTHHMMSSZ) */
function formatICSDate(isoString: string): string {
  const d = new Date(isoString);
  const pad = (n: number) => n.toString().padStart(2, "0");

  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    "T" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    "Z"
  );
}

/** Escape special characters for ICS text fields */
function escapeICS(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

/** Generate a unique ID for the event */
function generateUID(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 10);
  return `${timestamp}-${random}@calendar-agent`;
}
