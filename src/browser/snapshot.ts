import { PROBES, blockingOnly, classifyBlockers, markPurchaseControls } from "./guards";
import { lastStatus } from "./session";
import { Blocker, ElementRef, Page, PageFacts, ProductInfo, Snapshot } from "./types";

/**
 * Reading the page: what is on it, what can be clicked, and what is in the way.
 *
 * Interactive elements are tagged in the DOM with `data-cc-ref="e12"` and
 * handed back as short refs. Claude then acts on `[data-cc-ref="e12"]`, which
 * survives re-querying and React re-renders in a way that a captured element
 * handle does not. Tags are cleared and re-issued on every snapshot, so refs
 * are only valid until the next one — the tools say so in their descriptions.
 */

const MAX_ELEMENTS = 150;
const MAX_TEXT = 12000;

/** Attribute used for refs; also the thing to strip before screenshotting. */
export const REF_ATTR = "data-cc-ref";

/** Collect the blocker signals in one pass, so classification stays pure. */
async function readFacts(page: Page): Promise<PageFacts> {
  const raw = await page.evaluate(
    ({ probes, maxText }: { probes: Record<string, string>; maxText: number }) => {
      const present: string[] = [];
      for (const key of Object.keys(probes)) {
        try {
          if (document.querySelector(probes[key])) present.push(key);
        } catch {
          // A selector the browser dislikes should never take the page down.
        }
      }
      const iframeUrls: string[] = [];
      document.querySelectorAll("iframe").forEach((f) => {
        const src = f.getAttribute("src");
        if (src) iframeUrls.push(src);
      });
      const body = document.body ? document.body.innerText || "" : "";
      return {
        title: document.title || "",
        text: body.replace(/\s+/g, " ").trim().slice(0, maxText),
        iframeUrls,
        selectorsPresent: present,
        hasPasswordField: !!document.querySelector("input[type='password']"),
      };
    },
    { probes: PROBES, maxText: MAX_TEXT }
  );

  return { url: page.url(), status: lastStatus(), ...raw };
}

/** What is standing between Claude and this page right now. */
export async function detectBlockers(page: Page): Promise<Blocker[]> {
  return classifyBlockers(await readFacts(page));
}

/** Tag every visible interactive element and describe it. */
async function readElements(page: Page): Promise<{ elements: ElementRef[]; truncated: boolean }> {
  return page.evaluate(
    ({ attr, max }: { attr: string; max: number }) => {
      const isVisible = (el: Element): boolean => {
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) return false;
        const s = window.getComputedStyle(el);
        if (s.visibility === "hidden" || s.display === "none") return false;
        return Number(s.opacity) >= 0.05;
      };
      const nameOf = (el: any): string => {
        const candidates = [
          el.getAttribute("aria-label"),
          el.getAttribute("placeholder"),
          el.getAttribute("title"),
          el.getAttribute("alt"),
          el.tagName === "INPUT" && el.type !== "password" ? el.value : "",
          el.innerText,
          el.getAttribute("value"),
          el.getAttribute("name"),
        ];
        for (const c of candidates) {
          if (c && String(c).trim()) return String(c).replace(/\s+/g, " ").trim().slice(0, 140);
        }
        return "";
      };

      document.querySelectorAll("[" + attr + "]").forEach((el) => el.removeAttribute(attr));

      const selector =
        "a[href], button, input, select, textarea, summary, " +
        "[role='button'], [role='link'], [role='tab'], [role='checkbox'], [role='radio'], [role='menuitem']";
      const found = Array.from(document.querySelectorAll(selector));
      const elements: any[] = [];
      let truncated = false;
      let n = 0;

      for (const el of found) {
        if (elements.length >= max) {
          truncated = true;
          break;
        }
        const any = el as any;
        if (any.disabled) continue;
        if (any.type === "hidden") continue;
        if (!isVisible(el)) continue;

        const ref = "e" + ++n;
        el.setAttribute(attr, ref);
        const tag = el.tagName.toLowerCase();
        const kind = tag === "input" ? "input:" + (any.getAttribute("type") || "text") : tag;
        const entry: any = { ref, kind, name: nameOf(any) };
        if (tag === "a") {
          const href = any.getAttribute("href");
          if (href) entry.href = String(href).slice(0, 300);
        }
        if (any.type === "checkbox" || any.type === "radio") entry.checked = !!any.checked;
        elements.push(entry);
      }
      return { elements, truncated };
    },
    { attr: REF_ATTR, max: MAX_ELEMENTS }
  );
}

