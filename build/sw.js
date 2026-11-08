// build/sw.js — the hosted site's service worker. build_html.js fills in the two
// placeholders below and writes the result to dist-hosted/sw.js.
//
// Its one job is to let the app open with no network: a phone on a music stand in a
// rehearsal room, started from its home-screen icon. It never makes the app staler
// than the network would:
//
//   the page      network first. Online, every visit gets the current index.html,
//                 exactly as without a worker; the cached copy is only the fallback.
//   assets/*      cache first. Every file there has a hash of its contents in its
//                 name (see deploy/_headers), so a cached one can never be out of date.
//   Google Fonts  cache first for the font files, refreshed in the background for
//                 the stylesheets. Without them the icon font falls back to words.
//   anything else (the info page, the download, images) is left to the browser.
//
// A deploy changes ASSETS, so this file's bytes change, so the browser installs the
// new worker, which takes over at once and drops the previous deploy's cache.

const VERSION = "__VERSION__";
/** The files index.html loads, relative to this worker. */
const ASSETS = __ASSETS__;

const CACHE = `ff-app-${VERSION}`;
const FONT_CACHE = "ff-fonts";
/** How long a page load waits on a slow network before using the cached page. */
const PAGE_TIMEOUT_MS = 3000;

const SCOPE = new URL("./", self.location.href);
const PAGE = SCOPE.href;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll([PAGE, ...ASSETS.map((asset) => new URL(asset, SCOPE).href)]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names.filter((name) => name.startsWith("ff-app-") && name !== CACHE).map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    if (request.mode === "navigate" && isAppPage(url)) event.respondWith(pageFromNetwork(request));
    else if (url.pathname.startsWith(`${SCOPE.pathname}assets/`)) event.respondWith(fromCache(request, CACHE));
    return;
  }
  // The page asks for its font stylesheets without CORS, and a response to that is
  // opaque: it cannot be told from an error page, so it should not be cached. Google
  // serves both hosts with CORS allowed, so ask that way instead.
  if (url.hostname === "fonts.gstatic.com") event.respondWith(fromCache(withCors(request), FONT_CACHE));
  else if (url.hostname === "fonts.googleapis.com") event.respondWith(refreshing(withCors(request), FONT_CACHE));
});

function withCors(request) {
  return new Request(request.url, { mode: "cors", credentials: "omit" });
}

/** The app's own page, whatever query string it was opened with. */
function isAppPage(url) {
  return url.pathname === SCOPE.pathname || url.pathname === `${SCOPE.pathname}index.html`;
}

async function pageFromNetwork(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(PAGE);
  try {
    const response = await withTimeout(fetch(request), cached ? PAGE_TIMEOUT_MS : 0);
    if (response.ok) await cache.put(PAGE, response.clone());
    return response;
  } catch (error) {
    if (cached) return cached;
    throw error;
  }
}

/** Cached if we have it; otherwise fetched, and kept for next time. */
async function fromCache(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

/** Cached at once if we have it, and fetched again behind it for next time. */
async function refreshing(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const fresh = fetch(request).then((response) => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  });
  if (!cached) return fresh;
  fresh.catch(() => {}); // offline: the cached copy is the answer
  return cached;
}

/** `promise`, or a rejection once `ms` has passed (0 = wait for as long as it takes). */
function withTimeout(promise, ms) {
  if (!ms) return promise;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timed out")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
