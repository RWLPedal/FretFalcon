#!/usr/bin/env node
// Production builds. There are two targets, built from the same source:
//
//   single  dist/index.html   Everything inlined into one self-contained file: the
//                             copy people download and open from disk. External CDN
//                             resources (Google Fonts, Material Icons) still require
//                             internet access.
//   hosted  dist-hosted/      What fretfalcon.com serves: a small index.html plus
//                             content-hashed JS/CSS under assets/, so browsers can
//                             cache them forever and a deploy only re-downloads what
//                             actually changed. Also the only target that can be
//                             installed as an app: it gets the web manifest, the
//                             home-screen icons and a service worker (sw.js) that
//                             lets the installed app open offline.
//
//   node build_html.js [--target single|hosted|all]      (default: all)
//
// The HTML assembly itself lives in build/assemble.js.
const fs = require('fs');
const path = require('path');
const webpack = require('webpack');
const webpackConfig = require('./ts/webpack.config.js');
const {
  ROOT,
  HASHED_ASSET,
  TOUCH_ICON,
  readFavicon,
  readManifest,
  contentHash,
  bundleCss,
  renderSingle,
  renderHosted,
  renderManifest,
  renderServiceWorker,
  findLocalRefs,
} = require('./build/assemble');

// Canonical origin, no trailing slash. Must match the <link rel="canonical">,
// og:url and og:image URLs in index.html.
const SITE_ORIGIN = 'https://fretfalcon.com';

const SINGLE_OUT = path.join(ROOT, 'dist/index.html');
const HOSTED_DIR = path.join(ROOT, 'dist-hosted');
// Where the hosted site offers the single-file build for download.
const DOWNLOAD_PATH = 'download/fretfalcon.html';

const TARGETS = ['single', 'hosted'];
const targetArg = process.argv.includes('--target')
  ? process.argv[process.argv.indexOf('--target') + 1]
  : 'all';
if (targetArg !== 'all' && !TARGETS.includes(targetArg)) {
  console.error(`build_html: unknown --target "${targetArg}" (expected single, hosted or all)`);
  process.exit(1);
}

const kb = (file) => `${Math.round(fs.statSync(file).size / 1024)} KB`;
const rel = (file) => path.relative(ROOT, file).replace(/\\/g, '/');

class BuildError extends Error {}

// Runs webpack for one target and resolves with the entry's JS files, in load order,
// relative to the output directory.
function bundle(target) {
  const config = webpackConfig({ target }, { mode: 'production' });
  if (target === 'single') {
    // The whole point of this target is one file; never let a chunk split off.
    config.plugins = [
      ...(config.plugins ?? []),
      new webpack.optimize.LimitChunkCountPlugin({ maxChunks: 1 }),
    ];
  }
  return new Promise((resolve, reject) => {
    webpack(config, (err, stats) => {
      if (err) return reject(err);
      if (stats.hasErrors()) {
        return reject(new BuildError(stats.toString({ preset: 'errors-only', colors: true })));
      }
      if (stats.hasWarnings()) {
        console.warn(stats.toString({ preset: 'errors-warnings', colors: true }));
      }
      const entry = stats.toJson({ all: false, entrypoints: true }).entrypoints.reference_bundle;
      const scripts = entry.assets.map((a) => a.name).filter((name) => name.endsWith('.js'));
      resolve({ dir: config.output.path, scripts });
    });
  });
}

async function buildSingle() {
  console.log('Building single-file target...');
  const { dir, scripts } = await bundle('single');
  if (scripts.length !== 1) {
    throw new BuildError(`single target emitted ${scripts.length} scripts, expected 1`);
  }
  const html = renderSingle({
    js: fs.readFileSync(path.join(dir, scripts[0]), 'utf8'),
    css: bundleCss({ minify: true }),
  });

  const refs = findLocalRefs(html);
  if (refs.length) {
    throw new BuildError(`single-file build still loads separate files: ${refs.join(', ')}`);
  }

  fs.mkdirSync(path.dirname(SINGLE_OUT), { recursive: true });
  fs.writeFileSync(SINGLE_OUT, html, 'utf8');
  console.log(`Built: ${rel(SINGLE_OUT)} (${kb(SINGLE_OUT)})`);
}

