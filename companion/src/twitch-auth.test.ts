import assert from "node:assert/strict";
import test from "node:test";
import { TwitchAuthService, type TwitchTokenStorage } from "./twitch-auth.js";
import type { StoredTwitchToken } from "./token-store.js";

class MemoryStore implements TwitchTokenStorage {
  readonly values = new Map<string, StoredTwitchToken>();
  async get(key: string) { return this.values.get(key); }
  async set(key: string, value: StoredTwitchToken) { this.values.set(key, value); }
  async delete(key: string) { this.values.delete(key); }
}

test("completes device login and rotates the one-time refresh token", async () => {
  const requests: Array<{ url: string; body: URLSearchParams }> = [];
  const responses = [
    jsonResponse({
      device_code: "device-code",
      user_code: "ABCDEFGH",
      verification_uri: "https://www.twitch.tv/activate?public=true&device-code=ABCDEFGH",
      expires_in: 1800,
      interval: 1
    }),
    jsonResponse({
      access_token: "access-one",
      refresh_token: "refresh-one",
      expires_in: 14400,
      token_type: "bearer"
    }),
    jsonResponse({
      access_token: "access-two",
      refresh_token: "refresh-two",
      expires_in: 14400,
      token_type: "bearer"
    })
  ];
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(input), body: new URLSearchParams(String(init?.body || "")) });
    return responses.shift()!;
  }) as typeof fetch;
  const store = new MemoryStore();
  const service = new TwitchAuthService(store, fetcher);

  const login = await service.begin("public-client");
  assert.equal(login.userCode, "ABCDEFGH");
  const authorized = await service.poll(login.authorizationId);
  assert.equal(authorized.state, "authorized");
  if (authorized.state !== "authorized") assert.fail("expected authorization");
  assert.equal("accessToken" in authorized, false);
  assert.equal(requests[1]!.body.get("scopes"), "user:read:chat");

  const refreshed = await service.refresh("public-client", authorized.pairingKey);
  assert.equal(refreshed.accessToken, "access-two");
  assert.equal(requests[2]!.body.get("client_secret"), null);
  assert.equal(Array.from(store.values.values())[0]!.refreshToken, "refresh-two");
  await service.forget(authorized.pairingKey);
  assert.equal(store.values.size, 0);
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
