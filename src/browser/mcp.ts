import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  blockingOnly,
  describeBlockers,
  isDomainAllowed,
  isPurchaseControl,
  parseAllowedDomains,
} from "./guards";
import {
  closeSession,
  currentPage,
  ensureSession,
  focusWindow,
  isConnected,
  profileDir,
  sessionInfo,
  setLastStatus,
} from "./session";
import {
  detectBlockers,
  extractProducts,
  findElements,
  hideHandoffBanner,
  locator,
  readText,
  showHandoffBanner,
  snapshot,
} from "./snapshot";
import { Blocker, Page } from "./types";

/**
 * The browser connector's MCP tools.
 *
 * The shape of the thing: Claude can open pages, read them, click, type and
 * pull product data out of the site's own structured markup. The moment a
 * CAPTCHA, bot wall, login form or one-time-code prompt appears, every acting
 * tool refuses and points at browser_request_human, which puts a banner in the
 * window and waits for the person to clear it. There is no code path that
 * answers a challenge, and there must never be one.
 *
 * The second guard is money: a click on "Place your order" or "Jetzt kaufen"
 * is refused by default. Claude fills the basket, a person pays.
 */

const HANDOFF_HINT =
  "Call browser_request_human — it brings the window forward, shows the user what to do, and waits for them.";

type ToolResult = { content: ({ type: "text"; text: string } | { type: "image"; data: string; mimeType: string })[] };

function json(result: unknown): ToolResult {
  return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
}

// server.registerTool's generic inference overflows TypeScript's instantiation
// budget (TS2589) with this SDK+zod pairing, so registrations go through this
// loosely-typed wrapper — same approach as src/health/mcp.ts. Runtime behavior
// is identical; the zod schemas still validate input and are still advertised.
function addTool(
  server: McpServer,
  name: string,
  config: { title: string; description: string; inputSchema: z.ZodRawShape },
  handler: (args: any) => Promise<ToolResult>
): void {
  (server.registerTool as (n: string, c: unknown, h: unknown) => unknown)(name, config, handler);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Purchase policy: "never" (default) or "confirm" — see BROWSER.md. */
function purchasePolicy(): "never" | "confirm" {
  return process.env.BROWSER_ALLOW_PURCHASE === "confirm" ? "confirm" : "never";
}

function allowedDomains(): string[] {
  return parseAllowedDomains(process.env.BROWSER_ALLOWED_DOMAINS);
}

/** The standard refusal when a wall is up: what it is, and whose job it is. */
function blockedResult(blockers: Blocker[], attempted: string): ToolResult {
  return json({
    refused: attempted,
    reason: "A human has to clear this before Claude can carry on.",
    blockers: blockingOnly(blockers),
    nextStep: HANDOFF_HINT,
    note:
      "This connector never solves or works around a challenge. If the site keeps refusing, that is its answer — " +
      "use its official app or API, or do this part by hand.",
  });
}

/**
 * Every acting tool starts here. Returns a refusal to hand straight back, or
 * null when the page is clear.
 */
async function guard(page: Page, attempted: string): Promise<ToolResult | null> {
  const blockers = await detectBlockers(page);
  if (blockingOnly(blockers).length === 0) return null;
  return blockedResult(blockers, attempted);
}

/** Wait for the page to settle after a click or navigation, without failing on a slow shop. */
async function settle(page: Page): Promise<void> {
  await page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => undefined);
  await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => undefined);
}

