import { Blocker, ElementRef, PageFacts } from "./types";

/**
 * The rules that decide when Claude must stop and hand the browser back to the
 * person sitting in front of it.
 *
 * Read this file first if you are wondering what this connector does and does
 * not do. It *detects* CAPTCHAs, bot walls and login gates and asks a human to
 * clear them. It does not solve, bypass, or disguise anything — there is no
 * solver service, no fingerprint spoofing, no user-agent rotation and no proxy
 * list anywhere in this project, and none should be added. A shop that puts a
 * CAPTCHA in front of you is asking for a human; the answer is to get one, not
 * to fake one.
 *
 * Everything here is a pure function over PageFacts / element names, so the
 * rules are unit-tested in test/browser.test.js without launching a browser.
 */

/**
 * Selectors probed in the page. Presence is reported back as a plain string
 * list so the classifier stays pure. Keep the keys stable — they are matched
 * below and asserted on in the tests.
 */
export const PROBES: Record<string, string> = {
  // CAPTCHA widgets
  recaptcha: ".g-recaptcha, #recaptcha, iframe[src*='recaptcha']",
  hcaptcha: ".h-captcha, iframe[src*='hcaptcha.com']",
  turnstile: ".cf-turnstile, iframe[src*='challenges.cloudflare.com']",
  arkose: "#arkose, iframe[src*='arkoselabs'], iframe[src*='funcaptcha']",
  geetest: ".geetest_holder, .geetest_panel",
  amazonCaptcha: "#captchacharacters, form[action*='/errors/validateCaptcha']",
  // Consent managers
  onetrust: "#onetrust-banner-sdk, #onetrust-consent-sdk",
  usercentrics: "#usercentrics-root, [id^='usercentrics']",
  didomi: "#didomi-host, .didomi-popup-container",
  cookiebot: "#CybotCookiebotDialog",
  genericConsent: "[id*='cookie-banner'], [class*='cookie-consent'], [aria-label*='cookie' i]",
  // Age gates
  ageGate: "[id*='age-gate'], [class*='age-gate'], [id*='age-verification']",
};

/** Phrases that mean "prove you are a person". Lowercase, multi-language. */
const CAPTCHA_TEXT = [
  "enter the characters you see below",
  "type the characters you see",
  "i'm not a robot",
  "i am not a robot",
  "verify you are human",
  "verify you are a human",
  "are you a human",
  "press and hold",
  "click and hold",
  "solve this puzzle",
  "complete the security check",
  "security check to access",
  "geef de tekens op",
  "saisissez les caractères",
  "prouvez que vous êtes humain",
  "je ne suis pas un robot",
  "ich bin kein roboter",
  "geben sie die zeichen ein",
  "no soy un robot",
  "introduce los caracteres",
];

/** Phrases from bot walls and WAF interstitials — not a CAPTCHA, but the same handoff. */
const BOT_WALL_TEXT = [
  "checking your browser",
  "just a moment",
  "please wait while we verify",
  "enable javascript and cookies to continue",
  "access denied",
  "you have been blocked",
  "sorry, we just need to make sure you're not a robot",
  "to discuss automated access to amazon data",
  "unusual traffic from your",
  "request blocked",
  "pardon our interruption",
];

const RATE_LIMIT_TEXT = [
  "too many requests",
  "rate limit",
  "slow down",
  "try again later",
];

const OTP_TEXT = [
  "verification code",
  "one-time code",
  "one time password",
  "enter the code we sent",
  "two-step verification",
  "two-factor",
  "code de vérification",
  "bestätigungscode",
  "código de verificación",
];

const LOGIN_TEXT = [
  "sign in",
  "log in",
  "login",
  "se connecter",
  "identifiez-vous",
  "anmelden",
  "iniciar sesión",
  "inloggen",
];

const CONSENT_TEXT = [
  "accept all cookies",
  "accept cookies",
  "we use cookies",
  "manage your cookie",
  "tout accepter",
  "accepter les cookies",
  "alle akzeptieren",
  "cookies akzeptieren",
  "aceptar todas",
];

const AGE_TEXT = ["are you over 18", "verify your age", "enter your date of birth", "confirm your age"];

/**
 * Controls that spend money. A click on one of these is refused unless the
 * caller explicitly opts in — Claude can fill a basket and walk to the
 * checkout, but the button that charges a card belongs to the account holder.
 * Matching is on the element's accessible name, lowercased.
 */
