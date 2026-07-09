import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import { eventBus } from "../../core/event-bus";
import { config } from "../../config";
import { childLogger } from "../../core/logger";

const log = childLogger("websocket");

export function attachWebSocket(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ server, path: config.server.wsPath });

  wss.on("connection", (socket, req) => {
    const key =
      (req.headers["x-api-key"] as string | undefined) ||
      new URL(req.url ?? "", "http://localhost").searchParams.get("apiKey") ||
      "";

    if (key !== config.server.apiKey && !(config.isDev && process.env.SKIP_AUTH === "true")) {
      socket.close(1008, "unauthorized");
      return;
    }

    log.info("client connected");
    socket.send(
      JSON.stringify({
        type: "welcome",
        message: "Lilly OS event stream",
        at: new Date().toISOString(),
      })
    );

    socket.on("message", (raw) => {
      try {
        const msg = JSON.parse(String(raw)) as { type?: string };
        if (msg.type === "ping") {
          socket.send(JSON.stringify({ type: "pong", at: new Date().toISOString() }));
        }
      } catch {
        // ignore malformed
      }
    });
  });

  const off = eventBus.onAny((event) => {
    const payload = JSON.stringify({
      type: "event",
      event: {
        id: event.id,
        name: event.name,
        source: event.source,
        timestamp: event.timestamp,
        payload: event.payload,
      },
    });

    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  });

  wss.on("close", () => {
    off();
  });

  return wss;
}
