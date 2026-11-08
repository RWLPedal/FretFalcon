#!/usr/bin/env node
// Serves the assembled deploy/site/ directory so the exact thing that ships can
// be exercised locally. Deliberately dependency-free.
//
// It differs from .claude/preview-server.js (which serves the unbuilt project
// root) in four ways that matter for verifying a deploy:
//   - directory indexes, so /info/ resolves to /info/index.html
//   - _redirects rules are applied, so /welcome.html really 301s
//   - _headers rules are applied and ETags are honoured, so the browser caches
//     exactly as it will in production: hashed assets are never re-requested,
//     and the entry points revalidate with a 304
//   - every request is logged, with misses called out — a missed `base` rewrite
//     shows up as a 404 line rather than a quietly missing image
//
// Flags: --port <n> (default 5292, see PROJECTS.md), --open,
//        --no-cache (ignore _headers and send no-store, for when a cached copy
//        is getting in the way)
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "site");

const argv = process.argv.slice(2);
const flag = (name) => argv.indexOf(name);
// Part of the F:\Programming local-dev port scheme: FretFalcon owns the 5290
// block (5290 webpack-dev-server, 5291 preview-server). See PROJECTS.md.
const PORT =
  Number(process.env.PORT) ||
  (flag("--port") !== -1 ? Number(argv[flag("--port") + 1]) : 0) ||
  5292;
const OPEN = flag("--open") !== -1;
const NO_CACHE = flag("--no-cache") !== -1;

const TYPES = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".map": "application/json",
  ".wav": "audio/wav", ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png", ".jpg": "image/jpeg", ".ico": "image/x-icon",
  ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf",
  ".xml": "application/xml", ".txt": "text/plain",
};

if (!fs.existsSync(ROOT)) {
  console.error(`\nserve: nothing to serve at ${ROOT}\nRun \`npm run site\` first.\n`);
  process.exit(1);
}

// ── _redirects ──────────────────────────────────────────────────────────────
// Only the plain `from to [code]` form Netlify calls a redirect rule; splats,
// placeholders and proxies aren't parsed. Nothing here uses them, and silently
// half-supporting them would be worse than not supporting them at all.
const redirects = [];
const redirectsFile = path.join(ROOT, "_redirects");
if (fs.existsSync(redirectsFile)) {
  for (const raw of fs.readFileSync(redirectsFile, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const [from, to, code] = line.split(/\s+/);
    if (!from || !to) continue;
    if (from.includes("*") || from.includes(":")) {
      console.warn(`serve: ignoring unsupported redirect rule: ${line}`);
      continue;
    }
    redirects.push({ from, to, code: Number((code ?? "301").replace("!", "")) || 301 });
  }
}

// ── _headers ────────────────────────────────────────────────────────────────
// A path line followed by indented `Name: value` lines. Paths match exactly or,
// with a trailing `*`, by prefix; placeholders aren't parsed, for the same reason
// as above. Like Netlify, every matching rule contributes its headers.
const headerRules = [];
const headersFile = path.join(ROOT, "_headers");
if (!NO_CACHE && fs.existsSync(headersFile)) {
  let rule = null;
  for (const raw of fs.readFileSync(headersFile, "utf8").split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim() || line.trim().startsWith("#")) continue;
    if (!/^\s/.test(line)) {
      if (line.includes(":")) {
        console.warn(`serve: ignoring unsupported header rule: ${line}`);
        rule = null;
        continue;
      }
      rule = { path: line, headers: {} };
      headerRules.push(rule);
    } else if (rule) {
      const colon = line.indexOf(":");
      if (colon !== -1) rule.headers[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
    }
  }
}

const headersFor = (urlPath) => {
  if (NO_CACHE) return { "Cache-Control": "no-store" };
  const headers = {};
  for (const rule of headerRules) {
    const matches = rule.path.endsWith("*")
      ? urlPath.startsWith(rule.path.slice(0, -1))
      : urlPath === rule.path;
    if (matches) Object.assign(headers, rule.headers);
  }
  // What Netlify sends for any path no rule covers.
  headers["Cache-Control"] ??= "public, max-age=0, must-revalidate";
  return headers;
};

const log = (status, method, url, note = "") => {
  const color = status >= 400 ? "\x1b[31m" : status >= 300 ? "\x1b[33m" : "\x1b[32m";
  console.log(`${color}${status}\x1b[0m ${method} ${url}${note && ` ${note}`}`);
};

http
  .createServer((req, res) => {
    const method = req.method ?? "GET";
    const [rawPath] = (req.url || "/").split("?");
    const urlPath = decodeURIComponent(rawPath);

    const rule = redirects.find((r) => r.from === urlPath);
    if (rule) {
      res.writeHead(rule.code, { Location: rule.to });
      res.end();
      return log(rule.code, method, urlPath, `-> ${rule.to}`);
    }

    // Resolve first, then check containment, so '..' can't escape the root.
    const resolved = path.resolve(ROOT, "." + path.normalize(urlPath));
    if (resolved !== ROOT && !resolved.startsWith(ROOT + path.sep)) {
      res.writeHead(403);
      res.end("Forbidden");
      return log(403, method, urlPath);
    }

    let filePath = resolved;
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      // Send /info to /info/ so relative URLs on the page resolve correctly.
      if (!urlPath.endsWith("/")) {
        const to = urlPath + "/";
        res.writeHead(301, { Location: to });
        res.end();
        return log(301, method, urlPath, `-> ${to}`);
      }
      filePath = path.join(filePath, "index.html");
    }

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not found");
        return log(404, method, urlPath);
      }
      const headers = headersFor(urlPath);
      const etag = `"${crypto.createHash("sha1").update(data).digest("hex").slice(0, 16)}"`;
      if (!NO_CACHE) headers.ETag = etag;
      if (!NO_CACHE && req.headers["if-none-match"] === etag) {
        res.writeHead(304, headers);
        res.end();
        return log(304, method, urlPath, "(not modified)");
      }
      res.writeHead(200, {
        "Content-Type": TYPES[path.extname(filePath)] || "application/octet-stream",
        ...headers,
      });
      res.end(data);
      log(200, method, urlPath, `[${headers["Cache-Control"]}]`);
    });
  })
  .listen(PORT, "127.0.0.1", () => {
    const url = `http://127.0.0.1:${PORT}/`;
    console.log(`\nServing ${ROOT}`);
    console.log(`  app   ${url}`);
    console.log(`  info  ${url}info/`);
    console.log(`\nCtrl+C to stop.\n`);
    if (OPEN) {
      const [cmd, args] =
        process.platform === "win32"
          ? ["cmd", ["/c", "start", "", url]]
          : process.platform === "darwin"
            ? ["open", [url]]
            : ["xdg-open", [url]];
      execFile(cmd, args, () => {});
    }
  });
