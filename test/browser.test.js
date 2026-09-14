/**
 * Tests for the browser connector's rules. Plain Node, no framework:
 *
 *   npm test
 *
 * Everything tested here is a pure function over page facts, so there is no
 * browser and no network in this file. These are the decisions that matter —
 * "is a human needed?" and "would this click spend money?" — and the cases
 * below are the ones that would quietly go wrong: a Cloudflare page read as a
 * login prompt, "notamazon.de" sneaking past an allowlist for "amazon.de", a
 * French checkout button that the English phrase list never sees.
 */
const assert = require("assert");
const {
  classifyBlockers,
  isPurchaseControl,
  isDomainAllowed,
  parseAllowedDomains,
  blockingOnly,
  markPurchaseControls,
  PROBES,
} = require("../dist/browser/guards");

let passed = 0;
const failures = [];
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log("  ok   " + name);
  } catch (err) {
    failures.push({ name, err });
    console.log("  FAIL " + name + "\n         " + err.message);
  }
}
function group(name) {
  console.log("\n" + name);
}

/** A blank page, overridden field by field per case. */
function facts(over) {
  return Object.assign(
    {
      url: "https://www.example.com/",
      title: "Example",
      text: "",
      iframeUrls: [],
      selectorsPresent: [],
      hasPasswordField: false,
    },
    over
  );
}
const kinds = (f) => classifyBlockers(f).map((b) => b.kind);

group("CAPTCHA detection");

test("a reCAPTCHA widget is a high-confidence captcha", () => {
  const b = classifyBlockers(facts({ selectorsPresent: ["recaptcha"] }));
  assert.strictEqual(b[0].kind, "captcha");
  assert.strictEqual(b[0].confidence, "high");
  assert.strictEqual(b[0].blocking, true);
});

test("a captcha iframe counts even with no matching selector", () => {
  const b = classifyBlockers(facts({ iframeUrls: ["https://challenges.cloudflare.com/turnstile/x"] }));
  assert.strictEqual(b[0].kind, "captcha");
});

test("Amazon's character captcha is recognised", () => {
  const b = classifyBlockers(
    facts({ url: "https://www.amazon.de/errors/validateCaptcha", text: "enter the characters you see below" })
  );
  assert.strictEqual(b[0].kind, "captcha");
});

test("wording alone is only medium confidence", () => {
  const b = classifyBlockers(facts({ text: "please verify you are human" }));
  assert.strictEqual(b[0].confidence, "medium");
});

test("non-English captcha wording is caught", () => {
  assert.ok(kinds(facts({ text: "veuillez prouvez que vous êtes humain" })).includes("captcha"));
  assert.ok(kinds(facts({ text: "bitte ich bin kein roboter anklicken" })).includes("captcha"));
});

test("an ordinary shop page has no blockers", () => {
  const b = classifyBlockers(
    facts({ url: "https://www.decathlon.fr/p/chaussures", text: "chaussures de running kiprun ks900 149,99 €" })
  );
  assert.deepStrictEqual(b, []);
});

group("Bot walls and rate limits");

test("HTTP 403 is a bot wall even with no telltale text", () => {
  assert.ok(kinds(facts({ status: 403 })).includes("bot-wall"));
});

test("Cloudflare's interstitial is a wall, not a login prompt", () => {
  // "Just a moment..." pages carry a sign-in link in the footer on some shops.
  // Reporting that as a login sends the user to type a password at a page that
  // has no password box — the wall has to win.
  const k = kinds(facts({ title: "Just a moment...", text: "just a moment... checking your browser. sign in", status: 403 }));
  assert.ok(k.includes("bot-wall"));
  assert.ok(!k.includes("login"));
});

test("HTTP 429 is reported as rate limiting, with waiting as the fix", () => {
  const b = classifyBlockers(facts({ status: 429 }));
  const rate = b.find((x) => x.kind === "rate-limited");
  assert.ok(rate);
  assert.match(rate.humanAction, /wait/i);
});

test("a captcha wall suppresses the softer login guess", () => {
  const k = kinds(facts({ selectorsPresent: ["recaptcha"], url: "https://www.amazon.de/ap/signin", text: "sign in" }));
  assert.ok(k.includes("captcha"));
  assert.ok(!k.includes("login"));
});

group("Logins and one-time codes");

test("a password field is a high-confidence login", () => {
  const b = classifyBlockers(facts({ hasPasswordField: true }));
  assert.strictEqual(b[0].kind, "login");
  assert.strictEqual(b[0].confidence, "high");
});

test("the login instruction never asks the user for their password", () => {
  const b = classifyBlockers(facts({ hasPasswordField: true }));
  assert.match(b[0].humanAction, /never give claude the password/i);
});

test("a sign-in URL without a password box is only a medium guess", () => {
  const b = classifyBlockers(facts({ url: "https://www.amazon.de/ap/signin", text: "sign in to your account" }));
  assert.strictEqual(b[0].kind, "login");
  assert.strictEqual(b[0].confidence, "medium");
});

test("a 'Sign in' link in a shop header is not a login screen", () => {
  // Every product page on every shop has these two words in its header.
  const k = kinds(facts({ url: "https://www.amazon.de/dp/B09XYZ", text: "hello, sign in account & lists 39,99 €" }));
  assert.deepStrictEqual(k, []);
});

