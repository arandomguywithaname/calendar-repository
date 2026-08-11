import * as crypto from "crypto";
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

const pendingStates = new Map<string, number>();

let sessionSecret = process.env.SESSION_SECRET || "";
if (!sessionSecret) {
  sessionSecret = crypto.randomBytes(32).toString("hex");
  console.warn("SESSION_SECRET is not set — using a random secret. Sessions end on restart.");
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

export function currentUser(req: Request): User | undefined {
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
    return getUser(uid);
  } catch {
    return undefined;
  }
}

/** Express guard for the /api routes that need an account. */
export function requireUser(req: Request, res: Response, next: NextFunction): void {
  const user = currentUser(req);
  if (!user) {
    res.status(401).json({ error: "Sign in to continue." });
    return;
  }
  (req as Request & { user: User }).user = user;
  next();
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

  const user = upsertUser({
    email,
    name: profile.data.name || email.split("@")[0],
    picture: profile.data.picture || undefined,
    provider: "google",
  });
  issueSession(res, user.id);
  return user;
}

/** Local sign-in for when Google isn't configured. No password, no pretence. */
export function completeDemoSignIn(email: string, name: string, res: Response): User {
  if (!demoSignInAllowed()) throw new Error("Demo sign-in is disabled.");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("That doesn't look like an email address.");

  const user = upsertUser({ email, name, provider: "demo" });
  issueSession(res, user.id);
  return user;
}
