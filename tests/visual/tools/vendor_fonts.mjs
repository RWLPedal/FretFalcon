// tests/visual/tools/vendor_fonts.mjs
// One-time vendoring of the app's Google Fonts (see index.html <link> tags) into
// tests/visual/assets/fonts/, so screenshot runs are offline and byte-stable.
// Re-run only if index.html's font list changes:  node tests/visual/tools/vendor_fonts.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../assets/fonts");
// Chrome UA so Google serves woff2 (matching what the Playwright Chromium would get).
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const SHEETS = [
  {
    out: "families.css",
    url: "https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=DM+Sans:wght@300;400;500;600&family=Fredoka:wght@400;500;600&family=Hanken+Grotesk:wght@600&family=Spline+Sans+Mono:ital,wght@0,400;0,500&display=swap",
  },
  { out: "material-icons.css", url: "https://fonts.googleapis.com/icon?family=Material+Icons" },
];

fs.mkdirSync(OUT, { recursive: true });

for (const sheet of SHEETS) {
  const res = await fetch(sheet.url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${sheet.url}: HTTP ${res.status}`);
  let css = await res.text();

  const urls = [...new Set([...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com[^)]+)\)/g)].map((m) => m[1]))];
  for (const fontUrl of urls) {
    const name = path.basename(new URL(fontUrl).pathname);
    const fres = await fetch(fontUrl, { headers: { "User-Agent": UA } });
    if (!fres.ok) throw new Error(`${fontUrl}: HTTP ${fres.status}`);
    fs.writeFileSync(path.join(OUT, name), Buffer.from(await fres.arrayBuffer()));
    // Keep the gstatic URL shape in the CSS — the Playwright route handler resolves
    // it to the local file by basename (see helpers/inject.ts useLocalFonts).
    console.log(`  ${name} (${fs.statSync(path.join(OUT, name)).size} bytes)`);
  }
  fs.writeFileSync(path.join(OUT, sheet.out), css);
  console.log(`${sheet.out}: ${urls.length} font files`);
}
console.log(`vendored into ${OUT}`);
