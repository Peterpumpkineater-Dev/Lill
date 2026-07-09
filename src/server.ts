/**
 * Listen-first entrypoint for Railway.
 * Binds HTTP immediately on process.env.PORT, then loads full app.
 * Never block public health on DB/Redis/migrations.
 */
import http from "http";
import fs from "fs";
import path from "path";
import { parse as parseUrl } from "url";

const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT || "3000");

type RequestListener = (
  req: http.IncomingMessage,
  res: http.ServerResponse
) => void;

let appHandler: RequestListener | null = null;
let bootError: string | null = null;
let bootMode: "booting" | "setup" | "full" | "error" = "booting";

function publicDir(): string {
  const candidates = [
    path.join(__dirname, "..", "public"),
    path.join(process.cwd(), "public"),
    path.join(__dirname, "public"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, "chat.html"))) return c;
  }
  return candidates[0];
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  const raw = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(raw);
}

function sendFile(res: http.ServerResponse, filePath: string, type: string): void {
  try {
    const data = fs.readFileSync(filePath);
    res.writeHead(200, { "Content-Type": type });
    res.end(data);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  }
}

function coreHandler(req: http.IncomingMessage, res: http.ServerResponse): void {
  const { pathname } = parseUrl(req.url || "/", true);

  // Always answer health immediately (Railway + browsers)
  if (pathname === "/health" || pathname === "/healthz") {
    sendJson(res, 200, {
      status: bootMode === "full" ? "ok" : bootMode === "setup" ? "setup" : bootMode,
      bootMode,
      listenPort: PORT,
      envPort: process.env.PORT ?? null,
      host: HOST,
      bootError,
      talk: "/chat",
      version: "1.3.0",
      pid: process.pid,
      uptimeSeconds: Math.floor(process.uptime()),
    });
    return;
  }

  if (pathname === "/chat" || pathname === "/chat.html") {
    sendFile(res, path.join(publicDir(), "chat.html"), "text/html; charset=utf-8");
    return;
  }

  // Static assets from public/
  if (pathname && pathname !== "/" && !pathname.startsWith("/api")) {
    const safe = path.normalize(pathname).replace(/^(\.\.[/\\])+/, "");
    const filePath = path.join(publicDir(), safe);
    if (filePath.startsWith(publicDir()) && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const types: Record<string, string> = {
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

  if (pathname === "/" && !appHandler) {
    sendJson(res, 200, {
      name: "Lilly OS",
      bootMode,
      health: "/health",
      talk: "/chat",
      bootError,
      listenPort: PORT,
    });
    return;
  }

  if (appHandler) {
    appHandler(req, res);
    return;
  }

  // Still booting full stack
  if (pathname?.startsWith("/api")) {
    sendJson(res, 503, {
      error: "booting",
      bootMode,
      bootError,
      message: "Lilly is starting — retry in a few seconds",
    });
    return;
  }

  sendJson(res, 200, {
    name: "Lilly OS",
    bootMode,
    health: "/health",
    talk: "/chat",
    bootError,
  });
}

const server = http.createServer((req, res) => {
  try {
    coreHandler(req, res);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[lilly] request error", message);
    if (!res.headersSent) {
      sendJson(res, 500, { error: message });
    }
  }
});

server.listen(PORT, HOST, () => {
  console.log(
    JSON.stringify({
      msg: "Lilly core listening",
      listenPort: PORT,
      envPort: process.env.PORT ?? null,
      host: HOST,
      pid: process.pid,
    })
  );
});

server.on("error", (err) => {
  console.error(
    JSON.stringify({
      msg: "listen failed",
      errMessage: err.message,
      listenPort: PORT,
      envPort: process.env.PORT ?? null,
    })
  );
  process.exit(1);
});

async function loadApp(): Promise<void> {
  try {
    // Dynamic import so listen already happened
    const { createExpressApp } = await import("./app");
    const result = await createExpressApp();
    appHandler = result.handler;
    bootMode = result.mode;
    bootError = result.error;
    console.log(
      JSON.stringify({
        msg: "Lilly app attached",
        bootMode,
        bootError,
        listenPort: PORT,
      })
    );
  } catch (err) {
    bootMode = "error";
    bootError = err instanceof Error ? err.message : String(err);
    console.error(
      JSON.stringify({
        msg: "Lilly app load failed — core HTTP still up",
        bootError,
        listenPort: PORT,
      })
    );
  }
}

void loadApp();

function shutdown(signal: string): void {
  console.log(JSON.stringify({ msg: "shutdown", signal }));
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
