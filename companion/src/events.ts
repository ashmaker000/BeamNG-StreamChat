import { EventEmitter } from "node:events";
import type { ChatMessage, ServerEvent } from "./types.js";

export class ChatEventBus extends EventEmitter {
  private readonly seen = new Map<string, number>();
  private readonly history: ServerEvent[] = [];

  publish(event: ServerEvent): void {
    if (event.type === "chat.message") {
      const key = `${event.data.platform}:${event.data.id}`;
      if (this.seen.has(key)) return;
      this.seen.set(key, Date.now());
      this.pruneSeen();
    }

    this.history.push(event);
    if (this.history.length > 100) this.history.shift();
    this.emit("event", event);
  }

  publishMessage(message: ChatMessage): void {
    this.publish({ type: "chat.message", data: message });
  }

  snapshot(): ServerEvent[] {
    return [...this.history];
  }

  private pruneSeen(): void {
    if (this.seen.size < 5_000) return;
    const cutoff = Date.now() - 60 * 60 * 1000;
    for (const [key, seenAt] of this.seen) {
      if (seenAt < cutoff) this.seen.delete(key);
    }
  }
}