const PURCHASE_PHRASES = [
  // English
  "place your order",
  "place order",
  "buy now",
  "buy it now",
  "pay now",
  "complete purchase",
  "complete order",
  "confirm and pay",
  "confirm order",
  "confirm payment",
  "submit order",
  "proceed to payment",
  "authorise payment",
  "authorize payment",
  "pay with",
  "subscribe and pay",
  // French (Decathlon, Amazon.fr, Cdiscount…)
  "passer la commande",
  "valider la commande",
  "commander et payer",
  "acheter maintenant",
  "payer maintenant",
  "confirmer le paiement",
  // German
  "jetzt kaufen",
  "kostenpflichtig bestellen",
  "zahlungspflichtig bestellen",
  "jetzt bezahlen",
  "bestellung abschicken",
  // Spanish / Italian / Dutch
  "comprar ahora",
  "realizar pedido",
  "confirmar pedido",
  "pagar ahora",
  "acquista ora",
  "procedi all'ordine",
  "conferma ordine",
  "nu kopen",
  "bestelling plaatsen",
  "afrekenen en betalen",
];

/** True when clicking this control would place an order or take a payment. */
export function isPurchaseControl(name: string): boolean {
  const n = name.toLowerCase().replace(/\s+/g, " ").trim();
  if (!n) return false;
  return PURCHASE_PHRASES.some((p) => n.includes(p));
}

/** Flag the money buttons in a snapshot so Claude sees the wall before it hits it. */
export function markPurchaseControls(elements: ElementRef[]): ElementRef[] {
  return elements.map((el) => (isPurchaseControl(el.name) ? { ...el, purchaseControl: true } : el));
}

