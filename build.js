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

function wavDataURI(relPath) {
  const data = fs.readFileSync(path.join(ROOT, relPath));
  return `data:audio/wav;base64,${data.toString('base64')}`;
}

const audioMap = {
  'sounds/metronome.wav': wavDataURI('sounds/metronome.wav'),
  'sounds/metronome_accent.wav': wavDataURI('sounds/metronome_accent.wav'),
  'sounds/intro_bell.wav': wavDataURI('sounds/intro_bell.wav'),
  'sounds/bell.wav': wavDataURI('sounds/bell.wav'),
};

let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

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

for (const [src, dataURI] of Object.entries(audioMap)) {
  html = html.replace(new RegExp(`src="${src}"`, 'g'), `src="${dataURI}"`);
}

const outDir = path.join(ROOT, 'dist');
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'index.html');
fs.writeFileSync(outPath, html, 'utf8');
const kb = Math.round(fs.statSync(outPath).size / 1024);
console.log(`Built: dist/index.html (${kb} KB)`);
