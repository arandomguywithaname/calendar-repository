import nodemailer from "nodemailer";
import { CalendarEvent, ContactsMap } from "./types";
import { generateICS } from "./ics";

/** Well-known SMTP settings for common email providers */
const SMTP_PRESETS: Record<string, { host: string; port: number }> = {
  "gmail.com": { host: "smtp.gmail.com", port: 587 },
  "googlemail.com": { host: "smtp.gmail.com", port: 587 },
  "outlook.com": { host: "smtp-mail.outlook.com", port: 587 },
  "hotmail.com": { host: "smtp-mail.outlook.com", port: 587 },
  "live.com": { host: "smtp-mail.outlook.com", port: 587 },
  "yahoo.com": { host: "smtp.mail.yahoo.com", port: 587 },
  "icloud.com": { host: "smtp.mail.me.com", port: 587 },
  "me.com": { host: "smtp.mail.me.com", port: 587 },
  "mac.com": { host: "smtp.mail.me.com", port: 587 },
  "aol.com": { host: "smtp.aol.com", port: 587 },
  "zoho.com": { host: "smtp.zoho.com", port: 587 },
};

/** Auto-detect SMTP settings from email domain, or use env overrides */
function getSmtpConfig() {
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;

  if (!user || !pass) {
    throw new Error(
      "Email not configured. Set EMAIL_USER and EMAIL_PASS in your .env file."
    );
  }

  // Allow manual SMTP override
  if (process.env.SMTP_HOST) {
    return {
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || "587", 10),
      user,
      pass,
    };
  }

  // Auto-detect from email domain
  const domain = user.split("@")[1]?.toLowerCase();
  const preset = domain ? SMTP_PRESETS[domain] : undefined;

  if (!preset) {
    throw new Error(
      `Could not auto-detect SMTP settings for "${domain}". ` +
        `Set SMTP_HOST and SMTP_PORT in your .env file.`
    );
  }

  return { host: preset.host, port: preset.port, user, pass };
}

/** Resolve attendee emails from the event + contacts map */
function getAttendeeEmails(
  event: CalendarEvent,
  contacts: ContactsMap
): string[] {
  if (!event.attendees || event.attendees.length === 0) return [];

  const emails: string[] = [];
  for (const attendee of event.attendees) {
    const tag = attendee.tag?.replace("@", "").toLowerCase() || "";
    const email = attendee.email || contacts[tag];
    if (email) emails.push(email);
  }
  return emails;
}

/**
 * Send calendar invites to all attendees via email.
 * Each recipient gets an email with the .ics file attached,
 * which most email clients render as a calendar invite with
 * an "Add to calendar" button.
 */
export async function sendInvites(
  event: CalendarEvent,
  contacts: ContactsMap
): Promise<{ sent: string[]; failed: string[] }> {
  const smtp = getSmtpConfig();
  const emails = getAttendeeEmails(event, contacts);

  if (emails.length === 0) {
    throw new Error("No attendees with email addresses found.");
  }

  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.port === 465,
    auth: { user: smtp.user, pass: smtp.pass },
  });

  const icsContent = generateICS(event, contacts);
  const filename = `${event.title.replace(/[^a-zA-Z0-9]/g, "_")}.ics`;

  const sent: string[] = [];
  const failed: string[] = [];

  for (const to of emails) {
    try {
      await transporter.sendMail({
        from: smtp.user,
        to,
        subject: `Calendar Invite: ${event.title}`,
        text:
          `You've been invited to: ${event.title}\n\n` +
          `When: ${event.startDateTime} — ${event.endDateTime}\n` +
          (event.location ? `Where: ${event.location}\n` : "") +
          (event.description ? `\n${event.description}\n` : "") +
          `\nOpen the attached .ics file to add this event to your calendar.`,
        attachments: [
          {
            filename,
            content: icsContent,
            contentType: "text/calendar; method=REQUEST",
          },
        ],
        // This makes email clients show it as a calendar invite inline
        icalEvent: {
          method: "REQUEST",
          content: icsContent,
        },
      });
      sent.push(to);
    } catch (err: any) {
      console.error(`Failed to send to ${to}:`, err.message);
      failed.push(to);
    }
  }

  return { sent, failed };
}