function anyIn(haystack: string, needles: string[]): string | undefined {
  return needles.find((n) => haystack.includes(n));
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

/**
 * Is `url` inside the allowlist? An empty list means "no restriction".
 * Matching is on registrable-ish suffix boundaries: "amazon.de" covers
 * "www.amazon.de" and "smile.amazon.de" but never "notamazon.de".
 */
export function isDomainAllowed(url: string, allowed: string[]): boolean {
  if (allowed.length === 0) return true;
  const host = hostOf(url);
  if (!host) return false;
  return allowed.some((entry) => {
    const e = entry.trim().toLowerCase().replace(/^\.?(www\.)?/, "");
    if (!e) return false;
    return host === e || host.endsWith("." + e);
  });
}

/** Parse BROWSER_ALLOWED_DOMAINS ("amazon.de, decathlon.fr") into a list. */
export function parseAllowedDomains(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Decide what — if anything — is standing between Claude and the page.
 *
 * Ordering matters: a Cloudflare interstitial also contains the word "login"
 * on some sites, and reporting that as a login prompt sends the human to the
 * wrong place. Hard walls are classified first and the softer signals are only
 * considered when no wall fired.
 */
export function classifyBlockers(facts: PageFacts): Blocker[] {
  const text = facts.text.toLowerCase();
  const sels = new Set(facts.selectorsPresent);
  const frames = facts.iframeUrls.join(" ").toLowerCase();
  const out: Blocker[] = [];

  // 1. CAPTCHA — a widget is proof; the wording alone is only a strong hint.
  const captchaWidget =
    ["recaptcha", "hcaptcha", "turnstile", "arkose", "geetest", "amazonCaptcha"].find((k) => sels.has(k)) ??
    (/recaptcha|hcaptcha|turnstile|arkoselabs|funcaptcha|geetest|challenges\.cloudflare/.test(frames)
      ? "captcha iframe"
      : undefined);
  const captchaPhrase = anyIn(text, CAPTCHA_TEXT);
  if (captchaWidget || captchaPhrase) {
    out.push({
      kind: "captcha",
      confidence: captchaWidget ? "high" : "medium",
      evidence: captchaWidget ? `CAPTCHA widget on the page (${captchaWidget})` : `page says "${captchaPhrase}"`,
      humanAction:
        "Solve the CAPTCHA yourself in the browser window that is already open. " +
        "Claude will carry on from whatever page you land on — it will not touch the challenge.",
      blocking: true,
    });
  }

  // 2. Bot wall / WAF interstitial. Same handoff, different explanation.
  const wallPhrase = anyIn(text, BOT_WALL_TEXT);
  const forbidden = facts.status === 403;
  if (wallPhrase || forbidden) {
    out.push({
      kind: "bot-wall",
      confidence: wallPhrase && forbidden ? "high" : "medium",
      evidence: forbidden ? `HTTP ${facts.status} from ${hostOf(facts.url)}` : `page says "${wallPhrase}"`,
      humanAction:
        "The site is refusing automated access. Interact with the window yourself (scroll, click through the " +
        "interstitial, sign in if it asks), or open the page by hand and let Claude continue from there. " +
        "Do not try to route around this — if the site keeps refusing, use its app or API instead.",
      blocking: true,
    });
  }

  // 3. Rate limiting — worth naming separately because the fix is to wait.
  const ratePhrase = anyIn(text, RATE_LIMIT_TEXT);
  if (facts.status === 429 || (ratePhrase && out.length === 0)) {
    out.push({
      kind: "rate-limited",
      confidence: facts.status === 429 ? "high" : "medium",
      evidence: facts.status === 429 ? "HTTP 429" : `page says "${ratePhrase}"`,
      humanAction: "Wait a minute or two before the next request, and slow down how often Claude loads pages.",
      blocking: true,
    });
  }

  const walled = out.some((b) => b.blocking);

  // 4. One-time codes. Checked before the login rule: an OTP screen usually
  //    still says "sign in" somewhere, and "go get your phone" is the useful
  //    instruction, not "type your password".
  const otpPhrase = anyIn(text, OTP_TEXT);
  if (!walled && otpPhrase) {
    out.push({
      kind: "otp",
      confidence: "medium",
      evidence: `page says "${otpPhrase}"`,
      humanAction:
        "Enter the one-time code yourself — it is on your phone or in your email, and Claude has no access to either.",
      blocking: true,
    });
  }

  // 5. Login. A password box is the reliable signal; wording alone is not,
  //    because every shop header has a "Sign in" link on every page.
  if (!walled && !otpPhrase && facts.hasPasswordField) {
    out.push({
      kind: "login",
      confidence: "high",
      evidence: "a password field is on the page",
      humanAction:
        "Sign in yourself in the open browser window. Never give Claude the password — it does not need it, " +
        "and once you are signed in the session stays in this browser profile for next time.",
      blocking: true,
    });
  } else if (!walled && !otpPhrase && /\/(signin|login|auth|ap\/signin)/.test(facts.url) && anyIn(text, LOGIN_TEXT)) {
    out.push({
      kind: "login",
      confidence: "medium",
      evidence: "the URL and page text look like a sign-in screen",
      humanAction: "Sign in yourself in the open browser window; do not share the password with Claude.",
      blocking: true,
    });
  }

  // 6. Consent banner. Not blocking — the page is readable behind it — but it
  //    swallows clicks, and which button to press is the user's call, not ours.
  const consentWidget = ["onetrust", "usercentrics", "didomi", "cookiebot", "genericConsent"].find((k) => sels.has(k));
  const consentPhrase = anyIn(text, CONSENT_TEXT);
  if (consentWidget || consentPhrase) {
    out.push({
      kind: "cookie-consent",
      confidence: consentWidget ? "high" : "medium",
      evidence: consentWidget ? `consent dialog on the page (${consentWidget})` : `page says "${consentPhrase}"`,
      humanAction:
        "A cookie banner is covering the page. Ask the user whether to accept or reject, then call " +
        "browser_dismiss_consent with their choice — accepting tracking on someone's behalf is their decision.",
      blocking: false,
    });
  }

  // 7. Age gate.
  const agePhrase = anyIn(text, AGE_TEXT);
  if (sels.has("ageGate") || agePhrase) {
    out.push({
      kind: "age-gate",
      confidence: sels.has("ageGate") ? "high" : "medium",
      evidence: sels.has("ageGate") ? "age-gate element on the page" : `page says "${agePhrase}"`,
      humanAction: "The site is asking for a date of birth. The account holder should answer that themselves.",
      blocking: true,
    });
  }

  return out;
}

/** The blockers that stop the page being read or acted on. */
export function blockingOnly(blockers: Blocker[]): Blocker[] {
  return blockers.filter((b) => b.blocking);
}

/** One-line summary for logs and tool results. */
export function describeBlockers(blockers: Blocker[]): string {
  if (blockers.length === 0) return "none";
  return blockers.map((b) => `${b.kind} (${b.confidence}): ${b.evidence}`).join("; ");
}