const openInput: z.ZodRawShape = {
  url: z.string().describe("Full URL to open, e.g. https://www.decathlon.fr/search?Ntt=running+shoes"),
  readText: z.boolean().optional().describe("Also return the page text (default true)."),
};
const snapshotInput: z.ZodRawShape = {
  readText: z.boolean().optional().describe("Include the page text alongside the element list (default false)."),
};
const readInput: z.ZodRawShape = {
  maxChars: z.number().int().min(200).max(40000).optional().describe("Cap on returned characters (default 12000)."),
};
const findInput: z.ZodRawShape = {
  query: z.string().describe("Text to look for in element labels and link targets, e.g. 'add to basket'."),
  limit: z.number().int().min(1).max(50).optional().describe("Max matches to return (default 15)."),
};
const clickInput: z.ZodRawShape = {
  ref: z.string().describe("Element ref from the most recent browser_snapshot or browser_find, e.g. 'e12'."),
  confirmPurchase: z
    .boolean()
    .optional()
    .describe(
      "Only meaningful when BROWSER_ALLOW_PURCHASE=confirm. Set true ONLY after the user has, in this conversation, " +
        "explicitly told you to place this order. Never set it on your own judgement."
    ),
};
const typeInput: z.ZodRawShape = {
  ref: z.string().describe("Element ref of the input or textarea, from the last snapshot."),
  text: z.string().describe("Text to type. Never type a password, card number or one-time code here."),
  submit: z.boolean().optional().describe("Press Enter afterwards (default false)."),
};
const selectInput: z.ZodRawShape = {
  ref: z.string().describe("Element ref of the <select>."),
  value: z.string().describe("Option value or visible label to choose."),
};
const scrollInput: z.ZodRawShape = {
  direction: z.enum(["down", "up", "top", "bottom"]).describe("Which way to scroll."),
  pages: z.number().min(0.1).max(20).optional().describe("How many viewport heights for up/down (default 1)."),
};
const waitInput: z.ZodRawShape = {
  forText: z.string().optional().describe("Wait until this text appears on the page."),
  seconds: z.number().min(0.5).max(60).optional().describe("Plain wait in seconds (default 2 when no text given)."),
};
const screenshotInput: z.ZodRawShape = {
  fullPage: z.boolean().optional().describe("Capture the whole scrollable page instead of the viewport (default false)."),
};
const humanInput: z.ZodRawShape = {
  reason: z
    .string()
    .describe("What the person needs to do, in one plain sentence — shown to them as a banner in the browser window."),
  timeoutSeconds: z.number().int().min(10).max(900).optional().describe("How long to wait (default 180)."),
};
const consentInput: z.ZodRawShape = {
  choice: z
    .enum(["accept", "reject"])
    .describe("What the USER chose. Ask them first — do not decide this for them."),
};
const productsInput: z.ZodRawShape = {
  limit: z.number().int().min(1).max(100).optional().describe("Max products to return (default 20)."),
};

