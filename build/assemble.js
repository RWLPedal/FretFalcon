// build/assemble.js
// Turns the root index.html into either build target. Shared by build_html.js (the
// production builds) and ts/webpack.config.js (the `npm run dev:single` dev server),
// so the single-file page is assembled by the same code in dev and in production.
//
//   single — JS, CSS and favicon inlined: one self-contained, downloadable file
//   hosted — the same tags pointed at content-hashed files under assets/
//
// Only the hosted target can be installed as an app, so only it gets the web
// manifest, the home-screen icons and the service worker (build/sw.js).
//
// The root index.html is deliberately left as a plain, directly servable page (it is
// what `npm start` and .claude/preview-server.js serve). The tags below are located
// by exact text, and a tag that can't be found is an error rather than a silent no-op:
// a "single file" that still points at ./js/reference_bundle.js looks fine until
// someone opens the download offline.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

const MARKERS = {
  favicon: '<link rel="icon" type="image/svg+xml" href="favicon.svg">',
  themeCss: '<link rel="stylesheet" href="style/theme-tokens.css">',
  mainCss: '<link rel="stylesheet" href="style/style.css">',
  script: '<script src="./js/reference_bundle.js" defer></script>',
  manifest: '<link rel="manifest" href="manifest.webmanifest">',
  touchIcon: '<link rel="apple-touch-icon" href="images/icons/apple-touch-icon.png">',
};

// The icon the page itself links (iOS reads it from the page, not the manifest).
const TOUCH_ICON = 'images/icons/apple-touch-icon.png';

// Length of the hash in hosted filenames. Must match [contenthash:N] in
// ts/webpack.config.js so every file under assets/ follows one naming rule.
const HASH_LENGTH = 10;
const HASHED_ASSET = new RegExp(`^assets/[\\w.-]+\\.[0-9a-f]{${HASH_LENGTH}}\\.\\w+$`);

function readTemplate() {
  return fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
}

function readFavicon() {
  return fs.readFileSync(path.join(ROOT, 'favicon.svg'));
}

function readManifest() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.webmanifest'), 'utf8'));
}

function contentHash(content) {
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, HASH_LENGTH);
}

// A function replacer, because a replacement *string* gives `$&`, `$'` and `$$`
// special meaning — and minified JS is full of `$`.
function swap(html, marker, replacement) {
  if (!html.includes(marker)) {
    throw new Error(`assemble: index.html no longer contains the expected tag:\n  ${marker}`);
  }
  return html.replace(marker, () => replacement);
}

function resolveCSS(filePath) {
  const dir = path.dirname(filePath);
  const css = fs.readFileSync(filePath, 'utf8');
  return css.replace(/@import url\(['"]?([^'")\s]+)['"]?\);/g, (match, importPath) => {
    if (importPath.startsWith('http')) return match;
    return resolveCSS(path.join(dir, importPath));
  });
}

