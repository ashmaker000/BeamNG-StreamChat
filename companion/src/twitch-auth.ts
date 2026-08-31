import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { StoredTwitchToken } from "./token-store.js";

const TWITCH_DEVICE_URL = "https://id.twitch.tv/oauth2/device";
const TWITCH_TOKEN_URL = "https://id.twitch.tv/oauth2/token";
const CHAT_SCOPE = "user:read:chat";

interface PendingAuthorization {
  clientId: string;
  deviceCode: string;
  expiresAt: number;
  intervalMs: number;
  nextPollAt: number;
}

interface TwitchTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string[];
  token_type: string;
}

export interface TwitchTokenStorage {
  get(pairingHash: string): Promise<StoredTwitchToken | undefined>;
  set(pairingHash: string, value: StoredTwitchToken): Promise<void>;
  delete(pairingHash: string): Promise<void>;
}

export class TwitchAuthService {
  private readonly pending = new Map<string, PendingAuthorization>();
  private readonly refreshes = new Map<string, Promise<{ accessToken: string; expiresIn: number }>>();

  constructor(private readonly store: TwitchTokenStorage, private readonly fetcher: typeof fetch = fetch) {}

  async begin(clientId: string) {
    const response = await this.postForm(TWITCH_DEVICE_URL, { client_id: clientId, scopes: CHAT_SCOPE });
    if (!response.ok) throw await twitchError(response, "Twitch rejected the device login request");
    const data = await response.json() as {
      device_code: string;
      user_code: string;
      verification_uri: string;
      expires_in: number;
      interval?: number;
    };
    if (!data.device_code || !data.user_code || !data.verification_uri || !data.expires_in) {
      throw new Error("Twitch returned an incomplete device login response");
    }
    const authorizationId = randomUUID();
    const intervalMs = Math.max(1_000, Number(data.interval || 5) * 1_000);
    this.pending.set(authorizationId, {
      clientId,
      deviceCode: data.device_code,
      expiresAt: Date.now() + Number(data.expires_in) * 1_000,
      intervalMs,
      nextPollAt: 0
    });
    return {
      authorizationId,
      userCode: data.user_code,
      verificationUri: data.verification_uri,
      expiresIn: Number(data.expires_in),
      interval: Math.ceil(intervalMs / 1_000)
    };
  }

  async poll(authorizationId: string) {
    const authorization = this.pending.get(authorizationId);
    if (!authorization) return { state: "expired" as const };
    if (Date.now() >= authorization.expiresAt) {
      this.pending.delete(authorizationId);
      return { state: "expired" as const };
    }
    if (Date.now() < authorization.nextPollAt) return { state: "pending" as const };
    authorization.nextPollAt = Date.now() + authorization.intervalMs;

    const response = await this.postForm(TWITCH_TOKEN_URL, {
      client_id: authorization.clientId,
      scopes: CHAT_SCOPE,
      device_code: authorization.deviceCode,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code"
    });
    if (!response.ok) {
      const body = await safeJson(response);
      const errorName = String(body.message || body.error || "").toLowerCase();
      if (response.status === 400 && errorName.includes("authorization_pending")) return { state: "pending" as const };
      if (response.status === 400 && errorName.includes("slow_down")) {
        authorization.intervalMs += 5_000;
        return { state: "pending" as const };
      }
      if (errorName.includes("expired")) {
        this.pending.delete(authorizationId);
        return { state: "expired" as const };
      }
      throw new Error(String(body.message || body.error || "Twitch token request failed"));
    }

    const token = await response.json() as TwitchTokenResponse;
    if (!token.access_token || !token.refresh_token) throw new Error("Twitch did not return refreshable credentials");
    const pairingKey = randomBytes(32).toString("base64url");
    await this.store.set(pairingHash(pairingKey), {
      clientId: authorization.clientId,
      refreshToken: token.refresh_token
    });
    this.pending.delete(authorizationId);
    return {
      state: "authorized" as const,
      pairingKey
    };
  }

  async refresh(clientId: string, pairingKey: string) {
    const keyHash = pairingHash(pairingKey);
    const active = this.refreshes.get(keyHash);
    if (active) return active;
    const refresh = this.refreshOnce(clientId, keyHash);
    this.refreshes.set(keyHash, refresh);
    try { return await refresh; }
    finally { this.refreshes.delete(keyHash); }
  }

  async forget(pairingKey: string): Promise<void> {
    await this.store.delete(pairingHash(pairingKey));
  }

  private async refreshOnce(clientId: string, keyHash: string) {
    const stored = await this.store.get(keyHash);
    if (!stored || stored.clientId !== clientId) throw new Error("This BeamNG app is not paired with Twitch");
    const response = await this.postForm(TWITCH_TOKEN_URL, {
      client_id: clientId,
      grant_type: "refresh_token",
      refresh_token: stored.refreshToken
    });
    if (!response.ok) throw await twitchError(response, "Twitch could not refresh the login");
    const token = await response.json() as TwitchTokenResponse;
    if (!token.access_token) throw new Error("Twitch did not return a refreshed access token");
    if (token.refresh_token) {
      await this.store.set(keyHash, { clientId, refreshToken: token.refresh_token });
    }
    return { accessToken: token.access_token, expiresIn: Number(token.expires_in || 0) };
  }

  private postForm(url: string, values: Record<string, string>): Promise<Response> {
    return this.fetcher(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(values)
    });
  }
}

function pairingHash(pairingKey: string): string {
  return createHash("sha256").update(pairingKey).digest("hex");
}

async function twitchError(response: Response, fallback: string): Promise<Error> {
  const body = await safeJson(response);
  return new Error(String(body.message || body.error || fallback));
}

async function safeJson(response: Response): Promise<Record<string, unknown>> {
  try { return await response.json() as Record<string, unknown>; } catch { return {}; }
}
