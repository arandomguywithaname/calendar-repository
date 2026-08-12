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
  consumeConnectState,
  issueConnectState,
  refreshSession,
  requireUser,
  slackRedirectUri,
  serverWarnings,
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
  setConnections,
  setPreferences,
} from "./reader/store";
import { AppId, Preferences } from "./reader/types";

dotenv.config();

const app = express();

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

// Netlify serves public/ itself and routes only /api, /auth and /webhooks to
// the function, so the static files aren't bundled alongside it. Locally they
// are, and this app serves them.
const PUBLIC_DIR = path.join(__dirname, "../public");
const SERVES_STATIC = fs.existsSync(PUBLIC_DIR);
if (SERVES_STATIC) app.use(express.static(PUBLIC_DIR, { index: false }));

/** Load contacts map */
function loadContacts(): ContactsMap {
  const contactsPath = path.resolve(__dirname, "../contacts.json");
  if (fs.existsSync(contactsPath)) {
    return JSON.parse(fs.readFileSync(contactsPath, "utf-8"));
  }
  return {};
}

/* ------------------------------- pages ----------------------------------- */

if (SERVES_STATIC) {
  app.get("/", (_req: Request, res: Response) => {
    res.sendFile(path.join(PUBLIC_DIR, "index.html"));
  });

  app.get("/calendar", (_req: Request, res: Response) => {
    res.sendFile(path.join(PUBLIC_DIR, "calendar.html"));
  });
}

/* -------------------------------- auth ----------------------------------- */

