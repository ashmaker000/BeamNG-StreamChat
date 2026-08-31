import { randomUUID } from "node:crypto";
import type { ChatEventBus } from "../events.js";
import { wait } from "../retry.js";
import type { Platform, Provider } from "../types.js";

const samples = [
  ["twitch", "TurboTom", "That landing was almost intentional."],
  ["youtube", "RoadRunner", "Try the rally route next!"],
  ["kick", "GreenFlag", "Clean overtake 👏"]
] as const;

export class MockProvider implements Provider {
  readonly platform: Platform = "mock";
  constructor(private readonly bus: ChatEventBus) {}

  async start(signal: AbortSignal): Promise<void> {
    this.bus.publish({ type: "provider.status", data: { platform: "mock", state: "connected" } });
    let index = 0;
    while (!signal.aborted) {
      const sample = samples[index++ % samples.length]!;
      const content = sample[2];
      this.bus.publishMessage({
        schemaVersion: 1,
        id: randomUUID(),
        platform: sample[0],
        channel: { id: "demo", name: "Demo channel" },
        author: { id: `demo-${index}`, name: sample[1], badges: index % 3 === 0 ? ["member"] : [] },
        message: { text: content, fragments: [{ type: "text", text: content }] },
        kind: "message",
        publishedAt: new Date().toISOString()
      });
      await wait(3_000, signal);
    }
  }
}