// theme-tokens.css + style.css (and everything it @imports) as one stylesheet, in the
// order index.html loads them.
function bundleCss({ minify = false } = {}) {
  const css = ['style/theme-tokens.css', 'style/style.css']
    .map((file) => resolveCSS(path.join(ROOT, file)))
    .join('\n')
    // The Google Fonts @import duplicates the <link> in index.html.
    .replace(/@import url\('https:\/\/fonts\.googleapis\.com[^']+'\);\n?/g, '');

  // An @import that survives to here sits mid-file, where browsers ignore it.
  const stray = css.match(/@import[^;]+;/);
  if (stray) throw new Error(`assemble: unresolved CSS import: ${stray[0]}`);

  if (!minify) return css;
  return require('esbuild').transformSync(css, { loader: 'css', minify: true }).code;
}

// "<target> <date> <commit>", stamped into the HTML so a bug report can say which
// build it came from. It lives in the HTML and not in the bundle on purpose: a commit
// id compiled into the JS would change the bundle's content hash on every commit.
function buildStamp(target) {
  let commit = 'unknown';
  try {
    commit = execFileSync('git', ['describe', '--always', '--dirty'], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    /* not a git checkout — the stamp just says so */
  }
  return `${target} ${new Date().toISOString().slice(0, 10)} ${commit}`;
}

function stamp(html, value) {
  return swap(html, '</head>', `  <meta name="ff-build" content="${value}">\n</head>`);
}

function renderSingle({ js, css, favicon = readFavicon(), template = readTemplate(), build = buildStamp('single') }) {
  const faviconUri = 'data:image/svg+xml,' + encodeURIComponent(favicon.toString('utf8'));
  // "</script" inside a string literal would otherwise end the inline script early.
  const safeJs = js.replace(/<\/script/gi, '<\\/script');

  let html = template;
  html = swap(html, MARKERS.favicon, `<link rel="icon" type="image/svg+xml" href="${faviconUri}">`);
  html = swap(html, MARKERS.themeCss, `<style>\n${css}\n</style>`);
  html = swap(html, MARKERS.mainCss, '');
  html = swap(html, MARKERS.script, `<script defer>\n${safeJs}\n</script>`);
  // Nothing to install: this is a file on someone's disk.
  html = swap(html, MARKERS.manifest, '');
  html = swap(html, MARKERS.touchIcon, '');
  return stamp(html, build);
}

// Paths are relative (no leading slash) so the directory works from any base URL,
// including a Netlify draft deploy.
function renderHosted({
  scripts,
  stylesheet,
  favicon,
  manifest,
  touchIcon,
  template = readTemplate(),
  build = buildStamp('hosted'),
}) {
  let html = template;
  html = swap(html, MARKERS.favicon, `<link rel="icon" type="image/svg+xml" href="${favicon}">`);
  html = swap(html, MARKERS.manifest, `<link rel="manifest" href="${manifest}">`);
  html = swap(html, MARKERS.touchIcon, `<link rel="apple-touch-icon" href="${touchIcon}">`);
  html = swap(html, MARKERS.themeCss, `<link rel="stylesheet" href="${stylesheet}">`);
  html = swap(html, MARKERS.mainCss, '');
  html = swap(
    html,
    MARKERS.script,
    scripts.map((src) => `<script src="${src}" defer></script>`).join('\n  ')
  );
  return stamp(html, build);
}

// The web manifest as the hosted site serves it. It lives under assets/ like
// everything else the page loads, so its own URLs are relative to that directory:
// each icon is a sibling (`icons` maps the source path to the hashed filename), and
// the app it describes is one level up.
function renderManifest({ icons, manifest = readManifest() }) {
  const out = { ...manifest, start_url: '../', scope: '../' };
  out.icons = manifest.icons.map((icon) => {
    const hashed = icons[icon.src];
    if (!hashed) throw new Error(`assemble: no built file for manifest icon "${icon.src}"`);
    return { ...icon, src: hashed };
  });
  return JSON.stringify(out, null, 2) + '\n';
}

// The service worker: build/sw.js with the list of files to keep for offline use.
// `assets` are paths relative to the site root, as index.html references them.
function renderServiceWorker({ assets, source = fs.readFileSync(path.join(__dirname, 'sw.js'), 'utf8') }) {
  const list = [...assets].sort();
  let sw = source;
  sw = swap(sw, '"__VERSION__"', JSON.stringify(contentHash(list.join('\n'))));
  sw = swap(sw, '__ASSETS__', JSON.stringify(list, null, 2));
  return sw;
}

// Every same-site file a page's tags would fetch. Inline <script>/<style> bodies are
// dropped first: app code legitimately contains strings like href="/info/".
function findLocalRefs(html) {
  const tagsOnly = html
    .replace(/(<script\b[^>]*>)[\s\S]*?<\/script>/gi, '$1')
    .replace(/(<style\b[^>]*>)[\s\S]*?<\/style>/gi, '$1');
  const refs = [];
  for (const [, url] of tagsOnly.matchAll(/<(?:script|link|img)\b[^>]*?\s(?:src|href)="([^"]*)"/gi)) {
    if (!/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(url)) refs.push(url);
  }
  return refs;
}

module.exports = {
  ROOT,
  MARKERS,
  HASH_LENGTH,
  HASHED_ASSET,
  TOUCH_ICON,
  readTemplate,
  readFavicon,
  readManifest,
  contentHash,
  bundleCss,
  buildStamp,
  renderSingle,
  renderHosted,
  renderManifest,
  renderServiceWorker,
  findLocalRefs,
};