/** Visible page text, collapsed and capped. */
export async function readText(page: Page, limit = MAX_TEXT): Promise<string> {
  return page.evaluate((max: number) => {
    const body = document.body ? document.body.innerText || "" : "";
    return body.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, max);
  }, limit);
}

/** Full picture of the current page: blockers, clickable refs, optional text. */
export async function snapshot(page: Page, withText: boolean): Promise<Snapshot> {
  const facts = await readFacts(page);
  const blockers = classifyBlockers(facts);
  // No point enumerating buttons on a Cloudflare interstitial — the only useful
  // answer there is "a human needs to look at this".
  if (blockingOnly(blockers).some((b) => b.kind === "captcha" || b.kind === "bot-wall")) {
    return {
      url: facts.url,
      title: facts.title,
      status: facts.status,
      blockers,
      elements: [],
      truncated: false,
      text: facts.text.slice(0, 1500),
    };
  }
  const { elements, truncated } = await readElements(page);
  return {
    url: facts.url,
    title: facts.title,
    status: facts.status,
    blockers,
    elements: markPurchaseControls(elements),
    truncated,
    text: withText ? await readText(page) : undefined,
  };
}

/** Refs whose name or href contains `query` — cheaper than a full snapshot. */
export async function findElements(page: Page, query: string, limit: number): Promise<ElementRef[]> {
  const { elements } = await readElements(page);
  const q = query.toLowerCase();
  const hit = elements.filter((e) => e.name.toLowerCase().includes(q) || (e.href || "").toLowerCase().includes(q));
  return markPurchaseControls(hit.slice(0, limit));
}

/** The Playwright locator for a ref handed out by the last snapshot. */
export function locator(page: Page, ref: string): any {
  if (!/^e\d+$/.test(ref)) {
    throw new Error(`"${ref}" is not an element ref. Refs look like "e12" and come from browser_snapshot or browser_find.`);
  }
  return page.locator(`[${REF_ATTR}="${ref}"]`);
}

/**
 * Products as the site itself publishes them — JSON-LD, schema.org microdata
 * and OpenGraph tags, the same data it hands to search engines. No scraping of
 * private pages and no guessing from CSS classes that change every Tuesday.
 */
