# Gravita Empresarial, S.L. — website

Plain HTML/CSS. No build step, no scripts, no cookies, nothing loaded from other servers.

| File | What it is |
|---|---|
| `index.html` | Home, About us, What we do, Contact |
| `aviso-legal.html` | Legal notice — paste the owner's text exactly, do not edit it |
| `style.css` | All styles |
| `favicon.svg` | Browser tab icon |
| `robots.txt` | Blocks search engines during the test phase |

## Before public launch
1. Replace the email and registered address in `index.html` (Contact).
2. Paste the aviso legal text into `aviso-legal.html`.
3. Remove `<meta name="robots" content="noindex, nofollow">` from both HTML files and delete `robots.txt`.

## Publish
Upload all files together to any static host (Cloudflare Pages, GitHub Pages, Namecheap). `index.html` must be at the top level.
