# Couponify — a Honey-style coupon finder website

A coupon and deals site for 24 real US stores (Amazon, Target, Walmart, Best
Buy, Nike, Sephora, Home Depot, Expedia and more). Visitors search or filter,
click **Get deal** to open the store's own official deals page, or **Show code**
to reveal and copy a promo code. They can vote on whether an offer worked and
submit new codes. No build step, no dependencies.

> Honey itself is a browser *extension* that auto-applies codes on other
> stores' checkout pages. A website (Netlify / Squarespace) can't do that, so
> this is the "coupon directory" half of Honey: visitors find a code here, it's
> copied to their clipboard, and they paste it at checkout.

## Files

| File | What it is |
|---|---|
| `index.html` | The page |
| `styles.css` | Styling (auto light/dark mode) |
| `app.js` | Search, filters, copy-to-clipboard, votes, submit form |
| `coupons.js` | **Your stores, deals and codes. Edit this file.** |
| `_headers` | Netlify settings (allows embedding on Squarespace) |
| `squarespace-embed.html` | Snippet to paste into a Squarespace Code block |

## 1. Keep the offers current

`coupons.js` ships with **real stores**. Every link goes to that store's
own official deals or coupons page (checked September 2026). Those pages
show whatever the store is running today, so they stay useful.

It also has one promo code the store published itself: Ulta's `FRAG15`
(15% off fragrance), which ends **Sept 28, 2026** and then hides itself.
Any offer with an `expires` date disappears automatically once that date passes.

To add a code, open `coupons.js` in any text editor and add a line under the store:

```js
{ code: "SAVE20", title: "20% off sitewide", details: "Ends Sunday.", expires: "2026-10-05" },
```

To add a deal link (no code), use `url` instead of `code`:

```js
{ title: "Weekend sale", details: "Up to 40% off.", url: "https://www.example-store.com/sale" },
```

Only add `verified: true` to a code you've actually used at checkout. Good
places to find real codes are the stores' own coupons pages (linked in
the app), their email and text sign-ups, and affiliate networks such as
Impact, CJ, Rakuten or Awin. Once you're approved as a publisher, those
networks give you official code feeds and pay you commission.

Change `siteName` and `tagline` at the top to rebrand. Preview locally by
double-clicking `index.html`.

## 2. Publish to Netlify

1. Go to <https://app.netlify.com/drop>.
2. Unzip `couponify.zip`, then drag the resulting **folder** (the one containing `index.html`) onto the page.
3. Netlify gives you a URL like `https://random-name-123.netlify.app`.
   Rename it under *Site configuration → Change site name*.

To update later: *Deploys* tab → drag the folder in again.

**Code submissions:** the "Know a code we don't?" form uses Netlify Forms.
Enable it under *Forms → Enable form detection*, then redeploy. Submissions
appear in the Netlify dashboard (and can be emailed to you under
*Forms → Form notifications*).

## 3. Put it on Squarespace

**Option A — embed on a page (recommended)**
1. In Squarespace, edit a page → **+** → **Code** block.
2. Paste the contents of `squarespace-embed.html`.
3. Replace `YOUR-SITE.netlify.app` with your Netlify address. Save.

(Code blocks with scripts/iframes need a Squarespace Core plan or higher.)

**Option B — link or custom domain**
- Add a navigation link (*Pages → + → Link*) pointing to your Netlify URL, or
- Point a subdomain such as `deals.yourdomain.com` at Netlify
  (Netlify: *Domain management → Add domain*; Squarespace: *Domains → DNS
  settings* → add the CNAME Netlify shows you).

## Notes

- "Did it work?" votes are saved only in each visitor's own browser.
- If you swap in affiliate links, disclose that on your site as required by
  the FTC and the affiliate program.
- The site uses store names only, with no logos, and says it isn't affiliated
  with the stores. Keep it that way unless you have permission.
- Links point at US store sites. For another country, change the URLs in
  `coupons.js` to that country's store sites.
