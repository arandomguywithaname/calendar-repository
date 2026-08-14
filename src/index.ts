import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import { parseInput } from "./parser";
import { createCalendarEvent } from "./calendar";
import { addEventRecord } from "./history";
import { AgentInput, ContactsMap } from "./types";

dotenv.config();

/** Load contacts map from contacts.json in project root */
function loadContacts(): ContactsMap {
  const contactsPath = path.resolve(__dirname, "../contacts.json");
  if (fs.existsSync(contactsPath)) {
    return JSON.parse(fs.readFileSync(contactsPath, "utf-8"));
  }
  console.warn("No contacts.json found — @mentions won't resolve to emails.");
  return {};
}

/** Simple readline prompt */
function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  console.log("=== Calendar Planning Agent ===\n");
  console.log("Describe your event in natural language.");
  console.log("You can also provide an image path for event details.\n");

  const text = await prompt("Event description: ");
  const imagePath = await prompt("Image path (press Enter to skip): ");

  const input: AgentInput = {
    text: text || undefined,
    imagePath: imagePath || undefined,
  };

  if (!input.text && !input.imagePath) {
    console.error("Error: Please provide either text or an image path.");
    process.exit(1);
  }

  const today = new Date().toISOString().split("T")[0];
  console.log(`\nParsing your request (today is ${today})...`);

  // Step 1: Parse input with Claude
  const event = await parseInput(input, today);

  // Store in history
  const record = addEventRecord(event, "parsed");

  console.log("\nExtracted event details:");
  console.log(JSON.stringify(event, null, 2));

  // Step 2: Confirm with the user
  const confirm = await prompt("\nCreate this event in Google Calendar? (y/n): ");
  if (confirm.toLowerCase() !== "y") {
    console.log("Cancelled.");
    process.exit(0);
  }

  // Step 3: Create event in Google Calendar
  const contacts = loadContacts();
  const link = await createCalendarEvent(event, contacts);

  // Update history with creation status
  addEventRecord(event, "created", link);

  console.log("\nDone!");
}

main().catch((err) => {
  console.error("Error:", err.message || err);
  process.exit(1);
});
