#!/usr/bin/env node
// Builds everything into a single self-contained HTML file at dist/index.html.
// External CDN resources (Google Fonts, Material Icons) still require internet access.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = __dirname;

console.log('Building TypeScript bundle...');
execSync('npx webpack --config ts/webpack.config.js', { cwd: ROOT, stdio: 'inherit' });

function resolveCSS(filePath) {
  const dir = path.dirname(filePath);
  const css = fs.readFileSync(filePath, 'utf8');
  return css.replace(/@import url\(['"]?([^'")\s]+)['"]?\);/g, (match, importPath) => {
    if (importPath.startsWith('http')) return match;
    return resolveCSS(path.join(dir, importPath));
  });
}

const themeCSS = resolveCSS(path.join(ROOT, 'style/theme-tokens.css'));
// Inline local @imports but strip the Google Fonts @import (kept as a <link> in the HTML)
const mainCSS = resolveCSS(path.join(ROOT, 'style/style.css'))
  .replace(/@import url\('https:\/\/fonts\.googleapis\.com[^']+'\);\n?/g, '');

const bundleJS = fs.readFileSync(path.join(ROOT, 'js/reference_bundle.js'), 'utf8');

// Inline the favicon as a data URI so the built file stays self-contained.
const faviconSVG = fs.readFileSync(path.join(ROOT, 'favicon.svg'), 'utf8');
const faviconDataUri = 'data:image/svg+xml,' + encodeURIComponent(faviconSVG);

let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

html = html.replace(
  '<link rel="icon" type="image/svg+xml" href="favicon.svg">',
  `<link rel="icon" type="image/svg+xml" href="${faviconDataUri}">`
);

html = html.replace(
  '<link rel="stylesheet" href="style/theme-tokens.css">',
  `<style>\n${themeCSS}\n</style>`
);
html = html.replace(
  '<link rel="stylesheet" href="style/style.css">',
  `<style>\n${mainCSS}\n</style>`
);
html = html.replace(
  '<script src="./js/reference_bundle.js" defer></script>',
  `<script defer>\n${bundleJS}\n</script>`
);


const outDir = path.join(ROOT, 'dist');
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'index.html');
fs.writeFileSync(outPath, html, 'utf8');
const kb = Math.round(fs.statSync(outPath).size / 1024);
console.log(`Built: dist/index.html (${kb} KB)`);
