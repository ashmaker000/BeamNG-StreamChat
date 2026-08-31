import { createHash, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { ChatEventBus } from "./events.js";
import type { TwitchAuthService } from "./twitch-auth.js";
import { openTwitchActivation } from "./browser.js";
import type { TwitchChatManager } from "./twitch-chat.js";

const MAX_BODY_BYTES = 16_384;

export function startLocalServer(
  port: number,
  bus: ChatEventBus,
  twitchAuth: TwitchAuthService,
  twitchChat: TwitchChatManager,
  ipcKey: string
) {
  const expectedKeyHash = createHash("sha256").update(ipcKey).digest();
  const limiter = new LocalRateLimiter();
  const server = createServer(async (request, response) => {
    setSecurityHeaders(response);
    try {
      const address = server.address();
      const activePort = typeof address === "object" && address ? address.port : port;
      assertLoopbackRequest(request, activePort);
      assertAuthorized(request, expectedKeyHash);
      if (request.method !== "POST") throw new HttpError(405, "Method not allowed");
      if (!isJsonContentType(request.headers["content-type"])) throw new HttpError(415, "JSON content type required");

      const route = request.url || "";
      limiter.consume(route);
      const body = await readJsonBody(request);

      if (route === "/api/v1/auth/twitch/device") {
        sendJson(response, 200, await twitchAuth.begin(requiredString(body.clientId, "clientId")));
        return;
      }
      if (route === "/api/v1/auth/twitch/poll") {
        sendJson(response, 200, await twitchAuth.poll(requiredString(body.authorizationId, "authorizationId")));
        return;
      }
      if (route === "/api/v1/auth/twitch/open") {
        await openTwitchActivation(requiredString(body.url, "url"));
        sendJson(response, 200, { opened: true });
        return;
      }
      if (route === "/api/v1/auth/twitch/forget") {
        await twitchAuth.forget(requiredString(body.pairingKey, "pairingKey"));
        twitchChat.disconnect();
        sendJson(response, 200, { forgotten: true });
        return;
      }
      if (route === "/api/v1/chat/twitch/connect") {
        sendJson(response, 200, await twitchChat.connect(
          requiredString(body.clientId, "clientId"),
          requiredString(body.pairingKey, "pairingKey")
        ));
        return;
      }
      if (route === "/api/v1/chat/events") {
        sendJson(response, 200, { events: bus.snapshot() });
        return;
      }
      throw new HttpError(404, "Not found");
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 400;
      const message = error instanceof Error ? safeErrorMessage(error.message) : "Request failed";
      sendJson(response, status, { error: message });
    }
  });
  server.listen(port, "127.0.0.1");
  return server;
}

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

class LocalRateLimiter {
  private readonly attempts = new Map<string, number[]>();

  consume(route: string): void {
    const now = Date.now();
    const windowMs = 60_000;
    const limit = route.includes("/auth/twitch/") ? 30 : 180;
    const recent = (this.attempts.get(route) || []).filter((time) => now - time < windowMs);
    if (recent.length >= limit) throw new HttpError(429, "Too many local requests");
    recent.push(now);
    this.attempts.set(route, recent);
  }
}

function assertLoopbackRequest(request: IncomingMessage, port: number): void {
  const remote = request.socket.remoteAddress;
  if (remote !== "127.0.0.1" && remote !== "::ffff:127.0.0.1") throw new HttpError(403, "Forbidden");
  if (request.headers.host !== "127.0.0.1" && request.headers.host !== `127.0.0.1:${port}`) {
    throw new HttpError(403, "Forbidden");
  }
  if (request.headers.origin) throw new HttpError(403, "Browser requests are not allowed");
}

function assertAuthorized(request: IncomingMessage, expectedHash: Buffer): void {
  const supplied = request.headers["x-stream-chat-key"];
  if (typeof supplied !== "string") throw new HttpError(401, "Unauthorized");
  const suppliedHash = createHash("sha256").update(supplied).digest();
  if (!timingSafeEqual(suppliedHash, expectedHash)) throw new HttpError(401, "Unauthorized");
}

function setSecurityHeaders(response: ServerResponse): void {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Security-Policy", "default-src 'none'");
  response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Content-Type-Options", "nosniff");
}

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(value));
}

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, "Request body is too large");
    chunks.push(buffer);
  }
  let value: unknown;
  try { value = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); }
  catch { throw new HttpError(400, "Invalid JSON"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new HttpError(400, "A JSON object is required");
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim() || value.length > 512) throw new HttpError(400, `${name} is required`);
  return value.trim();
}

function isJsonContentType(value: string | undefined): boolean {
  return typeof value === "string" && /^application\/json(?:\s*;|$)/i.test(value);
}

function safeErrorMessage(message: string): string {
  return message
    .replace(/((?:access|refresh|device)[_-]?token)\s*[:=]\s*[^\s,}]+/gi, "$1=[redacted]")
    .slice(0, 300);
}
