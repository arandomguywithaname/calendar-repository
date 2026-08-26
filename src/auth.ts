import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { Request, Response, NextFunction } from "express";
import { google } from "googleapis";
import { DEFAULT_PREFERENCES, getUser, setConnections, upsertUser } from "./reader/store";
import { Preferences, User } from "./reader/types";
import { GMAIL_SCOPE } from "./reader/connectors/gmail";

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

  // Netlify Blobs, when the functions runtime has a blobs context.
  if (process.env.NETLIFY_BLOBS_CONTEXT) {
    try {
      const { getStore } = await import("@netlify/blobs");
      const store = getStore("inbox-reader");
      const stored = await store.get("session-secret", { type: "text" });
      if (stored) {
        sessionSecret = stored as string;
        return sessionSecret;
      }
      const minted = crypto.randomBytes(32).toString("hex");
      await store.set("session-secret", minted);
      sessionSecret = minted;
      return sessionSecret;
    } catch (err: any) {
      console.warn(`Blobs unavailable for the session secret: ${err.message}`);
    }
  }

  // A writable disk (local dev, or anywhere that runs a normal Node process).
  try {
    if (fs.existsSync(SESSION_SECRET_PATH)) {
      const fromDisk = fs.readFileSync(SESSION_SECRET_PATH, "utf-8").trim();
      if (fromDisk) {
        sessionSecret = fromDisk;
        return sessionSecret;
      }
    }
    const minted = crypto.randomBytes(32).toString("hex");
    fs.mkdirSync(path.dirname(SESSION_SECRET_PATH), { recursive: true });
    fs.writeFileSync(SESSION_SECRET_PATH, minted);
    sessionSecret = minted;
    return sessionSecret;
  } catch {
    // Read-only filesystem — expected on serverless. Fall through.
  }

  /*
   * Nothing durable to write to. Derive the secret instead, so every container
   * for this site computes the *same* value and cookies signed by one are
   * accepted by the next. A random secret here is what signed people straight
   * back out: each cold start minted its own and rejected every existing cookie.
   *
   * SITE_ID is stable per site and not published, so prefer it. URL is a public
   * value and only a last resort — with it, a forged cookie is possible, which
   * matters only if you enable Google sign-in. Set SESSION_SECRET to close that.
   */
  const material =
    process.env.SITE_ID ||
    process.env.NETLIFY_SITE_ID ||
    process.env.URL ||
    process.env.DEPLOY_PRIME_URL;

  if (material) {
    sessionSecret = crypto
      .createHmac("sha256", material)
      .update("inbox-reader/session-secret/v1")
      .digest("hex");
    return sessionSecret;
  }

  sessionSecret = crypto.randomBytes(32).toString("hex");
  console.warn("No durable session secret available — sessions end when this instance does.");
  return sessionSecret;
}

export async function initializeSessionSecret(): Promise<void> {
  await getOrCreateSessionSecret();
}

/** Deployment problems worth showing in the UI rather than leaving to the logs. */
export function serverWarnings(): string[] {
  return [...configWarnings];
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

/**
 * The session cookie carries the account itself, not just an id.
 *
 * It used to hold a bare uid that every request looked up in the store. Where
 * the store can't persist — a serverless container with no Blobs and no
 * writable disk — that lookup found nothing, so signing in appeared to work and
 * the very next request bounced back to the sign-in page. A self-contained,
 * signed cookie keeps sign-in working no matter what storage is available.
 */
interface SessionPayload {
  uid: string;
  email: string;
  name: string;
  picture?: string;
  provider: "google" | "demo";
  prefs: Preferences;
  exp: number;
}

function issueSession(res: Response, user: User): void {
  const claims: SessionPayload = {
    uid: user.id,
    email: user.email,
    name: user.name,
    picture: user.picture,
    provider: user.provider,
    prefs: user.preferences || DEFAULT_PREFERENCES,
    exp: Date.now() + SESSION_MAX_AGE_MS,
  };
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const cookie = `${payload}.${sign(payload)}`;

  const attributes = [
    `${SESSION_COOKIE}=${cookie}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.floor(SESSION_MAX_AGE_MS / 1000)}`,
  ];
  // Mark Secure whenever the request actually arrived over HTTPS, rather than
  // trusting an env flag that may not be set in the functions runtime.
  const forwarded = String(res.req?.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const https = forwarded === "https" || res.req?.protocol === "https";
  if (https || process.env.NODE_ENV === "production") attributes.push("Secure");

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

  let claims: SessionPayload;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8"));
  } catch {
    return undefined;
  }
  if (!claims?.uid || typeof claims.exp !== "number" || claims.exp < Date.now()) return undefined;

  // A stored record is richer and more current when storage works; the cookie
  // is the fallback that keeps the session alive when it doesn't.
  const stored = await getUser(claims.uid).catch(() => undefined);
  if (stored) return stored;

  return {
    id: claims.uid,
    email: claims.email,
    name: claims.name || claims.email.split("@")[0],
    picture: claims.picture,
    createdAt: new Date().toISOString(),
    provider: claims.provider,
    preferences: claims.prefs || DEFAULT_PREFERENCES,
  };
}

/** Re-sign the cookie after preferences change, so they survive without a store. */
export function refreshSession(res: Response, user: User): void {
  issueSession(res, user);
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

/* --------------------------- connecting apps ------------------------------ */

/**
 * Short-lived state for a "Connect <app>" round trip. It binds the callback to
 * the account that started it, so a returning code can't attach someone else's
 * workspace to your inbox.
 */
const connectStates = new Map<string, { userId: string; app: string; at: number }>();

export function slackRedirectUri(): string {
  return (
    process.env.SLACK_REDIRECT_URI ||
    (process.env.URL ? `${process.env.URL}/auth/slack/callback` : "http://localhost:3000/auth/slack/callback")
  );
}

export function issueConnectState(userId: string, app: string): string {
  const state = crypto.randomBytes(16).toString("hex");
  const now = Date.now();
  for (const [key, entry] of connectStates) {
    if (now - entry.at > OAUTH_STATE_TTL_MS) connectStates.delete(key);
  }
  connectStates.set(state, { userId, app, at: now });
  return state;
}

export function consumeConnectState(state: string, app: string): { userId: string } | undefined {
  const entry = connectStates.get(state);
  if (!entry) return undefined;
  connectStates.delete(state);
  if (entry.app !== app) return undefined;
  if (Date.now() - entry.at > OAUTH_STATE_TTL_MS) return undefined;
  return { userId: entry.userId };
}

/* ----------------------------- google oauth ------------------------------ */

export function googleAuthUrl(): string {
  const state = crypto.randomBytes(16).toString("hex");
  const now = Date.now();
  for (const [key, createdAt] of pendingStates) {
    if (now - createdAt > OAUTH_STATE_TTL_MS) pendingStates.delete(key);
  }
  pendingStates.set(state, now);

  /*
   * Ask for read-only Gmail alongside identity, so signing in and connecting the
   * inbox are one consent screen rather than two. `offline` is what yields a
   * refresh token — without it the grant dies in an hour and Gmail silently
   * stops loading. Consent is re-prompted because Google only re-issues a
   * refresh token when the user is asked again.
   */
  return oauthClient().generateAuthUrl({
    access_type: "offline",
    scope: ["openid", "email", "profile", GMAIL_SCOPE],
    state,
    prompt: "consent select_account",
    include_granted_scopes: true,
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
  issueSession(res, user);
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
  issueSession(res, user);
  return user;
}