async function buildHosted() {
  console.log('Building hosted target...');
  // Always from scratch: every asset name carries a content hash, so an incremental
  // build would accumulate superseded files. Clear the contents rather than the
  // directory itself — on Windows, removing a directory that a preview server or
  // shell is sitting in fails with EBUSY.
  fs.mkdirSync(HOSTED_DIR, { recursive: true });
  for (const entry of fs.readdirSync(HOSTED_DIR)) {
    fs.rmSync(path.join(HOSTED_DIR, entry), { recursive: true, force: true });
  }

  const { scripts } = await bundle('hosted');

  const write = (name, content) => {
    const file = path.join(HOSTED_DIR, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
    return name;
  };

  // An image, hashed like everything else under assets/. Returns its site path.
  const writeImage = (source) => {
    const bytes = fs.readFileSync(path.join(ROOT, source));
    const { name, ext } = path.parse(source);
    return write(`assets/${name}.${contentHash(bytes)}${ext}`, bytes);
  };

  // The web manifest and the icons it names. The manifest sits beside its icons, so
  // inside it they are plain filenames.
  const manifestIcons = {};
  for (const icon of readManifest().icons) {
    manifestIcons[icon.src] = path.basename(writeImage(icon.src));
  }
  const manifest = renderManifest({ icons: manifestIcons });

  const css = bundleCss({ minify: true });
  const favicon = readFavicon();
  const html = renderHosted({
    scripts,
    stylesheet: write(`assets/style.${contentHash(css)}.css`, css),
    favicon: write(`assets/favicon.${contentHash(favicon)}.svg`, favicon),
    manifest: write(`assets/manifest.${contentHash(manifest)}.webmanifest`, manifest),
    touchIcon: writeImage(TOUCH_ICON),
  });

  // deploy/_headers caches everything under assets/ for a year, which is only safe if
  // every file the page loads really is there, under a name that changes with its
  // contents.
  for (const ref of findLocalRefs(html)) {
    if (!HASHED_ASSET.test(ref)) {
      throw new BuildError(`hosted index.html loads "${ref}", which is not a content-hashed asset`);
    }
    if (!fs.existsSync(path.join(HOSTED_DIR, ref))) {
      throw new BuildError(`hosted index.html loads "${ref}", which was not emitted`);
    }
  }
  write('index.html', html);

  // The service worker keeps everything the page loads, plus the icons the manifest
  // names. It is the one file at the site root that is not hashed: its URL has to
  // stay the same for the browser to notice a new one (deploy/_headers revalidates it).
  const offline = [...findLocalRefs(html), ...Object.values(manifestIcons).map((name) => `assets/${name}`)];
  write('sw.js', renderServiceWorker({ assets: offline }));

  // ── Static SEO files ────────────────────────────────────────────────────
  write('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${SITE_ORIGIN}/sitemap.xml\n`);

  const lastmod = new Date().toISOString().slice(0, 10);
  write(
    'sitemap.xml',
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      `  <url>\n` +
      `    <loc>${SITE_ORIGIN}/</loc>\n` +
      `    <lastmod>${lastmod}</lastmod>\n` +
      `  </url>\n` +
      `</urlset>\n`
  );

  // The og:image / twitter:image / schema screenshot URL points at
  // ${SITE_ORIGIN}/images/screenshot-main.png, so ship that file too. Its URL is
  // shared publicly, so it keeps a stable name instead of a hashed one.
  write('images/screenshot-main.png', fs.readFileSync(path.join(ROOT, 'images/screenshot-main.png')));

  // The single-file build, offered for download from the hosted site.
  if (fs.existsSync(SINGLE_OUT)) {
    write(DOWNLOAD_PATH, fs.readFileSync(SINGLE_OUT));
    if (targetArg === 'hosted') {
      console.log(`  (${DOWNLOAD_PATH} is the existing ${rel(SINGLE_OUT)}, not rebuilt)`);
    }
  } else {
    console.warn(`  (no ${rel(SINGLE_OUT)} — skipping ${DOWNLOAD_PATH}; run the single target first)`);
  }

  console.log(`Built: ${rel(HOSTED_DIR)}/`);
  for (const name of ['index.html', ...findLocalRefs(html)]) {
    console.log(`  ${kb(path.join(HOSTED_DIR, name)).padStart(8)}  ${name}`);
  }
}

(async () => {
  // single first: the hosted target ships a copy of it as the download.
  if (targetArg !== 'hosted') await buildSingle();
  if (targetArg !== 'single') await buildHosted();
})().catch((err) => {
  console.error(err instanceof BuildError ? `\nbuild_html: ${err.message}\n` : err);
  process.exit(1);
});
