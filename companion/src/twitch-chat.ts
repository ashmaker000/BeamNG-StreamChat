import type { ChatEventBus } from "./events.js";
import { TwitchProvider } from "./providers/twitch.js";
import type { TwitchAuthService } from "./twitch-auth.js";

export class TwitchChatManager {
  private controller: AbortController | undefined;

  constructor(
    private readonly auth: TwitchAuthService,
    private readonly bus: ChatEventBus,
    private readonly fetcher: typeof fetch = fetch
  ) {}

  async connect(clientId: string, pairingKey: string) {
    const token = await this.auth.refresh(clientId, pairingKey);
    const identityResponse = await this.fetcher("https://id.twitch.tv/oauth2/validate", {
      headers: { Authorization: `OAuth ${token.accessToken}` }
    });
    if (!identityResponse.ok) throw new Error(`Twitch token validation failed (${identityResponse.status})`);
    const identity = await identityResponse.json() as { client_id?: string; user_id?: string; scopes?: string[] };
    if (identity.client_id !== clientId) throw new Error("The Twitch login belongs to a different Client ID");
    if (!identity.user_id) throw new Error("Twitch did not return the authenticated user ID");
    if (!identity.scopes?.includes("user:read:chat")) throw new Error("The Twitch login is missing user:read:chat");

    const channel = await resolveAuthenticatedChannel(clientId, token.accessToken, identity.user_id, this.fetcher);

    this.controller?.abort();
    this.controller = new AbortController();
    const provider = new TwitchProvider({
      clientId,
      accessToken: token.accessToken,
      broadcasterId: channel.id,
      userId: identity.user_id
    }, this.bus);
    void provider.start(this.controller.signal);
    return { channel: channel.display_name || channel.login };
  }

  disconnect(): void {
    this.controller?.abort();
    this.controller = undefined;
  }
}

export interface AuthenticatedTwitchChannel {
  id: string;
  login: string;
  display_name: string;
}

export async function resolveAuthenticatedChannel(
  clientId: string,
  accessToken: string,
  authenticatedUserId: string,
  fetcher: typeof fetch = fetch
): Promise<AuthenticatedTwitchChannel> {
  const usersUrl = new URL("https://api.twitch.tv/helix/users");
  usersUrl.searchParams.set("id", authenticatedUserId);
  const response = await fetcher(usersUrl, {
    headers: { Authorization: `Bearer ${accessToken}`, "Client-Id": clientId }
  });
  if (!response.ok) throw new Error(`Authenticated Twitch account lookup failed (${response.status})`);
  const body = await response.json() as { data?: AuthenticatedTwitchChannel[] };
  const channel = body.data?.[0];
  if (!channel?.id || channel.id !== authenticatedUserId) {
    throw new Error("Twitch did not return the authenticated account's channel");
  }
  return channel;
}
