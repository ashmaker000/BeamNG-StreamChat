import assert from "node:assert/strict";
import test from "node:test";
import { resolveAuthenticatedChannel } from "./twitch-chat.js";

test("resolves chat only from the authenticated Twitch user ID", async () => {
  let requestedUrl = "";
  const fetcher = (async (input: URL | RequestInfo) => {
    requestedUrl = String(input);
    return Response.json({ data: [{ id: "user-42", login: "streamer", display_name: "Streamer" }] });
  }) as typeof fetch;

  const channel = await resolveAuthenticatedChannel("client", "token", "user-42", fetcher);
  assert.equal(channel.id, "user-42");
  assert.equal(new URL(requestedUrl).searchParams.get("id"), "user-42");
  assert.equal(new URL(requestedUrl).searchParams.has("login"), false);
});

test("rejects a channel that does not match the authenticated Twitch user", async () => {
  const fetcher = (async () => Response.json({
    data: [{ id: "someone-else", login: "other", display_name: "Other" }]
  })) as typeof fetch;

  await assert.rejects(
    resolveAuthenticatedChannel("client", "token", "user-42", fetcher),
    /authenticated account's channel/
  );
});
