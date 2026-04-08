import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import express, { Request, Response } from "express";
import multer from "multer";
import { parseInput } from "./parser";
import { createCalendarEvent } from "./calendar";
import { generateICS } from "./ics";
import { sendInvites } from "./email";
import { ContactsMap } from "./types";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Multer for image uploads (stored in memory)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));

/** Load contacts map */
function loadContacts(): ContactsMap {
  const contactsPath = path.resolve(__dirname, "../contacts.json");
  if (fs.existsSync(contactsPath)) {
    return JSON.parse(fs.readFileSync(contactsPath, "utf-8"));
  }
  return {};
}

/** POST /api/parse — parse natural language into a calendar event */
app.post("/api/parse", upload.single("image"), async (req: Request, res: Response) => {
  try {
    const text: string | undefined = req.body.text || undefined;
    const today = new Date().toISOString().split("T")[0];

    let imagePath: string | undefined;
    let tempFile: string | undefined;

    // If an image was uploaded, write it to a temp file so parser can read it
    if (req.file) {
      tempFile = path.join("/tmp", `upload-${Date.now()}-${req.file.originalname}`);
      fs.writeFileSync(tempFile, req.file.buffer);
      imagePath = tempFile;
    }

    if (!text && !imagePath) {
      res.status(400).json({ error: "Please provide text or an image." });
      return;
    }

    const event = await parseInput({ text, imagePath }, today);

    // Clean up temp file
    if (tempFile) fs.unlinkSync(tempFile);

    res.json({ event });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to parse event." });
  }
});

/** POST /api/download — generate and download an .ics file (no Google credentials needed) */
app.post("/api/download", async (req: Request, res: Response) => {
  try {
    const { event } = req.body;
    if (!event) {
      res.status(400).json({ error: "No event data provided." });
      return;
    }

    const contacts = loadContacts();
    const icsContent = generateICS(event, contacts);
    const filename = `${event.title.replace(/[^a-zA-Z0-9]/g, "_")}.ics`;

    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(icsContent);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to generate ICS file." });
  }
});

/** POST /api/send-invites — email .ics invites to attendees */
app.post("/api/send-invites", async (req: Request, res: Response) => {
  try {
    const { event } = req.body;
    if (!event) {
      res.status(400).json({ error: "No event data provided." });
      return;
    }

    const contacts = loadContacts();
    const result = await sendInvites(event, contacts);

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to send invites." });
  }
});

/** POST /api/create — create the event in Google Calendar (requires Google credentials) */
app.post("/api/create", async (req: Request, res: Response) => {
  try {
    const { event } = req.body;
    if (!event) {
      res.status(400).json({ error: "No event data provided." });
      return;
    }

    const contacts = loadContacts();
    const link = await createCalendarEvent(event, contacts);

    res.json({ link });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to create event." });
  }
});

app.listen(PORT, () => {
  console.log(`Calendar Agent running at http://localhost:${PORT}`);
});