app.get("/api/session", async (req: Request, res: Response) => {
  const user = await currentUser(req);
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
    serverWarnings: serverWarnings(),
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

app.post("/auth/demo", async (req: Request, res: Response) => {
  try {
    const { email, name } = req.body || {};
    const user = await completeDemoSignIn(String(email || ""), String(name || ""), res);
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
app.get("/api/sources", requireUser, async (req: Request, res: Response) => {
  try {
    res.json({ sources: await listSources(userOf(req).connections || {}) });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Could not load sources." });
  }
});

/** PUT /api/preferences — which apps and chats to include */
app.put("/api/preferences", requireUser, async (req: Request, res: Response) => {
  const body = req.body || {};
  const apps: AppId[] = Array.isArray(body.apps)
    ? body.apps.filter((a: AppId) => APP_IDS.includes(a))
    : APP_IDS;
  const chatIds: string[] = Array.isArray(body.chatIds) ? body.chatIds.map(String) : [];

  const preferences: Preferences = { apps, chatIds, unreadOnly: Boolean(body.unreadOnly) };
  const stored = await setPreferences(userOf(req).id, preferences);

  // Re-sign the cookie too, so the choice sticks even where the store can't persist.
  refreshSession(res, { ...userOf(req), preferences });
  res.json({ preferences: stored?.preferences || preferences });
});

/** GET /api/digest — the AI summary shown on the dashboard */
app.get("/api/digest", requireUser, async (req: Request, res: Response) => {
  try {
    const user = userOf(req);
    const { messages, errors } = await collectMessages(user.preferences, user.connections || {});
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
    const { messages, errors } = await collectMessages(
      userOf(req).preferences,
      userOf(req).connections || {}
    );
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
    const { messages } = await collectMessages(user.preferences, user.connections || {});
    const history = await getConversation(user.id);
    const answer = await askAboutInbox(question, messages, history, new Date());

    await appendConversation(user.id, [
      { role: "user", content: question },
      { role: "assistant", content: answer },
    ]);

    res.json({ answer });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Could not answer that." });
  }
});

app.get("/api/ask", requireUser, async (req: Request, res: Response) => {
  res.json({ turns: await getConversation(userOf(req).id) });
});

app.delete("/api/ask", requireUser, async (req: Request, res: Response) => {
  await clearConversation(userOf(req).id);
  res.json({ ok: true });
});

/** POST /api/mark-read — clear unread flags for buffered apps */
app.post("/api/mark-read", requireUser, async (req: Request, res: Response) => {
  const { app: appId, chatIds } = req.body || {};
  if (appId !== "telegram" && appId !== "whatsapp") {
    res.status(400).json({ error: "Only Telegram and WhatsApp track read state locally." });
    return;
  }
  await markRead(appId, Array.isArray(chatIds) ? chatIds.map(String) : []);
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
app.post("/webhooks/whatsapp", async (req: Request, res: Response) => {
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
    const kept = await ingestWebhook(req.body || {});
    if (kept > 0) console.log(`WhatsApp webhook: stored ${kept} message(s).`);
  } catch (err: any) {
    console.error("WhatsApp webhook error:", err.message);
  }
  // Always 200 — Meta retries and disables endpoints that return errors.
  res.sendStatus(200);
});


/* ---------------------------- connecting apps ----------------------------- */

/**
 * Slack sign-in for one account.
 *
 * The site is registered once at api.slack.com (SLACK_CLIENT_ID / SECRET); each
 * person then clicks Connect and approves it for their own workspace. The token
 * that comes back is stored against their account — nobody pastes a token, and
 * one person connecting does not expose their Slack to anyone else.
 */
const SLACK_SCOPES = [
  "channels:read", "groups:read", "im:read", "mpim:read",
  "channels:history", "groups:history", "im:history", "mpim:history",
  "users:read",
].join(",");

app.get("/auth/slack", requireUser, (req: Request, res: Response) => {
  const clientId = process.env.SLACK_CLIENT_ID;
  if (!clientId) {
    res.redirect("/?connectError=" + encodeURIComponent("Slack is not set up for this site yet."));
    return;
  }
  const state = issueConnectState(userOf(req).id, "slack");
  const url = new URL("https://slack.com/oauth/v2/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("user_scope", SLACK_SCOPES);
  url.searchParams.set("state", state);
  url.searchParams.set("redirect_uri", slackRedirectUri());
  res.redirect(url.toString());
});

app.get("/auth/slack/callback", async (req: Request, res: Response) => {
  const { code, state, error } = req.query as Record<string, string | undefined>;
  if (error || !code || !state) {
    res.redirect("/?connectError=" + encodeURIComponent(error || "slack_cancelled"));
    return;
  }

  const claim = consumeConnectState(state, "slack");
  if (!claim) {
    res.redirect("/?connectError=" + encodeURIComponent("That Slack link expired — try again."));
    return;
  }

  try {
    const body = new URLSearchParams({
      code,
      client_id: process.env.SLACK_CLIENT_ID || "",
      client_secret: process.env.SLACK_CLIENT_SECRET || "",
      redirect_uri: slackRedirectUri(),
    });
    const response = await fetch("https://slack.com/api/oauth.v2.access", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    const payload: any = await response.json();
    if (!payload.ok) throw new Error(payload.error || "slack_oauth_failed");

    // A user token reads what the person can see; unread counts need it.
    const token = payload.authed_user?.access_token || payload.access_token;
    if (!token) throw new Error("Slack returned no usable token.");

    await setConnections(claim.userId, {
      slackToken: token,
      slackTeam: payload.team?.name || undefined,
    });
    res.redirect("/?connected=slack");
  } catch (err: any) {
    res.redirect("/?connectError=" + encodeURIComponent(err.message || "slack_oauth_failed"));
  }
});

/**
 * POST /api/connections/:app — connect by pasting a credential.
 *
 * Telegram has no OAuth for this: a bot is created by messaging @BotFather,
 * which is why the token is pasted rather than granted. The token is checked
 * against the provider before it is stored, so a typo fails here rather than
 * silently showing sample data forever.
 */
app.post("/api/connections/:app", requireUser, async (req: Request, res: Response) => {
  const which = req.params.app;
  const token = String((req.body || {}).token || "").trim();
  if (!token) {
    res.status(400).json({ error: "Paste a token first." });
    return;
  }

  try {
    if (which === "telegram") {
      // A bot token is "<digits>:<secret>" and goes into the URL path verbatim —
      // percent-encoding the colon produces a path Telegram does not recognise.
      // Since it cannot be escaped, validate its shape so nothing else can be
      // smuggled into the path.
      if (!/^\d{5,}:[A-Za-z0-9_-]{20,}$/.test(token)) {
        res.status(400).json({
          error: "That does not look like a bot token. @BotFather gives you something like 123456789:AAE…",
        });
        return;
      }
      const probe = await fetch(`https://api.telegram.org/bot${token}/getMe`);
      const body: any = await probe.json().catch(() => ({}));
      if (!body?.ok) {
        res.status(400).json({
          error: "Telegram rejected that token. Copy it again from @BotFather — it looks like 123456789:AAE…",
        });
        return;
      }
      await setConnections(userOf(req).id, { telegramBotToken: token });
      res.json({ ok: true, detail: `@${body.result?.username || "bot"}` });
      return;
    }

    if (which === "slack") {
      const probe = await fetch("https://slack.com/api/auth.test", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/x-www-form-urlencoded" },
      });
      const body: any = await probe.json().catch(() => ({}));
      if (!body?.ok) {
        res.status(400).json({ error: `Slack rejected that token${body?.error ? ` (${body.error})` : ""}.` });
        return;
      }
      await setConnections(userOf(req).id, { slackToken: token, slackTeam: body.team });
      res.json({ ok: true, detail: body.team });
      return;
    }

    res.status(400).json({ error: "That app is not connected by pasting a token." });
  } catch (err: any) {
    res.status(502).json({ error: `Could not reach ${which}: ${err.message || "network error"}` });
  }
});

/** GET /api/connections — which apps this account has connected */
app.get("/api/connections", requireUser, (req: Request, res: Response) => {
  const c = userOf(req).connections || {};
  res.json({
    telegram: { connected: Boolean(c.telegramBotToken) },
    slack: { connected: Boolean(c.slackToken), detail: c.slackTeam },
    gmail: { connected: Boolean(c.googleRefreshToken), detail: c.googleEmail },
  });
});

/** DELETE /api/connections/:app — forget one account's credentials */
app.delete("/api/connections/:app", requireUser, async (req: Request, res: Response) => {
  const which = String(req.params.app);
  const clear: Record<string, Record<string, undefined>> = {
    telegram: { telegramBotToken: undefined },
    slack: { slackToken: undefined, slackTeam: undefined },
    gmail: { googleRefreshToken: undefined, googleEmail: undefined },
  };
  if (!clear[which]) {
    res.status(400).json({ error: "Nothing to disconnect for that app." });
    return;
  }
  await setConnections(userOf(req).id, clear[which] as any);
  res.json({ ok: true });
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

export default app;
