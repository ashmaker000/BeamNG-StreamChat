import { config } from "./config.js";
import { ChatEventBus } from "./events.js";
import { KickProvider } from "./providers/kick.js";
import { MockProvider } from "./providers/mock.js";
import { TwitchProvider } from "./providers/twitch.js";
import { YouTubeProvider } from "./providers/youtube.js";
import { startLocalServer } from "./server.js";
import type { Platform, Provider } from "./types.js";
import { TokenStore } from "./token-store.js";
import { TwitchAuthService } from "./twitch-auth.js";
import { TwitchChatManager } from "./twitch-chat.js";
import { loadIpcKey } from "./ipc-key.js";

const bus = new ChatEventBus();
const providers: Provider[] = [];

if (config.MOCK_CHAT) providers.push(new MockProvider(bus));

const twitchValues = [config.TWITCH_CLIENT_ID, config.TWITCH_ACCESS_TOKEN, config.TWITCH_BROADCASTER_ID, config.TWITCH_USER_ID];
if (twitchValues.every(Boolean)) {
  providers.push(new TwitchProvider({
    clientId: config.TWITCH_CLIENT_ID!,
    accessToken: config.TWITCH_ACCESS_TOKEN!,
    broadcasterId: config.TWITCH_BROADCASTER_ID!,
    userId: config.TWITCH_USER_ID!
  }, bus));
} else publishDisabled("twitch", twitchValues.some(Boolean) ? "Twitch configuration is incomplete" : undefined);

if (config.YOUTUBE_ACCESS_TOKEN) {
  providers.push(new YouTubeProvider({ accessToken: config.YOUTUBE_ACCESS_TOKEN, liveChatId: config.YOUTUBE_LIVE_CHAT_ID }, bus));
} else publishDisabled("youtube");

if (config.KICK_RELAY_URL && config.KICK_RELAY_TOKEN) {
  providers.push(new KickProvider(config.KICK_RELAY_URL, config.KICK_RELAY_TOKEN, bus));
} else publishDisabled("kick", config.KICK_RELAY_URL || config.KICK_RELAY_TOKEN ? "Kick relay configuration is incomplete" : undefined);

const abortController = new AbortController();
const twitchAuth = new TwitchAuthService(new TokenStore());
const server = startLocalServer(config.COMPANION_PORT, bus, twitchAuth, new TwitchChatManager(twitchAuth, bus), loadIpcKey());
console.log(`BeamNG Stream Chat helper listening securely on http://127.0.0.1:${config.COMPANION_PORT}`);
for (const provider of providers) void provider.start(abortController.signal);

function publishDisabled(platform: Platform, detail?: string): void {
  bus.publish({ type: "provider.status", data: { platform, state: "disabled", detail } });
}

function shutdown(): void {
  abortController.abort();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5_000).unref();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
