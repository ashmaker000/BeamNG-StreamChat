import WebSocket from "ws";
import type { ChatEventBus } from "../events.js";
import { errorMessage, retryForever } from "../retry.js";
import { normalizeTwitch } from "../normalizers.js";
import type { Provider } from "../types.js";

interface TwitchConfig {
  clientId: string;
  accessToken: string;
  broadcasterId: string;
  userId: string;
}

export class TwitchProvider implements Provider {
  readonly platform = "twitch" as const;
  private reconnectUrl: string | undefined;
  constructor(private readonly config: TwitchConfig, private readonly bus: ChatEventBus) {}

  start(signal: AbortSignal): Promise<void> {
    return retryForever(
      () => {
        const reconnectUrl = this.reconnectUrl;
        this.reconnectUrl = undefined;
        return this.connectOnce(reconnectUrl ?? "wss://eventsub.wss.twitch.tv/ws", signal, !reconnectUrl);
      },
      signal,
      (error, delayMs) => this.bus.publish({
        type: "provider.status",
        data: { platform: this.platform, state: "error", detail: `${errorMessage(error)}; retrying in ${delayMs}ms` }
      })
    );
  }

  private connectOnce(url: string, signal: AbortSignal, createSubscription: boolean): Promise<void> {
    this.bus.publish({ type: "provider.status", data: { platform: this.platform, state: "connecting" } });
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      let settled = false;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        socket.removeAllListeners();
        if (error) reject(error); else resolve();
      };
      signal.addEventListener("abort", () => { socket.close(); finish(); }, { once: true });
      socket.on("error", (error) => finish(error));
      socket.on("close", () => finish(new Error("Twitch EventSub socket closed")));
      socket.on("message", async (raw) => {
        try {
          const payload = JSON.parse(raw.toString()) as Record<string, any>;
          const messageType = payload.metadata?.message_type;
          if (messageType === "session_welcome") {
            if (createSubscription) await this.subscribe(payload.payload.session.id);
            this.bus.publish({ type: "provider.status", data: { platform: this.platform, state: "connected" } });
          } else if (messageType === "notification") {
            const event = payload.payload.event;
            this.bus.publishMessage(normalizeTwitch(event));
          } else if (messageType === "session_reconnect") {
            const reconnectUrl = payload.payload?.session?.reconnect_url;
            if (typeof reconnectUrl === "string") {
              this.reconnectUrl = reconnectUrl;
              socket.close();
              finish();
            }
          } else if (messageType === "revocation") {
            throw new Error(`Twitch revoked subscription: ${payload.payload?.subscription?.status ?? "unknown"}`);
          }
        } catch (error) {
          finish(error instanceof Error ? error : new Error(String(error)));
        }
      });
    });
  }

  private async subscribe(sessionId: string): Promise<void> {
    const response = await fetch("https://api.twitch.tv/helix/eventsub/subscriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.accessToken}`,
        "Client-Id": this.config.clientId,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        type: "channel.chat.message",
        version: "1",
        condition: {
          broadcaster_user_id: this.config.broadcasterId,
          user_id: this.config.userId
        },
        transport: { method: "websocket", session_id: sessionId }
      })
    });
    if (!response.ok) throw new Error(`Twitch subscription failed (${response.status}): ${await response.text()}`);
  }
}
