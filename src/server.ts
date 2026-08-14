import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import express, { Request, Response } from "express";
import multer from "multer";
import { parseInput } from "./parser";
import { createCalendarEvent } from "./calendar";
import { addEventRecord, getEventHistory } from "./history";
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

    // Store in history
    const record = addEventRecord(event, "parsed");

    res.json({ event, recordId: record.id });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to parse event." });
  }
});

/** POST /api/create — create the event in Google Calendar */
app.post("/api/create", async (req: Request, res: Response) => {
  try {
    const { event } = req.body;
    if (!event) {
      res.status(400).json({ error: "No event data provided." });
      return;
    }

    const contacts = loadContacts();
    const link = await createCalendarEvent(event, contacts);

    // Store in history as created
    addEventRecord(event, "created", link);

    res.json({ link });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to create event." });
  }
});

/** GET /api/history — retrieve past events */
app.get("/api/history", (req: Request, res: Response) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
    const records = getEventHistory(limit);
    res.json({ records });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to fetch history." });
  }
});

app.listen(PORT, () => {
  console.log(`Calendar Agent running at http://localhost:${PORT}`);
});