export function buildBrowserMcpServer(): McpServer {
  const server = new McpServer(
    { name: "browser", version: "1.0.0" },
    {
      instructions:
        "Drives the user's own visible Chrome window so you can use sites that have no API — shops like Amazon or " +
        "Decathlon, order histories, booking pages. You are a second pair of hands on their browser, not a crawler.\n\n" +
        "Two things you cannot do, by design:\n" +
        "1. CAPTCHAs, bot walls, login forms and one-time codes are handed to the user. Tools refuse while one is up; " +
        "call browser_request_human and wait. Never ask the user for a password or a code so you can type it — they " +
        "type it themselves in the window.\n" +
        "2. Buttons that place an order or take a payment are blocked. Fill the basket, go to the checkout, then tell " +
        "the user to press the final button themselves.\n\n" +
        "Typical loop: browser_open → browser_snapshot (gives elements refs like 'e12') → browser_click / browser_type " +
        "→ browser_snapshot again. Refs are only valid until the next snapshot. On a product or results page, " +
        "browser_extract_products is far cheaper and more accurate than reading the whole page.",
    }
  );

  addTool(
    server,
    "browser_status",
    {
      title: "Browser status",
      description:
        "Whether a browser is connected, how (attached to the user's Chrome, or a profile this connector launched), " +
        "what page is open, and which guards are in force. Call this first if anything is behaving oddly.",
      inputSchema: {},
    },
    async () => {
      if (!isConnected()) {
        // Don't launch a browser just to answer "is one open?" — say what would happen.
        return json({
          connected: false,
          willUse: process.env.BROWSER_MODE || "auto",
          profileDir: profileDir(),
          purchaseGuard: purchasePolicy(),
          allowedDomains: allowedDomains().length ? allowedDomains() : "all",
          note: "Any navigation tool will connect (or launch a window) on first use.",
        });
      }
      const info = await sessionInfo();
      const page = await currentPage();
      const blockers = await detectBlockers(page);
      return json({
        connected: true,
        ...info,
        purchaseGuard: purchasePolicy(),
        allowedDomains: allowedDomains().length ? allowedDomains() : "all",
        blockers: blockers.length ? blockers : "none",
      });
    }
  );

  addTool(
    server,
    "browser_open",
    {
      title: "Open a page",
      description:
        "Navigate the browser window to a URL and report what is there: title, any blocker (CAPTCHA, login, consent " +
        "banner), and the page text. Use real site URLs — to search a shop, either use its search URL or open the " +
        "home page and type into its search box.",
      inputSchema: openInput,
    },
    async ({ url, readText: wantText }: { url: string; readText?: boolean }) => {
      const allow = allowedDomains();
      if (!isDomainAllowed(url, allow)) {
        return json({
          refused: `open ${url}`,
          reason: "That domain is not in BROWSER_ALLOWED_DOMAINS.",
          allowedDomains: allow,
          nextStep: "Ask the user to add the domain to BROWSER_ALLOWED_DOMAINS and restart the connector.",
        });
      }
      const page = await currentPage();
      const response = await page.goto(url, { waitUntil: "domcontentloaded" }).catch((err: Error) => {
        throw new Error(`Could not open ${url}: ${err.message}`);
      });
      setLastStatus(response ? response.status() : undefined);
      await settle(page);
      const snap = await snapshot(page, wantText !== false);
      return json({
        ...snap,
        ...(blockingOnly(snap.blockers).length ? { nextStep: HANDOFF_HINT } : {}),
      });
    }
  );

  addTool(
    server,
    "browser_snapshot",
    {
      title: "Snapshot the page",
      description:
        "List the clickable and typeable things on the current page, each with a short ref ('e12') to pass to " +
        "browser_click / browser_type / browser_select, plus any blockers. Refs are reissued every snapshot, so use " +
        "them straight away and re-snapshot after anything that changes the page.",
      inputSchema: snapshotInput,
    },
    async ({ readText: wantText }: { readText?: boolean }) => {
      const page = await currentPage();
      return json(await snapshot(page, wantText === true));
    }
  );

  addTool(
    server,
    "browser_read",
    {
      title: "Read the page text",
      description: "The visible text of the current page, collapsed and capped. Good for descriptions, specs, delivery terms.",
      inputSchema: readInput,
    },
    async ({ maxChars }: { maxChars?: number }) => {
      const page = await currentPage();
      const blocked = await guard(page, "read the page");
      if (blocked) return blocked;
      const text = await readText(page, maxChars ?? 12000);
      return json({ url: page.url(), chars: text.length, text });
    }
  );

  addTool(
    server,
    "browser_find",
    {
      title: "Find elements",
      description:
        "Refs for elements whose label or link contains some text — 'add to basket', 'size', 'next page'. Much " +
        "cheaper than a full snapshot on a big shop page.",
      inputSchema: findInput,
    },
    async ({ query, limit }: { query: string; limit?: number }) => {
      const page = await currentPage();
      const blocked = await guard(page, `find "${query}"`);
      if (blocked) return blocked;
      const matches = await findElements(page, query, limit ?? 15);
      return json({ query, found: matches.length, elements: matches });
    }
  );

  addTool(
    server,
    "browser_click",
    {
      title: "Click",
      description:
        "Click the element with the given ref. Refuses while a CAPTCHA or login is up, and refuses on controls that " +
        "place an order or take a payment — those are the user's to press. Re-snapshot afterwards: the page will have moved.",
      inputSchema: clickInput,
    },
    async ({ ref, confirmPurchase }: { ref: string; confirmPurchase?: boolean }) => {
      const page = await currentPage();
      const blocked = await guard(page, `click ${ref}`);
      if (blocked) return blocked;

      const target = locator(page, ref);
      if ((await target.count()) === 0) {
        return json({
          error: `Ref ${ref} is not on the page any more.`,
          nextStep: "Call browser_snapshot again — the page changed and refs were reissued.",
        });
      }
      const label = ((await target.first().getAttribute("aria-label")) || (await target.first().innerText().catch(() => "")) || "")
        .replace(/\s+/g, " ")
        .trim();

      if (isPurchaseControl(label)) {
        const policy = purchasePolicy();
        if (policy === "never" || !confirmPurchase) {
          return json({
            refused: `click ${ref} ("${label}")`,
            reason: "That control places an order or takes a payment.",
            policy: `BROWSER_ALLOW_PURCHASE=${policy}`,
            nextStep:
              policy === "never"
                ? "Tell the user the basket and checkout are ready and ask them to press this button themselves in the " +
                  "browser window. The connector will not spend their money."
                : "Ask the user, in plain terms (what, how much, from where), whether to place the order. Only if they " +
                  "say yes, call again with confirmPurchase: true.",
          });
        }
      }

      await target.first().click({ timeout: 15000 });
      setLastStatus(undefined);
      await settle(page);
      const snap = await snapshot(page, false);
      return json({ clicked: label || ref, ...snap });
    }
  );

  addTool(
    server,
    "browser_type",
    {
      title: "Type into a field",
      description:
        "Fill an input or textarea. Never put a password, a card number or a one-time code in here — if the page is " +
        "asking for one of those, hand over with browser_request_human instead.",
      inputSchema: typeInput,
    },
    async ({ ref, text, submit }: { ref: string; text: string; submit?: boolean }) => {
      const page = await currentPage();
      const blocked = await guard(page, `type into ${ref}`);
      if (blocked) return blocked;

      const target = locator(page, ref).first();
      if ((await locator(page, ref).count()) === 0) {
        return json({ error: `Ref ${ref} is gone.`, nextStep: "Re-run browser_snapshot." });
      }
      const type = (await target.getAttribute("type")) || "";
      if (type.toLowerCase() === "password") {
        return json({
          refused: `type into ${ref}`,
          reason: "That is a password field.",
          nextStep:
            "Call browser_request_human and let the user sign in themselves. Do not ask them to tell you the password.",
        });
      }
      await target.fill(text, { timeout: 15000 });
      if (submit) {
        await target.press("Enter");
        setLastStatus(undefined);
        await settle(page);
      }
      return json({ typedInto: ref, submitted: !!submit, ...(await snapshot(page, false)) });
    }
  );

  addTool(
    server,
    "browser_select",
    {
      title: "Choose a dropdown option",
      description: "Pick an option in a <select> — size, colour, quantity, delivery country.",
      inputSchema: selectInput,
    },
    async ({ ref, value }: { ref: string; value: string }) => {
      const page = await currentPage();
      const blocked = await guard(page, `select in ${ref}`);
      if (blocked) return blocked;
      const target = locator(page, ref).first();
      // Try by value, then by visible label — shops label sizes both ways.
      const chosen = await target.selectOption(value, { timeout: 10000 }).catch(async () => {
        return target.selectOption({ label: value }, { timeout: 10000 });
      });
      await settle(page);
      return json({ selected: chosen, ref, ...(await snapshot(page, false)) });
    }
  );

  addTool(
    server,
    "browser_scroll",
    {
      title: "Scroll",
      description:
        "Scroll the page. Shop listings lazy-load as you go, so scroll down before expecting the rest of a results grid.",
      inputSchema: scrollInput,
    },
    async ({ direction, pages }: { direction: string; pages?: number }) => {
      const page = await currentPage();
      await page.evaluate(
        ({ dir, amount }: { dir: string; amount: number }) => {
          if (dir === "top") window.scrollTo({ top: 0 });
          else if (dir === "bottom") window.scrollTo({ top: document.body.scrollHeight });
          else window.scrollBy({ top: (dir === "up" ? -1 : 1) * window.innerHeight * amount });
        },
        { dir: direction, amount: pages ?? 1 }
      );
      // Give lazy-loaded tiles a moment to arrive before anyone reads the page.
      await sleep(800);
      return json({ scrolled: direction, url: page.url() });
    }
  );

  addTool(
    server,
    "browser_back",
    {
      title: "Go back",
      description: "Browser back button — useful after opening a product from a results list.",
      inputSchema: {},
    },
    async () => {
      const page = await currentPage();
      const response = await page.goBack({ waitUntil: "domcontentloaded" }).catch(() => null);
      setLastStatus(response ? response.status() : undefined);
      await settle(page);
      return json({ wentBack: !!response, ...(await snapshot(page, false)) });
    }
  );

  addTool(
    server,
    "browser_wait",
    {
      title: "Wait",
      description: "Wait for some text to appear, or just wait a few seconds for a slow page or a spinner.",
      inputSchema: waitInput,
    },
    async ({ forText, seconds }: { forText?: string; seconds?: number }) => {
      const page = await currentPage();
      if (forText) {
        const ms = (seconds ?? 20) * 1000;
        const appeared = await page
          .getByText(forText, { exact: false })
          .first()
          .waitFor({ state: "visible", timeout: ms })
          .then(() => true)
          .catch(() => false);
        return json({ waitedFor: forText, appeared, url: page.url() });
      }
      await sleep((seconds ?? 2) * 1000);
      return json({ waitedSeconds: seconds ?? 2, url: page.url() });
    }
  );

  addTool(
    server,
    "browser_screenshot",
    {
      title: "Screenshot",
      description:
        "A picture of the current page. Use it when the text and element list are not enough — visual layouts, " +
        "size charts, images, or to show the user what you are looking at.",
      inputSchema: screenshotInput,
    },
    async ({ fullPage }: { fullPage?: boolean }) => {
      const page = await currentPage();
      const buffer: Buffer = await page.screenshot({ fullPage: !!fullPage, type: "png", timeout: 20000 });
      return {
        content: [
          { type: "text" as const, text: `${page.url()} (${fullPage ? "full page" : "viewport"})` },
          { type: "image" as const, data: buffer.toString("base64"), mimeType: "image/png" },
        ],
      };
    }
  );

  addTool(
    server,
    "browser_check_blockers",
    {
      title: "Check for CAPTCHAs and walls",
      description:
        "Classify what is in the way on the current page: CAPTCHA, bot wall, rate limit, login, one-time code, " +
        "cookie banner, age gate — each with the evidence and what the human should do about it.",
      inputSchema: {},
    },
    async () => {
      const page = await currentPage();
      const blockers = await detectBlockers(page);
      return json({
        url: page.url(),
        blockers,
        summary: describeBlockers(blockers),
        blocking: blockingOnly(blockers).length > 0,
        ...(blockingOnly(blockers).length ? { nextStep: HANDOFF_HINT } : {}),
      });
    }
  );

  addTool(
    server,
    "browser_request_human",
    {
      title: "Hand the browser to the user",
      description:
        "The way past a CAPTCHA, a login or a one-time code: bring the window to the front, show the user a banner " +
        "saying what to do, and wait until they have done it. Returns as soon as the page is clear, or when the wait " +
        "runs out. Tell the user in chat too — they may not be looking at the browser.",
      inputSchema: humanInput,
    },
    async ({ reason, timeoutSeconds }: { reason: string; timeoutSeconds?: number }) => {
      const page = await currentPage();
      const before = await detectBlockers(page);
      const deadline = Date.now() + (timeoutSeconds ?? 180) * 1000;

      await focusWindow();
      console.error(`[browser] waiting for the user: ${reason}`);
      await showHandoffBanner(page, reason);

      let blockers = before;
      while (Date.now() < deadline) {
        await sleep(2000);
        try {
          blockers = await detectBlockers(page);
          if (blockingOnly(blockers).length === 0) break;
          // The banner lives in the DOM, so a navigation wipes it out.
          await showHandoffBanner(page, reason);
        } catch {
          // Mid-navigation the page is not readable; try again next tick.
        }
      }
      await hideHandoffBanner(page);

      const cleared = blockingOnly(blockers).length === 0;
      return json({
        cleared,
        waitedFor: reason,
        url: page.url(),
        title: await page.title().catch(() => ""),
        remaining: cleared ? [] : blockingOnly(blockers),
        nextStep: cleared
          ? "Carry on — call browser_snapshot to see where you ended up."
          : "Still blocked. Tell the user what is on screen and ask them to finish it, or call this again with a longer " +
            "timeout. Do not try to get around it.",
      });
    }
  );

  addTool(
    server,
    "browser_dismiss_consent",
    {
      title: "Answer the cookie banner",
      description:
        "Press accept or reject on a cookie/consent dialog. Ask the user which they want first — agreeing to tracking " +
        "on someone's behalf is their call, not yours.",
      inputSchema: consentInput,
    },
    async ({ choice }: { choice: "accept" | "reject" }) => {
      const page = await currentPage();
      const wanted =
        choice === "accept"
          ? ["accept all", "accept cookies", "i accept", "agree", "tout accepter", "alle akzeptieren", "aceptar todas"]
          : ["reject all", "reject", "decline", "only necessary", "necessary only", "continue without accepting",
             "tout refuser", "continuer sans accepter", "ablehnen", "rechazar"];
      for (const phrase of wanted) {
        const button = page.getByRole("button", { name: new RegExp(phrase, "i") }).first();
        if (await button.count().then((c: number) => c > 0).catch(() => false)) {
          await button.click({ timeout: 8000 }).catch(() => undefined);
          await sleep(700);
          const after = await detectBlockers(page);
          return json({
            choice,
            pressed: phrase,
            stillShowing: after.some((b) => b.kind === "cookie-consent"),
            ...(await snapshot(page, false)),
          });
        }
      }
      return json({
        choice,
        pressed: null,
        error: "Could not find a matching button on the banner.",
        nextStep:
          "Call browser_snapshot and click the right ref directly, or ask the user to dismiss the banner themselves.",
      });
    }
  );

  addTool(
    server,
    "browser_extract_products",
    {
      title: "Extract products",
      description:
        "Pull products off the current page — name, price, currency, availability, rating, link — from the structured " +
        "data the site publishes for search engines (JSON-LD, schema.org microdata, OpenGraph). Works on both search " +
        "results and a single product page, and is far more reliable than reading prices out of the page text. " +
        "Returns nothing if the site publishes no structured data; fall back to browser_read then.",
      inputSchema: productsInput,
    },
    async ({ limit }: { limit?: number }) => {
      const page = await currentPage();
      const blocked = await guard(page, "extract products");
      if (blocked) return blocked;
      const products = await extractProducts(page, limit ?? 20);
      return json({
        url: page.url(),
        found: products.length,
        products,
        ...(products.length === 0
          ? { note: "No structured product data on this page. Try browser_read, or browser_screenshot for a visual page." }
          : {}),
      });
    }
  );

  addTool(
    server,
    "browser_close",
    {
      title: "Close the browser session",
      description:
        "Let go of the browser. A Chrome the connector attached to is only released, never closed — it is the user's " +
        "window. A profile browser the connector launched is closed.",
      inputSchema: {},
    },
    async () => {
      const wasConnected = isConnected();
      await closeSession();
      return json({ closed: wasConnected });
    }
  );

  return server;
}

/** Connect eagerly so startup problems surface at launch, not mid-conversation. */
export async function warmUp(): Promise<void> {
  await ensureSession();
}
