import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { Request, Response, NextFunction } from "express";
import { google } from "googleapis";
import { getUser, upsertUser } from "./reader/store";
import { User } from "./reader/types";

/**
 * Sign-in for the reader.
 *
 * Google sign-in is real OAuth: the browser is sent to Google's own consent
 * screen, the user's password is typed on accounts.google.com, and we get back
 * a code we exchange for their profile. The app never sees the password — any
 * page that asked for a Gmail password directly would be a phishing form, and
 * Google blocks those sign-ins anyway.
 *
 * When Google credentials aren't configured, a clearly-labelled local demo
 * sign-in stands in so the dashboard is still usable.
 */

const SESSION_COOKIE = "reader_session";
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const SESSION_SECRET_PATH = path.resolve(__dirname, "../data/session-secret.txt");

const pendingStates = new Map<string, number>();

const configWarnings: string[] = [];

let sessionSecret: string | null = null;

async function getOrCreateSessionSecret(): Promise<string> {
  if (sessionSecret) return sessionSecret;

  if (process.env.SESSION_SECRET) {
    sessionSecret = process.env.SESSION_SECRET;
    return sessionSecret;
  }

  // Try to load from persistent storage.
  if (process.env.NETLIFY || process.env.NETLIFY_BLOBS_CONTEXT) {
    // On Netlify, store in Blobs alongside other app data.
    try {
      const { getStore } = await import("@netlify/blobs");
      const stored = await getStore("inbox-reader").get("session-secret", { type: "text" });
      if (stored) {
        sessionSecret = stored as string;
        return sessionSecret;
      }
    } catch (err: any) {
      console.warn(`Could not read session secret from Blobs: ${err.message}`);
    }
  } else {
    // Locally, store in data/session-secret.txt.
    if (fs.existsSync(SESSION_SECRET_PATH)) {
      try {
        sessionSecret = fs.readFileSync(SESSION_SECRET_PATH, "utf-8").trim();
        return sessionSecret;
      } catch (err: any) {
        console.warn(`Could not read ${SESSION_SECRET_PATH}: ${err.message}`);
      }
    }
  }

  // Generate new secret and persist it.
  sessionSecret = crypto.randomBytes(32).toString("hex");

  if (process.env.NETLIFY || process.env.NETLIFY_BLOBS_CONTEXT) {
    try {
      const { getStore } = await import("@netlify/blobs");
      await getStore("inbox-reader").set("session-secret", sessionSecret);
    } catch (err: any) {
      // On Netlify, if Blobs fails, we still have the in-memory sessionSecret.
      // Don't try to fall back to file system — it won't be writable.
      console.warn(`Could not persist session secret to Blobs: ${err.message}`);
    }
  } else {
    // Only use file system if definitely not on Netlify
    try {
      const dir = path.dirname(SESSION_SECRET_PATH);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(SESSION_SECRET_PATH, sessionSecret);
    } catch (err: any) {
      console.warn(`Could not save session secret to ${SESSION_SECRET_PATH}: ${err.message}`);
    }
  }

  return sessionSecret;
}

export async function initializeSessionSecret(): Promise<void> {
  await getOrCreateSessionSecret();
}

/** Deployment problems worth showing in the UI rather than leaving to the logs. */
export function serverWarnings(): string[] {
  const warnings = [...configWarnings];
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    warnings.push(
      "ANTHROPIC_API_KEY is not set — sign-in works, but summaries and questions will fail."
    );
  }
  return warnings;
}

export function googleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function demoSignInAllowed(): boolean {
  if (process.env.ALLOW_DEMO_SIGNIN === "false") return false;
  return process.env.ALLOW_DEMO_SIGNIN === "true" || !googleConfigured();
}

function redirectUri(): string {
  return process.env.GOOGLE_REDIRECT_URI || "http://localhost:3000/auth/google/callback";
}

function oauthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri()
  );
}

/* ------------------------------- sessions -------------------------------- */

function sign(payload: string): string {
  if (!sessionSecret) throw new Error("Session secret not initialized");
  return crypto.createHmac("sha256", sessionSecret).update(payload).digest("base64url");
}

function issueSession(res: Response, userId: string): void {
  const payload = Buffer.from(
    JSON.stringify({ uid: userId, exp: Date.now() + SESSION_MAX_AGE_MS })
  ).toString("base64url");
  const cookie = `${payload}.${sign(payload)}`;

  const attributes = [
    `${SESSION_COOKIE}=${cookie}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.floor(SESSION_MAX_AGE_MS / 1000)}`,
  ];
  if (process.env.NODE_ENV === "production") attributes.push("Secure");
  res.setHeader("Set-Cookie", attributes.join("; "));
}

export function clearSession(res: Response): void {
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return undefined;
}

export async function currentUser(req: Request): Promise<User | undefined> {
  const cookie = readCookie(req, SESSION_COOKIE);
  if (!cookie) return undefined;

  const [payload, signature] = cookie.split(".");
  if (!payload || !signature) return undefined;

  const expected = sign(payload);
  const given = Buffer.from(signature);
  const want = Buffer.from(expected);
  if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) return undefined;

  try {
    const { uid, exp } = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8"));
    if (!uid || typeof exp !== "number" || exp < Date.now()) return undefined;
    return await getUser(uid);
  } catch {
    return undefined;
  }
}

/** Express guard for the /api routes that need an account. */
export async function requireUser(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const user = await currentUser(req);
    if (!user) {
      res.status(401).json({ error: "Sign in to continue." });
      return;
    }
    (req as Request & { user: User }).user = user;
    next();
  } catch (err) {
    next(err);
  }
}

export function userOf(req: Request): User {
  return (req as Request & { user: User }).user;
}

/* ----------------------------- google oauth ------------------------------ */

export function googleAuthUrl(): string {
  const state = crypto.randomBytes(16).toString("hex");
  const now = Date.now();
  for (const [key, createdAt] of pendingStates) {
    if (now - createdAt > OAUTH_STATE_TTL_MS) pendingStates.delete(key);
  }
  pendingStates.set(state, now);

  return oauthClient().generateAuthUrl({
    access_type: "online",
    scope: ["openid", "email", "profile"],
    state,
    prompt: "select_account",
  });
}

/** Exchange the callback code for a profile and create (or find) the account. */
export async function completeGoogleSignIn(
  code: string,
  state: string,
  res: Response
): Promise<User> {
  const issuedAt = pendingStates.get(state);
  if (!issuedAt || Date.now() - issuedAt > OAUTH_STATE_TTL_MS) {
    throw new Error("This sign-in link has expired. Please start again.");
  }
  pendingStates.delete(state);

  const client = oauthClient();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);

  const profile = await google.oauth2({ version: "v2", auth: client }).userinfo.get();
  const email = profile.data.email;
  if (!email) throw new Error("Google did not return an email address for this account.");

  const user = await upsertUser({
    email,
    name: profile.data.name || email.split("@")[0],
    picture: profile.data.picture || undefined,
    provider: "google",
  });
  issueSession(res, user.id);
  return user;
}

/** Local sign-in for when Google isn't configured. No password, no pretence. */
export async function completeDemoSignIn(
  email: string,
  name: string,
  res: Response
): Promise<User> {
  if (!demoSignInAllowed()) throw new Error("Demo sign-in is disabled.");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("That doesn't look like an email address.");

  const user = await upsertUser({ email, name, provider: "demo" });
  issueSession(res, user.id);
  return user;
}
