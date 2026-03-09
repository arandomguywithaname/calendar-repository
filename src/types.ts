/** Structured event data extracted by the Claude parser */
export interface CalendarEvent {
  title: string;
  description?: string;
  startDateTime: string; // ISO 8601 format
  endDateTime: string; // ISO 8601 format
  location?: string;
  attendees?: Attendee[];
  conferenceLink?: boolean; // request auto-generated Google Meet link
  recurrence?: string[]; // RRULE strings e.g. ["RRULE:FREQ=WEEKLY;COUNT=10"]
  reminders?: Reminder[];
  timeZone?: string;
}

export interface Attendee {
  displayName?: string;
  email?: string; // resolved later via contacts mapping
  tag?: string; // original @mention from the user input
}

export interface Reminder {
  method: "email" | "popup";
  minutes: number;
}

/** The raw input the user provides to the agent */
export interface AgentInput {
  text?: string;
  imagePath?: string; // local file path to an image
}

/** Contact mapping so @mentions can be resolved to emails */
export interface ContactsMap {
  [tag: string]: string; // e.g. { "leo": "leo@example.com" }
}
