import { timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import express from "express";
import { WebSocket, WebSocketServer } from "ws";
import { config } from "./config.js";
import { verifyKickSignature } from "./verify.js";

const app = express();
const server = createServer(app);
const sockets = new WebSocketServer({ noServer: true });
const seen = new Set<string>();

app.get("/health", (_request, response) => {
  response.json({ ok: true, clients: sockets.clients.size });
});

app.post("/webhooks/kick", express.raw({ type: "application/json", limit: "1mb" }), (request, response) => {
  const body = Buffer.isBuffer(request.body) ? request.body : Buffer.alloc(0);
  const messageId = request.get("Kick-Event-Message-Id") ?? "";
  const timestamp = request.get("Kick-Event-Message-Timestamp") ?? "";
  const signature = request.get("Kick-Event-Signature") ?? "";
  const eventType = request.get("Kick-Event-Type") ?? "";
  const eventVersion = request.get("Kick-Event-Version") ?? "";

  if (!body.length || !messageId || !timestamp || !signature) {
    response.status(400).json({ error: "Missing signed Kick webhook fields" });
    return;
  }
  if (!verifyKickSignature(config.KICK_PUBLIC_KEY, messageId, timestamp, body, signature)) {
    response.status(401).json({ error: "Invalid Kick signature" });
    return;
  }
  if (seen.has(messageId)) {
    response.status(204).end();
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body.toString("utf8"));
  } catch {
    response.status(400).json({ error: "Invalid JSON" });
    return;
  }

  seen.add(messageId);
  if (seen.size > 10_000) seen.delete(seen.values().next().value!);
  const outgoing = JSON.stringify({
    type: "kick.webhook",
    deliveryId: messageId,
    eventType,
    eventVersion,
    receivedAt: new Date().toISOString(),
    body: parsed
  });
  for (const socket of sockets.clients) {
    if (socket.readyState === WebSocket.OPEN) socket.send(outgoing);
  }
  response.status(204).end();
});

server.on("upgrade", (request, socket, head) => {
  if (request.url !== "/stream" || !validBearer(request.headers.authorization)) {
    socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
    socket.destroy();
    return;
  }
  sockets.handleUpgrade(request, socket, head, (client) => sockets.emit("connection", client, request));
});

function validBearer(header: string | undefined): boolean {
  if (!header?.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(header.slice(7));
  const expected = Buffer.from(config.RELAY_CLIENT_TOKEN);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

const heartbeat = setInterval(() => {
  for (const socket of sockets.clients) if (socket.readyState === WebSocket.OPEN) socket.ping();
}, 30_000);
heartbeat.unref();

server.listen(config.PORT, "0.0.0.0", () => {
  console.log(`Kick relay listening on port ${config.PORT}`);
});
