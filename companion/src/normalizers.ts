import { randomUUID } from "node:crypto";
import type { ChatMessage } from "./types.js";

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord {
  return value !== null && typeof value === "object" ? value as UnknownRecord : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function id(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

export function normalizeTwitch(eventValue: unknown): ChatMessage {
  const event = record(eventValue);
  const message = record(event.message);
  const fragmentsValue = Array.isArray(message.fragments)
    ? message.fragments as unknown[]
    : [];
  const fragments = fragmentsValue.map((value) => {
    const fragment = record(value);
    const emote = record(fragment.emote);
    return {
      type: text(fragment.type) === "emote" ? "emote" as const : "text" as const,
      text: text(fragment.text),
      imageUrl: id(emote.id)
        ? `https://static-cdn.jtvnw.net/emoticons/v2/${encodeURIComponent(id(emote.id))}/default/dark/1.0`
        : undefined
    };
  });
  const badges = Array.isArray(event.badges)
    ? event.badges.map((value) => text(record(value).set_id)).filter(Boolean)
    : [];

  return {
    schemaVersion: 1,
    id: id(event.message_id) || randomUUID(),
    platform: "twitch",
    channel: { id: id(event.broadcaster_user_id), name: text(event.broadcaster_user_name) },
    author: {
      id: id(event.chatter_user_id),
      name: text(event.chatter_user_name) || text(event.chatter_user_login) || "Unknown",
      color: text(event.color) || undefined,
      badges
    },
    message: {
      text: text(message.text),
      fragments
    },
    kind: "message",
    publishedAt: new Date().toISOString()
  };
}

export function normalizeYouTube(itemValue: unknown): ChatMessage {
  const item = record(itemValue);
  const snippet = record(item.snippet);
  const author = record(item.authorDetails);
  const type = text(snippet.type);
  const kind = type === "superChatEvent" || type === "superStickerEvent"
    ? "donation"
    : type.includes("Sponsor") || type.includes("Membership")
      ? "membership"
      : "message";
  const content = text(snippet.displayMessage);

  return {
    schemaVersion: 1,
    id: id(item.id) || randomUUID(),
    platform: "youtube",
    channel: { id: id(snippet.liveChatId), name: "YouTube" },
    author: {
      id: id(author.channelId),
      name: text(author.displayName) || "Unknown",
      badges: [
        author.isChatOwner ? "owner" : "",
        author.isChatModerator ? "moderator" : "",
        author.isChatSponsor ? "member" : ""
      ].filter(Boolean) as string[]
    },
    message: { text: content, fragments: [{ type: "text", text: content }] },
    kind,
    publishedAt: text(snippet.publishedAt) || new Date().toISOString()
  };
}

export function normalizeKick(bodyValue: unknown): ChatMessage {
  const body = record(bodyValue);
  const sender = record(body.sender);
  const broadcaster = record(body.broadcaster);
  const identity = record(sender.identity);
  const badges = Array.isArray(identity.badges)
    ? identity.badges.map((value) => text(record(value).type) || text(record(value).text)).filter(Boolean)
    : [];
  const content = text(body.content);

  return {
    schemaVersion: 1,
    id: id(body.message_id) || randomUUID(),
    platform: "kick",
    channel: {
      id: id(broadcaster.user_id),
      name: text(broadcaster.username) || text(broadcaster.channel_slug) || "Kick"
    },
    author: {
      id: id(sender.user_id),
      name: text(sender.username) || "Unknown",
      color: text(identity.username_color) || undefined,
      badges
    },
    message: { text: content, fragments: [{ type: "text", text: content }] },
    kind: "message",
    publishedAt: text(body.created_at) || new Date().toISOString()
  };
}
