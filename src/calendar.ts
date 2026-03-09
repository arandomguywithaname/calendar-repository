import { google, calendar_v3 } from "googleapis";
import { CalendarEvent, ContactsMap } from "./types";

/** Authenticate using a Google service account or OAuth2 credentials */
function getAuthClient() {
  // Option 1: Service account via GOOGLE_APPLICATION_CREDENTIALS env var
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const auth = new google.auth.GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/calendar"],
    });
    return auth;
  }

  // Option 2: OAuth2 with tokens
  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || "http://localhost:3000/callback"
  );

  oauth2.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
  });

  return oauth2;
}

/** Resolve @mentions to email addresses using a contacts map */
function resolveAttendees(
  event: CalendarEvent,
  contacts: ContactsMap
): calendar_v3.Schema$EventAttendee[] {
  if (!event.attendees || event.attendees.length === 0) return [];

  const result: calendar_v3.Schema$EventAttendee[] = [];
  for (const attendee of event.attendees) {
    const tag = attendee.tag?.replace("@", "").toLowerCase() || "";
    const email = contacts[tag];
    if (!email) {
      console.warn(`Warning: No email found for contact @${tag}. Skipping.`);
      continue;
    }
    result.push({ email, displayName: attendee.displayName || tag });
  }
  return result;
}

/** Create a Google Calendar event from parsed event data */
export async function createCalendarEvent(
  event: CalendarEvent,
  contacts: ContactsMap,
  calendarId: string = "primary"
): Promise<string> {
  const auth = getAuthClient();
  const calendar = google.calendar({ version: "v3", auth });

  const attendees = resolveAttendees(event, contacts);
  const timeZone = event.timeZone || "America/New_York";

  const eventBody: calendar_v3.Schema$Event = {
    summary: event.title,
    description: event.description || undefined,
    start: {
      dateTime: event.startDateTime,
      timeZone,
    },
    end: {
      dateTime: event.endDateTime,
      timeZone,
    },
    location: event.location || undefined,
    attendees: attendees.length > 0 ? attendees : undefined,
    recurrence: event.recurrence && event.recurrence.length > 0 ? event.recurrence : undefined,
    reminders: event.reminders && event.reminders.length > 0
      ? {
          useDefault: false,
          overrides: event.reminders.map((r) => ({
            method: r.method,
            minutes: r.minutes,
          })),
        }
      : undefined,
  };

  // Request conference link (Google Meet) if specified
  const conferenceDataVersion = event.conferenceLink ? 1 : 0;
  if (event.conferenceLink) {
    eventBody.conferenceData = {
      createRequest: {
        requestId: `agent-${Date.now()}`,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    };
  }

  const result = await calendar.events.insert({
    calendarId,
    requestBody: eventBody,
    conferenceDataVersion,
    sendUpdates: attendees.length > 0 ? "all" : "none",
  });

  const link = result.data.htmlLink || "No link returned";
  const meetLink = result.data.conferenceData?.entryPoints?.[0]?.uri;

  console.log(`\nEvent created successfully!`);
  console.log(`  Title:    ${event.title}`);
  console.log(`  Start:    ${event.startDateTime}`);
  console.log(`  End:      ${event.endDateTime}`);
  if (event.location) console.log(`  Location: ${event.location}`);
  if (attendees.length > 0) {
    console.log(`  Attendees: ${attendees.map((a) => a.email).join(", ")}`);
  }
  if (meetLink) console.log(`  Meet:     ${meetLink}`);
  console.log(`  Link:     ${link}`);

  return link;
}
