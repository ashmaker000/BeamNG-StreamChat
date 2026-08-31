import type { ChatEventBus } from "../events.js";
import { normalizeYouTube } from "../normalizers.js";
import { errorMessage, retryForever, wait } from "../retry.js";
import type { Provider } from "../types.js";

interface YouTubeConfig { accessToken: string; liveChatId?: string }

export class YouTubeProvider implements Provider {
  readonly platform = "youtube" as const;
  constructor(private readonly config: YouTubeConfig, private readonly bus: ChatEventBus) {}

  start(signal: AbortSignal): Promise<void> {
    return retryForever(
      () => this.poll(signal),
      signal,
      (error, delayMs) => this.bus.publish({
        type: "provider.status",
        data: { platform: this.platform, state: "error", detail: `${errorMessage(error)}; retrying in ${delayMs}ms` }
      })
    );
  }

  private async poll(signal: AbortSignal): Promise<void> {
    this.bus.publish({ type: "provider.status", data: { platform: this.platform, state: "connecting" } });
    const liveChatId = this.config.liveChatId ?? await this.discoverLiveChat();
    let pageToken: string | undefined;
    let firstPage = true;
    while (!signal.aborted) {
      const params = new URLSearchParams({ liveChatId, part: "id,snippet,authorDetails", maxResults: "500" });
      if (pageToken) params.set("pageToken", pageToken);
      const data = await this.getJson(`https://www.googleapis.com/youtube/v3/liveChat/messages?${params}`);
      const items = Array.isArray(data.items) ? data.items : [];
      const visibleItems = firstPage ? items.slice(-25) : items;
      for (const item of visibleItems) this.bus.publishMessage(normalizeYouTube(item));
      firstPage = false;
      pageToken = typeof data.nextPageToken === "string" ? data.nextPageToken : pageToken;
      this.bus.publish({ type: "provider.status", data: { platform: this.platform, state: "connected" } });
      const pollingInterval = typeof data.pollingIntervalMillis === "number" ? data.pollingIntervalMillis : 5_000;
      await wait(Math.max(1_000, pollingInterval), signal);
    }
  }

  private async discoverLiveChat(): Promise<string> {
    const params = new URLSearchParams({ part: "snippet", broadcastStatus: "active", mine: "true" });
    const data = await this.getJson(`https://www.googleapis.com/youtube/v3/liveBroadcasts?${params}`);
    const first = Array.isArray(data.items) ? data.items[0] : undefined;
    const liveChatId = first?.snippet?.liveChatId;
    if (typeof liveChatId !== "string" || !liveChatId) throw new Error("No active YouTube broadcast with live chat was found");
    return liveChatId;
  }

  private async getJson(url: string): Promise<Record<string, any>> {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${this.config.accessToken}` } });
    if (!response.ok) throw new Error(`YouTube API failed (${response.status}): ${await response.text()}`);
    return await response.json() as Record<string, any>;
  }
}

