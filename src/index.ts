import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import { parseInput } from "./parser";
import { createCalendarEvent } from "./calendar";
import { generateICS } from "./ics";
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

  console.log("\nExtracted event details:");
  console.log(JSON.stringify(event, null, 2));

  // Step 2: Choose how to save
  console.log("\nHow would you like to save this event?");
  console.log("  1. Download as .ics file (works with any calendar app — no setup needed)");
  console.log("  2. Create directly in Google Calendar (requires Google credentials)");
  console.log("  3. Cancel");

  const choice = await prompt("\nChoice (1/2/3): ");
  const contacts = loadContacts();

  if (choice === "1") {
    // Save as .ics file
    const icsContent = generateICS(event, contacts);
    const filename = `${event.title.replace(/[^a-zA-Z0-9]/g, "_")}.ics`;
    const outputPath = path.resolve(process.cwd(), filename);
    fs.writeFileSync(outputPath, icsContent, "utf-8");
    console.log(`\nEvent saved to: ${outputPath}`);
    console.log("Open this file to add the event to your calendar app.");
  } else if (choice === "2") {
    // Create in Google Calendar
    await createCalendarEvent(event, contacts);
  } else {
    console.log("Cancelled.");
    process.exit(0);
  }

  console.log("\nDone!");
}

main().catch((err) => {
  console.error("Error:", err.message || err);
  process.exit(1);
});
