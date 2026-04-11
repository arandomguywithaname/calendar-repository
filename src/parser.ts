import Anthropic from "@anthropic-ai/sdk";
import * as fs from "fs";
import * as path from "path";
import { AgentInput, CalendarEvent } from "./types";

const SYSTEM_PROMPT = `You are a calendar event extraction agent. Given user input (text and/or an image), extract structured calendar event data.

Return ONLY valid JSON matching this schema — no markdown, no explanation:

{
  "title": "string (required)",
  "description": "string or null",
  "startDateTime": "ISO 8601 string (required, e.g. 2026-03-15T10:00:00)",
  "endDateTime": "ISO 8601 string (required, default to 1 hour after start if not specified)",
  "location": "string or null",
  "attendees": [{ "tag": "@mention string", "displayName": "name without @" }] or [],
  "conferenceLink": true/false (true if user mentions a conference/video/meeting link),
  "recurrence": ["RRULE strings"] or [],
  "reminders": [{ "method": "popup"|"email", "minutes": number }] or [],
  "timeZone": "IANA timezone string, default America/New_York if not specified"
}

Rules:
- Today's date is provided in the user message for relative date resolution.
- If the user says "Saturday March 15" resolve it to the correct ISO date.
- If no time is specified, default to 09:00.
- If no end time is specified, default to 1 hour after start.
- Extract @mentions as attendees with the tag field preserving the original mention.
- If user mentions "conference link", "video call", "zoom", "meet", etc., set conferenceLink to true.
- Return pure JSON only.`;

function getMediaType(
  filePath: string
): "image/jpeg" | "image/png" | "image/gif" | "image/webp" {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<
    string,
    "image/jpeg" | "image/png" | "image/gif" | "image/webp"
  > = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
  };
  return map[ext] || "image/png";
}

export async function parseInput(
  input: AgentInput,
  currentDate: string
): Promise<CalendarEvent> {
  const client = new Anthropic();

  const contentBlocks: Anthropic.MessageCreateParams["messages"][0]["content"] =
    [];

  // If an image is provided, include it as a vision input
  if (input.imagePath) {
    const absolutePath = path.resolve(input.imagePath);
    const imageData = fs.readFileSync(absolutePath);
    const base64 = imageData.toString("base64");
    const mediaType = getMediaType(absolutePath);

    contentBlocks.push({
      type: "image",
      source: { type: "base64", media_type: mediaType, data: base64 },
    });
  }

  // Add the text prompt
  const userText = input.text || "Extract event details from the image above.";
  contentBlocks.push({
    type: "text",
    text: `Today's date is ${currentDate}.\n\nUser request: ${userText}`,
  });

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: contentBlocks }],
  });

  // Extract the text response
  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from Claude API");
  }

  // Strip markdown code fences if Claude wraps the JSON in ```json ... ```
  let rawText = textBlock.text.trim();
  if (rawText.startsWith("```")) {
    rawText = rawText.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  }

  const parsed: CalendarEvent = JSON.parse(rawText);
  return parsed;
}
