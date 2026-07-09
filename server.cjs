/**
 * Zero-dependency canary for Railway networking.
 * Listens immediately on process.env.PORT (default 3000).
 * Then tries to load the full TypeScript build (dist/app.js) if present.
 */
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const { parse: parseUrl } = require("url");

const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT || "3000");

let appHandler = null;
let bootMode = "canary";
let bootError = null;

function publicDir() {
  const candidates = [
    path.join(__dirname, "public"),
    path.join(process.cwd(), "public"),
    path.join(__dirname, "dist", "..", "public"),
  ];
  for (const c of candidates) {
    try {
      if (fs.existsSync(path.join(c, "chat.html"))) return c;
    } catch (_) {}
  }
  return path.join(process.cwd(), "public");
}

function sendJson(res, status, body) {
  const raw = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(raw);
}

function sendHtml(res, html) {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}

function sendFile(res, filePath, contentType) {
  try {
    const data = fs.readFileSync(filePath);
    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  } catch (_) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  }
}

const CANARY_CHAT = `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Talk to Lilly</title>
<style>
body{margin:0;font-family:system-ui,sans-serif;background:#0f0a12;color:#f5eef2;
min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
.card{max-width:420px;background:#1a1220;border:1px solid #3d2a38;border-radius:16px;padding:24px}
h1{margin:0 0 8px;font-size:1.25rem;color:#ff4d8d}
p{color:#a8919c;line-height:1.45;font-size:.95rem}
code{background:#2a1a28;padding:2px 6px;border-radius:6px}
a{color:#ff4d8d}
</style></head><body>
<div class="card">
  <h1>Talk to Lilly</h1>
  <p>Core server is <strong>online</strong>. Full chat UI loads when <code>public/chat.html</code> is present and the app finishes booting.</p>
  <p>Check <a href="/health">/health</a> for status.</p>
  <p>If you see this canary page, Railway networking works.</p>
</div>
</body></html>`;

function coreHandler(req, res) {
  const { pathname } = parseUrl(req.url || "/", true);

  if (pathname === "/health" || pathname === "/healthz") {
    // Core always answers; full app may enrich via appHandler for /health when attached
    // Prefer app handler when full mode so postgres/redis live checks run
    if (appHandler && (bootMode === "full" || bootMode === "setup")) {
      return appHandler(req, res);
    }
    const missing = [];
    if (!process.env.DATABASE_URL && !process.env.DATABASE_PRIVATE_URL) {
      missing.push("DATABASE_URL");
    }
    if (!process.env.REDIS_URL && !process.env.REDIS_PRIVATE_URL) {
      missing.push("REDIS_URL");
    }
    const redisUrl = process.env.REDIS_URL || "";
    const errors = [];
    if (redisUrl.includes("localhost") || redisUrl.includes("127.0.0.1")) {
      errors.push(
        "REDIS_URL is localhost — on Railway use Redis service reference, not redis://localhost:6379"
      );
    }
    sendJson(res, 200, {
      ok: true,
      status: bootMode === "full" ? "ok" : bootMode,
      bootMode,
      server: {
        ok: true,
        listenPort: PORT,
        uptimeSeconds: Math.floor(process.uptime()),
      },
      postgres: {
        configured: Boolean(process.env.DATABASE_URL || process.env.DATABASE_PRIVATE_URL),
        ok: false,
        error: missing.includes("DATABASE_URL")
          ? "DATABASE_URL not set — use ${{Postgres.DATABASE_URL}} or Variable Reference"
          : "pending full app attach for live check",
      },
      redis: {
        configured: Boolean(process.env.REDIS_URL || process.env.REDIS_PRIVATE_URL),
        ok: false,
        error:
          errors[0] ||
          (missing.includes("REDIS_URL")
            ? "REDIS_URL not set — use ${{Redis.REDIS_URL}} or Variable Reference (never localhost on Railway)"
            : "pending full app attach for live check"),
      },
      env: {
        missing,
        errors,
        hints: [
          "DATABASE_URL=${{Postgres.DATABASE_URL}}",
          "REDIS_URL=${{Redis.REDIS_URL}}",
          "HOST=0.0.0.0",
          "PORT must match Railway Networking target port",
        ],
      },
      listenPort: PORT,
      envPort: process.env.PORT || null,
      host: HOST,
      bootError,
      talk: "/chat",
      version: "1.4.0",
      pid: process.pid,
      uptimeSeconds: Math.floor(process.uptime()),
    });
    return;
  }

  if (pathname === "/chat" || pathname === "/chat.html") {
    const chatPath = path.join(publicDir(), "chat.html");
    if (fs.existsSync(chatPath)) {
      sendFile(res, chatPath, "text/html; charset=utf-8");
    } else {
      sendHtml(res, CANARY_CHAT);
    }
    return;
  }

  if (pathname && pathname !== "/" && !pathname.startsWith("/api")) {
    const safe = path.normalize(pathname).replace(/^(\.\.[/\\])+/, "");
    const filePath = path.join(publicDir(), safe);
    if (
      filePath.startsWith(publicDir()) &&
      fs.existsSync(filePath) &&
      fs.statSync(filePath).isFile()
    ) {
      const ext = path.extname(filePath).toLowerCase();
      const types = {
        ".html": "text/html; charset=utf-8",
        ".js": "application/javascript",
        ".css": "text/css",
        ".json": "application/json",
        ".png": "image/png",
        ".svg": "image/svg+xml",
      };
      sendFile(res, filePath, types[ext] || "application/octet-stream");
      return;
    }
  }

  if (appHandler) {
    return appHandler(req, res);
  }

  if (pathname === "/" || !pathname) {
    sendJson(res, 200, {
      name: "Lilly OS",
      bootMode,
      ok: true,
      health: "/health",
      talk: "/chat",
      bootError,
      listenPort: PORT,
      message: "Canary is live. Full app attaches after boot.",
    });
    return;
  }

  if (pathname.startsWith("/api")) {
    sendJson(res, 503, {
      error: "app still booting or setup incomplete",
      bootMode,
      bootError,
    });
    return;
  }

  sendJson(res, 404, { error: "not found", path: pathname });
}

