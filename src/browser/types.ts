/**
 * Shared types for the browser connector.
 *
 * Playwright is an optional, lazily-required dependency (see session.ts), so
 * nothing here imports its types — the handful of objects we touch are
 * described structurally instead. That keeps `npx tsc --noEmit` and the Fly.io
 * image working on a machine that never installs a browser.
 */

/** Playwright objects, kept deliberately loose — see the note above. */
export type Page = any;
export type BrowserContext = any;
export type Browser = any;

/** How the connector got hold of a browser. */
export type SessionMode = "attach" | "profile";

export interface SessionInfo {
  mode: SessionMode;
  /** CDP endpoint when attached, profile directory when launched. */
  target: string;
  url: string;
  title: string;
  pages: number;
}

/**
 * Everything the blocker classifier needs, read out of the page in one pass.
 * Collected in the browser, classified in Node — so the rules in guards.ts are
 * pure functions that can be tested without a browser.
 */
export interface PageFacts {
  url: string;
  title: string;
  /** HTTP status of the main document, when the navigation reported one. */
  status?: number;
  /** Visible body text, collapsed and truncated. */
  text: string;
  /** `src` of every iframe on the page. */
  iframeUrls: string[];
  /** Which of the known probe selectors matched (see guards.ts PROBES). */
  selectorsPresent: string[];
  hasPasswordField: boolean;
}

export type BlockerKind =
  | "captcha"
  | "bot-wall"
  | "rate-limited"
  | "login"
  | "otp"
  | "cookie-consent"
  | "age-gate";

export interface Blocker {
  kind: BlockerKind;
  /** How sure the rule is. Medium means "looks like it", not "is". */
  confidence: "high" | "medium";
  /** The signal that fired, so a human can sanity-check the call. */
  evidence: string;
  /** Plain-English instruction for the person sitting at the browser. */
  humanAction: string;
  /** True when the page's real content is unreachable until this clears. */
  blocking: boolean;
}

/** One interactive element on the page, addressable by `ref`. */
export interface ElementRef {
  ref: string;
  /** "a", "button", "select", "input:text", "input:checkbox", … */
  kind: string;
  name: string;
  href?: string;
  checked?: boolean;
  /** Set when the purchase guard would refuse a click here. */
  purchaseControl?: boolean;
}

export interface Snapshot {
  url: string;
  title: string;
  status?: number;
  blockers: Blocker[];
  elements: ElementRef[];
  /** True when the element list was cut off at the cap. */
  truncated: boolean;
  text?: string;
}

/** A product read out of the page's own structured data. */
export interface ProductInfo {
  name: string;
  price?: string;
  currency?: string;
  availability?: string;
  rating?: string;
  reviewCount?: string;
  url?: string;
  image?: string;
  /** Where it came from: "json-ld", "microdata" or "og". */
  source: string;
}
