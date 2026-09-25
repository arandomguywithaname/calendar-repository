/*
 * Affiliate network coupon feeds -> one list of offers.
 *
 * Each network is used only when its environment variables are set
 * (Netlify: Site configuration -> Environment variables). Every offer comes
 * back in the same shape the site uses:
 *   { store, category, code, title, details, url, expires, network }
 * where `url` is YOUR affiliate tracking link, so sales are credited to you.
 */

// Netlify stops a function after 10 seconds, so all networks together get 8.
const BUDGET_MS = 8000;
const MAX_PAGES = 5;

/** Today's date as YYYY-MM-DD (UTC). */
export function today() {
  return new Date().toISOString().slice(0, 10);
}

/** First YYYY-MM-DD found in a date string, or "" if none. */
export function isoDate(v) {
  const m = /(\d{4}-\d{2}-\d{2})/.exec(String(v || ""));
  return m ? m[1] : "";
}

/** Best-guess site category from a network's category text. */
export function guessCategory(text) {
  const t = String(text || "").toLowerCase();
  if (/cloth|apparel|fashion|shoe|accessor|jewel/.test(t)) return "Clothing";
  if (/beauty|cosmetic|fragrance|skin|makeup|health/.test(t)) return "Beauty";
  if (/electronic|computer|tech|phone|software|gaming/.test(t)) return "Electronics";
  if (/home|garden|furniture|kitchen|decor|tools/.test(t)) return "Home";
  if (/travel|hotel|flight|airline|car rental|vacation/.test(t)) return "Travel";
  return "Other";
}

/** Escape text so it can sit inside XML (used to neutralize CDATA sections). */
function xmlEscape(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Plain text of an XML element body: inner tags removed, entities decoded, HTML dropped. */
function xmlText(s) {
  return String(s || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&")
    .replace(/<[^>]+>/g, " ") // HTML that was inside CDATA or escaped
    .replace(/\s+/g, " ")
    .trim();
}

/** Pull each <tag>...</tag> record out of a flat XML feed as { childTag: text }. */
export function xmlRecords(xml, tag) {
  const out = [];
  const re = new RegExp("<" + tag + "(?:\\s[^>]*)?>([\\s\\S]*?)</" + tag + ">", "g");
  let m;
  while ((m = re.exec(xml))) {
    const rec = {};
    // CDATA may contain "<" and ">"; escape it first so it can't confuse the tag matching.
    const body = m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_, t) => xmlEscape(t));
    const child = /<([A-Za-z][\w-]*)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/g;
    let c;
    while ((c = child.exec(body))) {
      rec[c[1]] = rec[c[1]] ? rec[c[1]] + ", " + xmlText(c[2]) : xmlText(c[2]);
    }
    out.push(rec);
  }
  return out;
}

/** An XML attribute value on the root-ish element, e.g. total-matched="123". */
function xmlAttr(xml, name) {
  const m = new RegExp(name + '="(\\d+)"').exec(xml);
  return m ? +m[1] : 0;
}

/** Fetch a URL as text, giving up at `deadline` (including a slow body). */
async function get(fetchImpl, url, init, deadline) {
  const left = deadline - Date.now();
  if (left < 500) throw new Error("timed out");
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(new Error("timed out")), left);
  try {
    const res = await fetchImpl(url, { ...init, signal: ac.signal });
    const body = await res.text();
    if (!res.ok) throw new Error("HTTP " + res.status + ": " + body.slice(0, 200).replace(/\s+/g, " "));
    return body;
  } finally {
    clearTimeout(timer);
  }
}

// --- Awin ---------------------------------------------------------------------
// POST https://api.awin.com/publisher/{publisherId}/promotions  (Offers API)

export async function awin(env, fetchImpl = fetch, deadline = Date.now() + BUDGET_MS) {
  const id = env.AWIN_PUBLISHER_ID, token = env.AWIN_API_TOKEN;
  if (!id || !token) return null;
  const regions = String(env.AWIN_REGIONS || "US").split(",").map((r) => r.trim().toUpperCase()).filter(Boolean);
  const offers = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const body = await get(fetchImpl, "https://api.awin.com/publisher/" + encodeURIComponent(id) + "/promotions", {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        filters: { membership: "joined", status: "active", type: "all", regionCodes: regions },
        pagination: { page, pageSize: 200 }
      })
    }, deadline).catch(pageError(page, offers));
    if (body === null) break;
    const json = JSON.parse(body);
    for (const p of json.data || []) {
      offers.push({
        store: p.advertiser && p.advertiser.name,
        category: "",
        code: (p.voucher && p.voucher.code) || "",
        title: p.title || "",
        details: [p.description, p.terms].filter(Boolean).join(" "),
        url: p.urlTracking || "",
        expires: isoDate(p.endDate),
        network: "Awin"
      });
    }
    const pg = json.pagination || {};
    if (!pg.total || page * (pg.pageSize || 200) >= pg.total) break;
  }
  return offers;
}

// --- CJ -----------------------------------------------------------------------
// GET https://link-search.api.cj.com/v2/link-search  (Link Search API, XML)

