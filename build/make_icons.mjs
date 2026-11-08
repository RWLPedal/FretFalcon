#!/usr/bin/env node
// Draws the app's home-screen icons from the falcon in favicon.svg and writes them to
// images/icons/, where they are committed. Run it again only when the logo or its
// colours change:
//
//   npm run icons
//
// It is a manual step, not part of the build, because it needs a browser to draw
// with (the Playwright one the test harness already installs).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "images/icons");

// The default ("warm") theme: its page background and the brand mark's colour
// (--bg and --accent-warm in style/theme-tokens.css). BACKGROUND must also match
// background_color / theme_color in manifest.webmanifest.
const BACKGROUND = "#efe7d3";
const FALCON = "oklch(0.55 0.14 35)";

// favicon.svg draws the falcon edge to edge in a square viewBox this wide.
const ART_BOX = 717.05;

// `mark` is the falcon's width as a share of the icon. A maskable icon may be cropped
// to a circle 80% of its width, so its mark is kept well inside that.
const ICONS = [
  { file: "icon-192.png", size: 192, mark: 0.76 },
  { file: "icon-512.png", size: 512, mark: 0.76 },
  { file: "icon-maskable-512.png", size: 512, mark: 0.6 },
  // iOS rounds the corners itself and shows any transparency as black: full bleed.
  { file: "apple-touch-icon.png", size: 180, mark: 0.72 },
];

const falcon = fs.readFileSync(path.join(ROOT, "favicon.svg"), "utf8").match(/<g transform[\s\S]*<\/g>\s*<\/g>/);
if (!falcon) throw new Error("make_icons: favicon.svg no longer contains the falcon group");

function iconSvg({ size, mark }) {
  const scale = (size * mark) / ART_BOX;
  const offset = (size - ART_BOX * scale) / 2;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    `<rect width="${size}" height="${size}" fill="${BACKGROUND}"/>` +
    `<g transform="translate(${offset} ${offset}) scale(${scale})" fill="${FALCON}">${falcon[0]}</g>` +
    `</svg>`
  );
}

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
try {
  for (const icon of ICONS) {
    const page = await browser.newPage({
      viewport: { width: icon.size, height: icon.size },
      deviceScaleFactor: 1,
    });
    await page.setContent(`<body style="margin:0">${iconSvg(icon)}</body>`);
    await page.screenshot({ path: path.join(OUT, icon.file), clip: { x: 0, y: 0, width: icon.size, height: icon.size } });
    await page.close();
    console.log(`  ${icon.file}  ${icon.size}x${icon.size}`);
  }
} finally {
  await browser.close();
}
