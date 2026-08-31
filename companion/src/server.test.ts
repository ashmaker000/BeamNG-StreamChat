import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { ChatEventBus } from "./events.js";
import { startLocalServer } from "./server.js";
import type { TwitchAuthService } from "./twitch-auth.js";
import type { TwitchChatManager } from "./twitch-chat.js";

test("loopback API requires the installation key and rejects browser origins", async () => {
  const auth = {
    begin: async () => ({ authorizationId: "auth", userCode: "ABCDEFGH", verificationUri: "https://www.twitch.tv/activate", expiresIn: 60, interval: 5 }),
    poll: async () => ({ state: "pending" }),
    forget: async () => undefined
  } as unknown as TwitchAuthService;
  const chat = {
    connect: async () => ({ channel: "Ashmaker000" }),
    disconnect: () => undefined
  } as unknown as TwitchChatManager;
  const server = startLocalServer(0, new ChatEventBus(), auth, chat, "A".repeat(43));
  await once(server, "listening");
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const url = `http://127.0.0.1:${address.port}/api/v1/chat/events`;
    const options = {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Stream-Chat-Key": "A".repeat(43) },
      body: "{}"
    };

    const missingKey = await fetch(url, { ...options, headers: { "Content-Type": "application/json" } });
    assert.equal(missingKey.status, 401);
    assert.equal(missingKey.headers.get("access-control-allow-origin"), null);

    const browser = await fetch(url, { ...options, headers: { ...options.headers, Origin: "https://attacker.example" } });
    assert.equal(browser.status, 403);

    const authorized = await fetch(url, options);
    assert.equal(authorized.status, 200);
    assert.deepEqual(await authorized.json(), { events: [] });
    assert.equal(authorized.headers.get("cache-control"), "no-store");
  } finally {
    server.close();
  }
});
