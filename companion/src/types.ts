export type Platform = "twitch" | "youtube" | "kick" | "mock";

export interface ChatFragment {
  type: "text" | "emote";
  text: string;
  imageUrl?: string;
}

export interface ChatMessage {
  schemaVersion: 1;
  id: string;
  platform: Platform;
  channel: { id: string; name: string };
  author: {
    id: string;
    name: string;
    color?: string;
    badges: string[];
  };
  message: { text: string; fragments: ChatFragment[] };
  kind: "message" | "membership" | "donation" | "system";
  publishedAt: string;
}

export type ProviderState = "disabled" | "connecting" | "connected" | "error";

export type ServerEvent =
  | { type: "chat.message"; data: ChatMessage }
  | { type: "provider.status"; data: { platform: Platform; state: ProviderState; detail?: string } }
  | { type: "system.ready"; data: { version: string } };

export interface Provider {
  readonly platform: Platform;
  start(signal: AbortSignal): Promise<void>;
}
