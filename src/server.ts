import * as dotenv from "dotenv";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import express, { Request, Response } from "express";
import multer from "multer";
import { parseInput } from "./parser";
import { createCalendarEvent } from "./calendar";
import { ContactsMap } from "./types";
import {
  clearSession,
  completeDemoSignIn,
  completeGoogleSignIn,
  currentUser,
  demoSignInAllowed,
  googleAuthUrl,
  googleConfigured,
  requireUser,
  userOf,
} from "./auth";
import { APP_IDS, collectMessages, listSources } from "./reader/connectors";
import { ingestWebhook } from "./reader/connectors/whatsapp";
import { askAboutInbox, buildDigest } from "./reader/ai";
import {
  appendConversation,
  clearConversation,
  getConversation,
  markRead,
  setPreferences,
} from "./reader/store";
import { AppId, Preferences } from "./reader/types";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Multer for image uploads (stored in memory)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Keep the raw body around so the WhatsApp webhook signature can be verified.
app.use(
  express.json({
    verify: (req, _res, buf) => {
      (req as Request & { rawBody?: Buffer }).rawBody = buf;
    },
  })
);
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "../public"), { index: false }));

/** Load contacts map */
function loadContacts(): ContactsMap {
  const contactsPath = path.resolve(__dirname, "../contacts.json");
  if (fs.existsSync(contactsPath)) {
    return JSON.parse(fs.readFileSync(contactsPath, "utf-8"));
  }
  return {};
}

/* ------------------------------- pages ----------------------------------- */

app.get("/", (_req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

app.get("/calendar", (_req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, "../public/calendar.html"));
});

/* -------------------------------- auth ----------------------------------- */

app.get("/api/session", (req: Request, res: Response) => {
  const user = currentUser(req);
  res.json({
    authenticated: Boolean(user),
    user: user
      ? {
          name: user.name,
          email: user.email,
          picture: user.picture,
          provider: user.provider,
          preferences: user.preferences,
        }
      : null,
    googleEnabled: googleConfigured(),
    demoEnabled: demoSignInAllowed(),
  });
});

app.get("/auth/google", (_req: Request, res: Response) => {
  if (!googleConfigured()) {
    res.status(503).send("Google sign-in is not configured on this server.");
    return;
  }
  res.redirect(googleAuthUrl());
});

app.get("/auth/google/callback", async (req: Request, res: Response) => {
  const { code, state, error } = req.query as Record<string, string | undefined>;
  if (error) {
    res.redirect(`/?authError=${encodeURIComponent(error)}`);
    return;
  }
  if (!code || !state) {
    res.redirect("/?authError=missing_code");
    return;
  }
  try {
    await completeGoogleSignIn(code, state, res);
    res.redirect("/");
  } catch (err: any) {
    res.redirect(`/?authError=${encodeURIComponent(err.message || "sign_in_failed")}`);
  }
});

app.post("/auth/demo", (req: Request, res: Response) => {
  try {
    const { email, name } = req.body || {};
    const user = completeDemoSignIn(String(email || ""), String(name || ""), res);
    res.json({ user: { name: user.name, email: user.email, preferences: user.preferences } });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Could not sign in." });
  }
});

app.post("/auth/signout", (_req: Request, res: Response) => {
  clearSession(res);
  res.json({ ok: true });
});

/* ------------------------------- reader ---------------------------------- */

/** GET /api/sources — apps and chats the user can choose from */
app.get("/api/sources", requireUser, async (_req: Request, res: Response) => {
  try {
    res.json({ sources: await listSources() });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Could not load sources." });
  }
});

/** PUT /api/preferences — which apps and chats to include */
app.put("/api/preferences", requireUser, (req: Request, res: Response) => {
  const body = req.body || {};
  const apps: AppId[] = Array.isArray(body.apps)
    ? body.apps.filter((a: AppId) => APP_IDS.includes(a))
    : APP_IDS;
  const chatIds: string[] = Array.isArray(body.chatIds) ? body.chatIds.map(String) : [];

  const preferences: Preferences = { apps, chatIds, unreadOnly: Boolean(body.unreadOnly) };
  const user = setPreferences(userOf(req).id, preferences);
  res.json({ preferences: user?.preferences });
});

