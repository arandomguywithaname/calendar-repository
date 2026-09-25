# Couponify — a Honey-style coupon finder website

A static coupon/promo-code site: search stores, filter by category, click
**Show code** to reveal + copy a code (and open the store), vote on whether a
code worked, and let visitors submit new codes. No build step, no dependencies.

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
| `coupons.js` | **Your stores and codes — edit this.** Ships with sample data only. |
| `netlify.toml` | Netlify config (no build, allows iframe embedding) |
| `squarespace-embed.html` | Snippet to paste into a Squarespace Code block |

## 1. Add your coupons

Open `coupons.js` in any text editor. Replace the sample stores (they all
point at `example.com`) with real stores and codes you've checked. Change
`siteName` and `tagline` at the top to rebrand. Expired codes (past
`expires`) are hidden automatically.

Preview locally by double-clicking `index.html`.

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
- If you use affiliate links in `url`, disclose that on your site as required
  by the FTC and the affiliate program.
