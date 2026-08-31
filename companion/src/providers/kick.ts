import WebSocket from "ws";
import type { ChatEventBus } from "../events.js";
import { normalizeKick } from "../normalizers.js";
import { errorMessage, retryForever } from "../retry.js";
import type { Provider } from "../types.js";

export class KickProvider implements Provider {
  readonly platform = "kick" as const;
  constructor(
    private readonly relayUrl: string,
    private readonly relayToken: string,
    private readonly bus: ChatEventBus
  ) {}

  start(signal: AbortSignal): Promise<void> {
    return retryForever(
      () => this.connectOnce(signal),
      signal,
      (error, delayMs) => this.bus.publish({
        type: "provider.status",
        data: { platform: this.platform, state: "error", detail: `${errorMessage(error)}; retrying in ${delayMs}ms` }
      })
    );
  }

  private connectOnce(signal: AbortSignal): Promise<void> {
    this.bus.publish({ type: "provider.status", data: { platform: this.platform, state: "connecting" } });
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(this.relayUrl, { headers: { Authorization: `Bearer ${this.relayToken}` } });
      let settled = false;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        socket.removeAllListeners();
        if (error) reject(error); else resolve();
      };
      signal.addEventListener("abort", () => { socket.close(); finish(); }, { once: true });
      socket.on("open", () => this.bus.publish({ type: "provider.status", data: { platform: this.platform, state: "connected" } }));
      socket.on("error", (error) => finish(error));
      socket.on("close", () => finish(new Error("Kick relay socket closed")));
      socket.on("message", (raw) => {
        try {
          const envelope = JSON.parse(raw.toString()) as { type?: string; body?: unknown };
          if (envelope.type === "kick.webhook") this.bus.publishMessage(normalizeKick(envelope.body));
        } catch (error) {
          finish(error instanceof Error ? error : new Error(String(error)));
        }
      });
    });
  }
}