export async function cj(env, fetchImpl = fetch, deadline = Date.now() + BUDGET_MS) {
  const site = env.CJ_WEBSITE_ID, token = env.CJ_API_TOKEN;
  if (!site || !token) return null;
  const offers = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const qs = new URLSearchParams({
      "website-id": site, "advertiser-ids": "joined", "promotion-type": "coupon",
      "records-per-page": "100", "page-number": String(page)
    });
    const xml = await get(fetchImpl, "https://link-search.api.cj.com/v2/link-search?" + qs, {
      headers: { Authorization: "Bearer " + token }
    }, deadline).catch(pageError(page, offers));
    if (xml === null) break;
    const links = xmlRecords(xml, "link");
    for (const l of links) {
      offers.push({
        store: l["advertiser-name"],
        category: guessCategory(l.category),
        code: l["coupon-code"] || "",
        title: l["link-name"] || "",
        details: l.description || "",
        url: l.clickUrl || "",
        expires: isoDate(l["promotion-end-date"]),
        network: "CJ"
      });
    }
    const total = xmlAttr(xml, "total-matched");
    if (!links.length || page * 100 >= total) break;
  }
  return offers;
}

// --- Rakuten Advertising ------------------------------------------------------
// Token: POST https://api.linksynergy.com/token
// Feed:  GET  https://api.linksynergy.com/coupon/1.0  (Coupon Feed API, XML)

export async function rakuten(env, fetchImpl = fetch, deadline = Date.now() + BUDGET_MS) {
  const key = env.RAKUTEN_TOKEN_KEY, sid = env.RAKUTEN_SID;
  if (!key || !sid) return null;
  const tokenBody = await get(fetchImpl, "https://api.linksynergy.com/token", {
    method: "POST",
    headers: { Authorization: "Bearer " + key, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", scope: sid }).toString()
  }, deadline);
  const access = JSON.parse(tokenBody).access_token;
  if (!access) throw new Error("no access_token in token response");
  const offers = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const qs = new URLSearchParams({ network: env.RAKUTEN_NETWORK || "1", resultsperpage: "500", pagenumber: String(page) });
    const xml = await get(fetchImpl, "https://api.linksynergy.com/coupon/1.0?" + qs, {
      headers: { Authorization: "Bearer " + access, Accept: "application/xml" }
    }, deadline).catch(pageError(page, offers));
    if (xml === null) break;
    for (const l of xmlRecords(xml, "link")) {
      offers.push({
        store: l.advertisername,
        category: guessCategory(l.categories),
        code: l.couponcode || "",
        title: l.offerdescription || "",
        details: l.couponrestriction || "",
        url: l.clickurl || "",
        expires: isoDate(l.offerenddate),
        network: "Rakuten"
      });
    }
    const pages = +(/<TotalPages>(\d+)<\/TotalPages>/i.exec(xml) || [])[1] || 1;
    if (page >= pages) break;
  }
  return offers;
}

/**
 * Error handler for page requests: a failure on page 1 fails the network, but
 * a failure on a later page keeps the offers already collected (marked partial).
 */
function pageError(page, offers) {
  return (err) => {
    if (page === 1) throw err;
    offers.partial = String(err && err.message || err).slice(0, 200);
    return null;
  };
}

export const NETWORKS = { Awin: awin, CJ: cj, Rakuten: rakuten };

/**
 * Fetch every configured network in parallel. One network failing never
 * blocks the others; its error is reported in `networks`.
 */
export async function collectOffers(env, fetchImpl = fetch, budgetMs = BUDGET_MS) {
  const deadline = Date.now() + budgetMs;
  const networks = {};
  const all = [];
  await Promise.all(Object.entries(NETWORKS).map(async ([name, fn]) => {
    try {
      const offers = await fn(env, fetchImpl, deadline);
      if (offers === null) { networks[name] = { configured: false }; return; }
      networks[name] = { configured: true, ok: true, count: offers.length };
      if (offers.partial) networks[name].partial = "stopped early: " + offers.partial;
      all.push(...offers);
    } catch (err) {
      networks[name] = { configured: true, ok: false, error: String(err && err.message || err).slice(0, 300) };
    }
  }));
  return { networks, offers: cleanOffers(all) };
}

/** Drop broken, expired, non-https and duplicate offers; cap the list size. */
export function cleanOffers(list, max = 1500) {
  const now = today();
  const seen = new Set();
  const out = [];
  for (const o of list) {
    const store = String(o.store || "").trim();
    const url = String(o.url || "").trim();
    if (!store || !/^https:\/\//i.test(url)) continue;
    if (o.expires && o.expires < now) continue;
    const code = String(o.code || "").trim().slice(0, 60);
    const key = store.toLowerCase() + "|" + (code || url);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      store: store.slice(0, 80),
      category: o.category || "Other",
      code,
      title: String(o.title || "").trim().slice(0, 140) || (code ? "Promo code" : "Deal"),
      details: String(o.details || "").trim().replace(/\s+/g, " ").slice(0, 300),
      url,
      expires: o.expires || "",
      network: o.network
    });
    if (out.length >= max) break;
  }
  return out;
}
