import assert from "node:assert/strict";
import test from "node:test";
import { normalizeKick, normalizeTwitch, normalizeYouTube } from "./normalizers.js";

test("normalizes Twitch messages and emotes", () => {
  const message = normalizeTwitch({
    message_id: "t1",
    chatter_user_id: "u1",
    chatter_user_name: "Driver",
    broadcaster_user_id: "b1",
    broadcaster_user_name: "Beam",
    message: { text: "Hi Kappa", fragments: [{ type: "emote", text: "Kappa", emote: { id: "25" } }] }
  });
  assert.equal(message.platform, "twitch");
  assert.match(message.message.fragments[0]?.imageUrl ?? "", /\/25\//);
});

test("normalizes YouTube messages", () => {
  const message = normalizeYouTube({
    id: "y1",
    snippet: { liveChatId: "live", displayMessage: "Hello", publishedAt: "2026-01-01T00:00:00Z", type: "textMessageEvent" },
    authorDetails: { channelId: "u2", displayName: "Viewer", isChatModerator: true }
  });
  assert.deepEqual(message.author.badges, ["moderator"]);
});

test("normalizes Kick messages defensively", () => {
  const message = normalizeKick({
    message_id: "k1",
    content: "Yo",
    sender: { user_id: 7, username: "Kicker", identity: { username_color: "#53fc18" } }
  });
  assert.equal(message.author.id, "7");
  assert.equal(message.message.text, "Yo");
});

