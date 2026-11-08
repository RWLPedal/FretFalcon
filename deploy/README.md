# Deploying fretfalcon.com

The site is two separate projects served from one domain:

| URL | Source |
|---|---|
| `/` | this repo — the hosted build target, `dist-hosted/`, from `build_html.js` |
| `/assets/*` | the app's content-hashed JS, CSS, favicon, web manifest and home-screen icons (part of `dist-hosted/`) |
| `/sw.js` | the app's service worker (part of `dist-hosted/`), which lets the installed app open offline |
| `/download/fretfalcon.html` | the app's single-file build (`dist/index.html`), served as a download |
| `/info/` | `../FretFalcon_info` — an Astro site built with `base: '/info'` |
| `/welcome.html` | 301 → `/info/` (where the info page lived before 2026-07-26) |

`build_site.mjs` builds both and merges them into `site/`, a plain static
directory with no server requirements. Copy it anywhere, or let the Netlify
scripts ship it.

## Commands

Run these from the repo root, not from here.

```bash
npm run site
```
Build both projects and assemble `deploy/site/`. Add `--skip-build` to reassemble
from the existing build outputs, or `--install` to `npm ci` first.

```bash
npm run site:serve
```
Build, then serve `deploy/site/` at http://localhost:5292 and open it. This is
the real artifact, not a dev server: `_redirects` and `_headers` rules apply, and
every request is logged so a broken asset path shows up as a red 404 rather than
a silently missing image.

## Caching

The app's `index.html` is a few KB that name the current files under `/assets/`.
Each of those has a hash of its own contents in its filename, so:

- `/assets/*` is served `immutable` with a one-year lifetime. A browser that has
  a file never asks for it again.
- `/` is served `max-age=0, must-revalidate`. Every visit costs one conditional
  request, answered with a 304 unless there has been a deploy.
- A deploy that changes only CSS produces a new `style.<hash>.css` and a new
  `index.html`; the JS keeps its name and stays cached.

To see it locally, run `npm run site:serve` and reload the page: the log shows a
single `304 GET /` and no requests under `/assets/`. `node deploy/serve.mjs
--no-cache` turns all of this off.

Two rules keep this safe:

- Nothing without a content hash may be added under `/assets/`. `build_html.js`
  fails the build if `index.html` loads anything that isn't hashed.
- Never add a catch-all rewrite to `index.html`. A missing asset must stay a 404,
  not become HTML that is cached for a year under a `.js` URL.

The app loads everything up front. If it ever lazy-loads chunks, a tab left open
across a deploy will ask for files the deploy removed, and will need to catch the
failed import and reload.

## The installed app

The hosted build can be added to a phone's home screen: `index.html` links a web
manifest and icons (hashed, under `/assets/`), and registers `/sw.js`. The single-file
download has none of this — a file opened from disk cannot be installed.

`sw.js` exists so the installed app opens without a network. It is written to never
make the site staler than it would be without it:

- The page is fetched from the **network first**; the copy it keeps is only used when
  that fails (or takes more than three seconds). A deploy reaches an online visitor
  exactly as before.
- `/assets/*` is answered from its cache — safe for the same reason the files are
  `immutable`: a name is a hash of its contents.
- Google Fonts are kept after first use (the icons are a font; without it they fall
  back to words).
- Everything else — `/info/`, the download, images — is not touched.

Each build bakes the list of `index.html`'s files into `sw.js`, so a deploy changes
the worker, the browser installs the new one, and it drops the previous deploy's
cache. `sw.js` is the one unhashed script on the site, and `_headers` makes it
revalidate; do not give it a long cache lifetime. To take offline support away, stop
registering it (`ts/core/offline.ts`) and ship a `sw.js` that unregisters itself — do
not simply delete the file, or phones that have it keep running the old one.

A host that does not read `_headers` needs the same rules set its own way —
`/assets/*` immutable, `/`, `/index.html` and `/sw.js` revalidated — and must serve
`.webmanifest` as `application/manifest+json`.

The icons are drawn from `favicon.svg` by `npm run icons` and committed
(`images/icons/`); re-run it only if the logo or its colours change.

### Check on a phone

The automated tests run in emulated Chromium. They cannot hold a phone, and iOS Safari
is the browser most likely to differ, so after a deploy that touches the mobile layout
— on the draft URL from `npm run deploy:preview`, which is HTTPS like production
(installing, the wake lock and the service worker all need that) — it is worth five
minutes on a real iPhone:

1. **Install.** Share → Add to Home Screen. The icon is the falcon on cream, the name
   "FretFalcon"; opened from there it has no Safari bars, and the top bar and tab bar
   sit clear of the notch and the home indicator, upright and on its side.
2. **Offline.** Open it once, switch on Airplane Mode, close and reopen: the app
   loads, with its icons (not words like `play_arrow`).
3. **Screen stays on.** Start the metronome and leave the phone alone for longer than
   its auto-lock time. Stop it: the screen may sleep again. (iOS 16.4+; inside the
   installed app, iOS 18.4+.)
4. **No zoom.** Tap a dropdown and a text field (a schedule interval's name): the page
   must not zoom in. Tap a tempo stepper quickly several times: no double-tap zoom.
5. **Gestures.** Swipe sideways in a panel to change tab — in Safari, not from the very
   edge of the screen, which is Safari's own Back. Long-press a tab and drag it to
   reorder. Drag a schedule row by its handle. On an iPad held upright, drag the
   divider between the two panes.

```bash
npm run deploy:preview   # Netlify draft URL
npm run deploy           # production
```
One-time setup: `npx netlify login`, then `npx netlify link` in the repo root.

## Notes

- `site/` is wiped on every build. The app's assets and the info CSS are
  content-hashed, so reusing the directory would accumulate orphaned files.
- `_redirects` and `_headers` ship *inside* the artifact rather than living in
  `netlify.toml`, so the same rules apply to local preview, draft deploys, prod,
  and any non-Netlify host that reads them.
- The root `robots.txt` is written here, not by either project's build — it's the
  only place that knows about both sitemaps.
- `FRETFALCON_INFO_DIR` overrides where the info project is found (default:
  `../FretFalcon_info`).
- Absolute `https://fretfalcon.com` URLs are baked into both builds (canonical,
  og:image, sitemaps), so a draft deploy's own URL will show production links in
  its metadata. That's expected; only the origin differs.
