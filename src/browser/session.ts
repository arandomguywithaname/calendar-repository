import * as os from "os";
import * as path from "path";
import { Browser, BrowserContext, Page, SessionInfo, SessionMode } from "./types";

/**
 * Getting hold of a browser, and keeping one.
 *
 * There are two ways in, and neither of them is "a fresh headless Chromium in a
 * data centre" — that is precisely the thing shops block, and it also removes
 * the human this connector depends on:
 *
 *   attach  — connect over CDP to a Chrome the user started themselves. Real
 *             profile, real cookies, real logins, real screen. Nothing is
 *             pretending to be anything.
 *   profile — launch a visible Chrome against a persistent profile directory of
 *             its own, so the user signs in once and stays signed in.
 *
 * The window is always visible. That is not a default, it is the design: every
 * CAPTCHA and login in this connector is handed to a person, and a person
 * cannot click a window that is not on screen.
 */

const DEFAULT_CDP = "http://127.0.0.1:9222";

interface Session {
  mode: SessionMode;
  target: string;
  browser?: Browser;
  context: BrowserContext;
  page: Page;
  /** Status of the last main-frame navigation, for the bot-wall rules. */
  lastStatus?: number;
}

let session: Session | null = null;

/** Where a `profile`-mode browser keeps its cookies and logins between runs. */
export function profileDir(): string {
  return process.env.BROWSER_PROFILE_DIR || path.join(os.homedir(), ".claude-browser-profile");
}

export function cdpUrl(): string {
  return process.env.BROWSER_CDP_URL || DEFAULT_CDP;
}

function navTimeout(): number {
  const raw = Number(process.env.BROWSER_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : 45000;
}

/**
 * Playwright is required lazily and is deliberately not in package.json's
 * dependencies: the calendar app, the Docker image and the Fly.io deploy have
 * no business downloading a browser. Install it only on the machine that will
 * actually drive one (`npm run browser:setup`).
 */
function playwright(): any {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require("playwright");
  } catch {
    throw new Error(
      "Playwright is not installed. On the computer that will run the browser:\n" +
        "  npm install playwright && npx playwright install chromium\n" +
        "(or `npm run browser:setup`, which does both). See BROWSER.md."
    );
  }
}

function attachHelp(url: string): string {
  return (
    `No browser is listening at ${url}.\n\n` +
    "Start Chrome with remote debugging on, using a profile kept for this:\n" +
    '  macOS:   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \\\n' +
    '             --remote-debugging-port=9222 --user-data-dir="$HOME/chrome-claude"\n' +
    '  Windows: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" ^\n' +
    '             --remote-debugging-port=9222 --user-data-dir="%USERPROFILE%\\chrome-claude"\n' +
    '  Linux:   google-chrome --remote-debugging-port=9222 --user-data-dir="$HOME/chrome-claude"\n\n' +
    "Sign in to the shops you care about in that window once — the profile keeps the session.\n" +
    "Or set BROWSER_MODE=profile and let the connector launch and keep its own browser."
  );
}

/** Try CDP first; a refused connection just means no debug browser is running. */
async function tryAttach(pw: any, url: string): Promise<Session | null> {
  let browser: Browser;
  try {
    browser = await pw.chromium.connectOverCDP(url, { timeout: 5000 });
  } catch {
    return null;
  }
  const contexts = browser.contexts();
  const context = contexts.length ? contexts[0] : await browser.newContext();
  const pages = context.pages();
  const page = pages.length ? pages[0] : await context.newPage();
  return { mode: "attach", target: url, browser, context, page };
}

async function launchProfile(pw: any): Promise<Session> {
  const dir = profileDir();
  const opts = {
    headless: false,
    viewport: null as null,
    args: ["--start-maximized"],
    timeout: 60000,
  };
  let context: BrowserContext;
  try {
    // Prefer the user's installed Chrome: it is the browser the shop expects to
    // see, because it is a browser a person actually uses.
    context = await pw.chromium.launchPersistentContext(dir, { ...opts, channel: "chrome" });
  } catch {
    context = await pw.chromium.launchPersistentContext(dir, opts);
  }
  const pages = context.pages();
  const page = pages.length ? pages[0] : await context.newPage();
  return { mode: "profile", target: dir, context, page };
}

/** Connect if we are not connected, and hand back the live session. */
export async function ensureSession(): Promise<Session> {
  if (session && !session.page.isClosed()) return session;
  if (session) {
    // The window was closed under us; fall through and reconnect.
    session = null;
  }

  const pw = playwright();
  const mode = (process.env.BROWSER_MODE || "auto").toLowerCase();

  let next: Session | null = null;
  if (mode === "attach" || mode === "auto") {
    next = await tryAttach(pw, cdpUrl());
    if (!next && mode === "attach") throw new Error(attachHelp(cdpUrl()));
  }
  if (!next) next = await launchProfile(pw);

  const live = next;
  live.page.setDefaultTimeout(navTimeout());
  live.page.setDefaultNavigationTimeout(navTimeout());

  // Remember the status of each main-document response. A 403 or 429 is the
  // clearest bot-wall signal there is, and it is invisible in the DOM — a
  // click that lands on one would otherwise look like an empty page.
  live.page.on("response", (response: any) => {
    try {
      if (response.request().resourceType() === "document" && response.frame() === live.page.mainFrame()) {
        live.lastStatus = response.status();
      }
    } catch {
      // Frame detached mid-navigation; the next response will do.
    }
  });

  session = live;
  return session;
}

export async function currentPage(): Promise<Page> {
  return (await ensureSession()).page;
}

/** Status of the last navigation, used by the bot-wall rules. */
export function lastStatus(): number | undefined {
  return session?.lastStatus;
}

export function setLastStatus(status: number | undefined): void {
  if (session) session.lastStatus = status;
}

export async function sessionInfo(): Promise<SessionInfo> {
  const s = await ensureSession();
  return {
    mode: s.mode,
    target: s.target,
    url: s.page.url(),
    title: await s.page.title().catch(() => ""),
    pages: s.context.pages().length,
  };
}

/** True when a session is already open, without opening one. */
export function isConnected(): boolean {
  return session !== null && !session.page.isClosed();
}

/**
 * Let go of the browser. An attached browser is only disconnected — it belongs
 * to the user and closing it would shut their windows. A launched profile
 * browser is ours, so it is closed.
 */
export async function closeSession(): Promise<void> {
  if (!session) return;
  try {
    if (session.mode === "attach") await session.browser?.close();
    else await session.context.close();
  } catch {
    // Already gone; nothing to do.
  }
  session = null;
}

/** Bring the window to the user's attention — the handoff depends on it. */
export async function focusWindow(): Promise<void> {
  const s = await ensureSession();
  await s.page.bringToFront().catch(() => undefined);
}