test("an OTP screen asks for the phone, not for a password", () => {
  const b = classifyBlockers(
    facts({ url: "https://www.amazon.de/ap/signin", text: "enter the verification code we sent to your phone", hasPasswordField: true })
  );
  assert.strictEqual(b[0].kind, "otp");
  assert.ok(!b.some((x) => x.kind === "login"));
});

group("Consent banners and age gates");

test("a consent dialog is detected but does not block reading", () => {
  const b = classifyBlockers(facts({ selectorsPresent: ["onetrust"] }));
  assert.strictEqual(b[0].kind, "cookie-consent");
  assert.strictEqual(b[0].blocking, false);
  assert.deepStrictEqual(blockingOnly(b), []);
});

test("the consent instruction leaves the choice to the user", () => {
  const b = classifyBlockers(facts({ selectorsPresent: ["didomi"] }));
  assert.match(b[0].humanAction, /ask the user/i);
});

test("a consent banner is still reported alongside a login", () => {
  const k = kinds(facts({ hasPasswordField: true, selectorsPresent: ["cookiebot"] }));
  assert.deepStrictEqual(k.sort(), ["cookie-consent", "login"]);
});

test("an age gate blocks", () => {
  const b = classifyBlockers(facts({ text: "please verify your age to continue" }));
  assert.strictEqual(b[0].kind, "age-gate");
  assert.strictEqual(b[0].blocking, true);
});

group("The purchase guard");

test("English order buttons are blocked", () => {
  for (const label of ["Place your order", "Buy now", "Pay now", "Confirm and pay", "Submit order"]) {
    assert.ok(isPurchaseControl(label), label + " must be guarded");
  }
});

test("European checkout buttons are blocked too", () => {
  // Decathlon and Amazon's EU stores never say "place your order" in English.
  for (const label of [
    "Passer la commande",
    "Valider la commande",
    "Jetzt kaufen",
    "Zahlungspflichtig bestellen",
    "Comprar ahora",
    "Procedi all'ordine",
    "Bestelling plaatsen",
  ]) {
    assert.ok(isPurchaseControl(label), label + " must be guarded");
  }
});

test("case and stray whitespace do not get past the guard", () => {
  assert.ok(isPurchaseControl("  PLACE   YOUR\n ORDER  "));
});

test("getting as far as the basket is not guarded", () => {
  for (const label of ["Add to Basket", "Add to cart", "Proceed to checkout", "Ajouter au panier", "In den Einkaufswagen", "Save for later"]) {
    assert.ok(!isPurchaseControl(label), label + " must stay clickable");
  }
});

test("an empty label is not a purchase control", () => {
  assert.ok(!isPurchaseControl(""));
  assert.ok(!isPurchaseControl("   "));
});

test("snapshots flag the money buttons and leave the rest alone", () => {
  const marked = markPurchaseControls([
    { ref: "e1", kind: "button", name: "Add to Basket" },
    { ref: "e2", kind: "button", name: "Place your order" },
  ]);
  assert.strictEqual(marked[0].purchaseControl, undefined);
  assert.strictEqual(marked[1].purchaseControl, true);
});

group("Domain allowlist");

test("an empty list means no restriction", () => {
  assert.ok(isDomainAllowed("https://www.amazon.de/dp/X", []));
});

test("subdomains of an allowed domain are allowed", () => {
  assert.ok(isDomainAllowed("https://www.amazon.de/dp/X", ["amazon.de"]));
  assert.ok(isDomainAllowed("https://smile.amazon.de/", ["amazon.de"]));
});

test("a lookalike domain is not allowed", () => {
  // The whole point of the list: endsWith("amazon.de") alone would pass this.
  assert.ok(!isDomainAllowed("https://notamazon.de/", ["amazon.de"]));
  assert.ok(!isDomainAllowed("https://amazon.de.evil.com/", ["amazon.de"]));
});

test("a different shop is not allowed", () => {
  assert.ok(!isDomainAllowed("https://www.decathlon.fr/", ["amazon.de"]));
});

test("an unparseable URL is refused rather than waved through", () => {
  assert.ok(!isDomainAllowed("not a url", ["amazon.de"]));
});

test("the env list is parsed forgivingly", () => {
  assert.deepStrictEqual(parseAllowedDomains(" amazon.de , decathlon.fr ,, "), ["amazon.de", "decathlon.fr"]);
  assert.deepStrictEqual(parseAllowedDomains(undefined), []);
});

test("a www. prefix in the list still matches the bare domain", () => {
  assert.ok(isDomainAllowed("https://decathlon.fr/p/x", ["www.decathlon.fr"]));
});

group("Probe selectors");

test("every probe key the classifier looks for exists in PROBES", () => {
  // classifyBlockers matches on these names; a rename in one place and not the
  // other would silently stop detecting that widget.
  for (const key of [
    "recaptcha", "hcaptcha", "turnstile", "arkose", "geetest", "amazonCaptcha",
    "onetrust", "usercentrics", "didomi", "cookiebot", "genericConsent", "ageGate",
  ]) {
    assert.ok(PROBES[key], "missing probe: " + key);
  }
});

console.log(
  "\n" +
    (failures.length === 0
      ? `all ${passed} tests passed`
      : `${passed} passed, ${failures.length} FAILED`)
);
process.exit(failures.length === 0 ? 0 : 1);