/** GET /api/digest — the AI summary shown on the dashboard */
app.get("/api/digest", requireUser, async (req: Request, res: Response) => {
  try {
    const user = userOf(req);
    const { messages, errors } = await collectMessages(user.preferences);
    const digest = await buildDigest(messages, new Date());
    res.json({
      digest,
      stats: {
        messages: messages.length,
        unread: messages.filter((m) => m.unread).length,
        chats: new Set(messages.map((m) => `${m.app}:${m.chatId}`)).size,
      },
      warnings: errors,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Could not build the summary." });
  }
});

/** GET /api/messages — the raw feed behind the summary */
app.get("/api/messages", requireUser, async (req: Request, res: Response) => {
  try {
    const { messages, errors } = await collectMessages(userOf(req).preferences);
    res.json({ messages: messages.slice(-200).reverse(), warnings: errors });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Could not load messages." });
  }
});

/** POST /api/ask — natural-language questions about the selected messages */
app.post("/api/ask", requireUser, async (req: Request, res: Response) => {
  try {
    const question = String((req.body || {}).question || "").trim();
    if (!question) {
      res.status(400).json({ error: "Ask me something first." });
      return;
    }

    const user = userOf(req);
    const { messages } = await collectMessages(user.preferences);
    const history = getConversation(user.id);
    const answer = await askAboutInbox(question, messages, history, new Date());

    appendConversation(user.id, [
      { role: "user", content: question },
      { role: "assistant", content: answer },
    ]);

    res.json({ answer });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Could not answer that." });
  }
});

app.get("/api/ask", requireUser, (req: Request, res: Response) => {
  res.json({ turns: getConversation(userOf(req).id) });
});

app.delete("/api/ask", requireUser, (req: Request, res: Response) => {
  clearConversation(userOf(req).id);
  res.json({ ok: true });
});

/** POST /api/mark-read — clear unread flags for buffered apps */
app.post("/api/mark-read", requireUser, (req: Request, res: Response) => {
  const { app: appId, chatIds } = req.body || {};
  if (appId !== "telegram" && appId !== "whatsapp") {
    res.status(400).json({ error: "Only Telegram and WhatsApp track read state locally." });
    return;
  }
  markRead(appId, Array.isArray(chatIds) ? chatIds.map(String) : []);
  res.json({ ok: true });
});

/* ------------------------------ webhooks --------------------------------- */

/** Meta's webhook verification handshake */
app.get("/webhooks/whatsapp", (req: Request, res: Response) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    res.status(200).send(String(challenge));
    return;
  }
  res.sendStatus(403);
});

/** Inbound WhatsApp messages */
app.post("/webhooks/whatsapp", (req: Request, res: Response) => {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (appSecret) {
    const signature = req.header("x-hub-signature-256") || "";
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody || Buffer.alloc(0);
    const expected =
      "sha256=" + crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
    const given = Buffer.from(signature);
    const want = Buffer.from(expected);
    if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) {
      res.sendStatus(401);
      return;
    }
  }

  try {
    const kept = ingestWebhook(req.body || {});
    if (kept > 0) console.log(`WhatsApp webhook: stored ${kept} message(s).`);
  } catch (err: any) {
    console.error("WhatsApp webhook error:", err.message);
  }
  // Always 200 — Meta retries and disables endpoints that return errors.
  res.sendStatus(200);
});

/* ------------------------- calendar agent (existing) ---------------------- */

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

    res.json({ link });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to create event." });
  }
});

app.listen(PORT, () => {
  console.log(`Message reader running at http://localhost:${PORT}`);
  console.log(`Calendar agent available at http://localhost:${PORT}/calendar`);
});