export async function extractProducts(page: Page, limit: number): Promise<ProductInfo[]> {
  const found: ProductInfo[] = await page.evaluate(() => {
    const out: any[] = [];
    const str = (v: any): string | undefined => {
      if (v === null || v === undefined) return undefined;
      if (typeof v === "string" || typeof v === "number") return String(v).trim().slice(0, 300) || undefined;
      if (Array.isArray(v)) return str(v[0]);
      if (typeof v === "object") return str(v.name ?? v["@id"] ?? v.value ?? v.url);
      return undefined;
    };

    const fromProduct = (node: any, source: string) => {
      const offers = Array.isArray(node.offers) ? node.offers[0] : node.offers;
      const rating = node.aggregateRating || {};
      const name = str(node.name);
      if (!name) return;
      out.push({
        name,
        price: str(offers?.price ?? offers?.lowPrice),
        currency: str(offers?.priceCurrency),
        availability: str(offers?.availability)?.replace("https://schema.org/", ""),
        rating: str(rating.ratingValue),
        reviewCount: str(rating.reviewCount ?? rating.ratingCount),
        url: str(node.url ?? offers?.url),
        image: str(node.image),
        source,
      });
    };

    // Walk JSON-LD, including @graph containers and ItemList pages.
    const visit = (node: any, depth: number) => {
      if (!node || typeof node !== "object" || depth > 6) return;
      if (Array.isArray(node)) {
        node.forEach((n) => visit(n, depth + 1));
        return;
      }
      const type = node["@type"];
      const types = Array.isArray(type) ? type : [type];
      if (types.includes("Product")) fromProduct(node, "json-ld");
      if (node["@graph"]) visit(node["@graph"], depth + 1);
      if (node.itemListElement) visit(node.itemListElement, depth + 1);
      if (node.item) visit(node.item, depth + 1);
    };

    document.querySelectorAll('script[type="application/ld+json"]').forEach((s) => {
      try {
        visit(JSON.parse(s.textContent || "{}"), 0);
      } catch {
        // Malformed JSON-LD is common in the wild; skip it quietly.
      }
    });

    // schema.org microdata.
    document.querySelectorAll('[itemtype*="schema.org/Product"]').forEach((scope) => {
      const prop = (n: string) => {
        const el = scope.querySelector(`[itemprop="${n}"]`) as any;
        if (!el) return undefined;
        const v = el.getAttribute("content") || el.getAttribute("href") || el.innerText;
        return v ? String(v).replace(/\s+/g, " ").trim().slice(0, 300) : undefined;
      };
      const name = prop("name");
      if (name) {
        out.push({
          name,
          price: prop("price"),
          currency: prop("priceCurrency"),
          availability: prop("availability"),
          rating: prop("ratingValue"),
          reviewCount: prop("reviewCount"),
          url: prop("url") || location.href,
          image: prop("image"),
          source: "microdata",
        });
      }
    });

    // OpenGraph product tags — the fallback on a single product page.
    if (out.length === 0) {
      const meta = (p: string) => {
        const el = document.querySelector(`meta[property="${p}"], meta[name="${p}"]`);
        return el?.getAttribute("content")?.trim() || undefined;
      };
      const name = meta("og:title");
      const price = meta("product:price:amount") || meta("og:price:amount");
      if (name && price) {
        out.push({
          name,
          price,
          currency: meta("product:price:currency") || meta("og:price:currency"),
          availability: meta("product:availability"),
          url: meta("og:url") || location.href,
          image: meta("og:image"),
          source: "og",
        });
      }
    }
    return out;
  });

  // The same product often appears in JSON-LD and microdata on one page.
  const seen = new Set<string>();
  const unique: ProductInfo[] = [];
  for (const p of found) {
    const key = `${p.name}|${p.price ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(p);
    if (unique.length >= limit) break;
  }
  return unique;
}

/**
 * The banner shown to the person at the keyboard while Claude waits for them.
 * Deliberately loud and deliberately in the page itself — a log line in a
 * terminal the user is not looking at is not a handoff.
 */
export async function showHandoffBanner(page: Page, message: string): Promise<void> {
  await page
    .evaluate((text: string) => {
      document.getElementById("__cc_handoff")?.remove();
      const bar = document.createElement("div");
      bar.id = "__cc_handoff";
      bar.textContent = "Claude needs you: " + text;
      bar.style.cssText = [
        "position:fixed",
        "top:0",
        "left:0",
        "right:0",
        "z-index:2147483647",
        "background:#d97706",
        "color:#fff",
        "font:600 15px/1.4 system-ui,-apple-system,sans-serif",
        "padding:12px 16px",
        "text-align:center",
        "box-shadow:0 2px 8px rgba(0,0,0,.3)",
        "pointer-events:none",
      ].join(";");
      document.body.appendChild(bar);
    }, message)
    .catch(() => undefined);
}

export async function hideHandoffBanner(page: Page): Promise<void> {
  await page.evaluate(() => document.getElementById("__cc_handoff")?.remove()).catch(() => undefined);
}