const server = http.createServer((req, res) => {
  try {
    coreHandler(req, res);
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    console.error("[lilly] request error", message);
    if (!res.headersSent) sendJson(res, 500, { error: message });
  }
});

// Bind without host first if needed — always 0.0.0.0 for Railway
const listenHost = HOST === "localhost" ? "0.0.0.0" : HOST;

server.listen(PORT, listenHost, () => {
  const addr = server.address();
  console.log(
    JSON.stringify({
      msg: "Lilly canary listening",
      listenPort: PORT,
      envPort: process.env.PORT || null,
      host: listenHost,
      address: addr,
      pid: process.pid,
      cwd: process.cwd(),
      node: process.version,
    })
  );
});

server.on("error", (err) => {
  console.error(
    JSON.stringify({
      msg: "listen failed",
      errMessage: err.message,
      listenPort: PORT,
      envPort: process.env.PORT || null,
    })
  );
  process.exit(1);
});

function loadFullApp() {
  const appPath = path.join(__dirname, "dist", "app.js");
  if (!fs.existsSync(appPath)) {
    bootMode = "canary";
    bootError = "dist/app.js not found — canary only";
    console.log(JSON.stringify({ msg: "no dist/app.js", bootMode }));
    return;
  }

  // Delay slightly so healthcheck can pass during cold start
  setTimeout(() => {
    try {
      const { createExpressApp } = require("./dist/app.js");
      Promise.resolve(createExpressApp())
        .then((result) => {
          appHandler = result.handler;
          bootMode = result.mode || "full";
          bootError = result.error || null;
          console.log(
            JSON.stringify({
              msg: "full app attached",
              bootMode,
              bootError,
              listenPort: PORT,
            })
          );
        })
        .catch((err) => {
          bootMode = "canary";
          bootError = err && err.message ? err.message : String(err);
          console.error(
            JSON.stringify({
              msg: "full app failed — canary stays up",
              bootError,
            })
          );
        });
    } catch (err) {
      bootMode = "canary";
      bootError = err && err.message ? err.message : String(err);
      console.error(
        JSON.stringify({
          msg: "require dist/app failed — canary stays up",
          bootError,
        })
      );
    }
  }, 500);
}

loadFullApp();

function shutdown(signal) {
  console.log(JSON.stringify({ msg: "shutdown", signal }));
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 8000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
