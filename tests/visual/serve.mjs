// tests/visual/serve.mjs
// Minimal static server for a built artifact. The Playwright harness tests the real
// shipping output, so build_html.js's assembly is covered too:
//
//   node tests/visual/serve.mjs           dist/         single-file target, port 4173
//   node tests/visual/serve.mjs hosted    dist-hosted/  hosted target,      port 4174
//
// The targets get separate ports so Playwright's reuseExistingServer can never hand
// one run the other's artifact. Keep these in step with TARGETS in playwright.config.ts.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HOSTED = process.argv[2] === "hosted";
const DIST = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  HOSTED ? "../../dist-hosted" : "../../dist",
);
const PORT = HOSTED ? 4174 : 4173;
const TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".map": "application/json",
  ".wav": "audio/wav",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

http
  .createServer((req, res) => {
    let rel = decodeURIComponent((req.url || "/").split("?")[0]);
    if (rel === "/") rel = "/index.html";
    const filePath = path.join(DIST, path.normalize(rel));
    if (!filePath.startsWith(DIST)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      res.writeHead(200, { "Content-Type": TYPES[path.extname(filePath)] || "application/octet-stream" });
      res.end(data);
    });
  })
  .listen(PORT, "127.0.0.1", () => console.log(`visual-test server on http://127.0.0.1:${PORT}`));
