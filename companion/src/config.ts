import "dotenv/config";
import { z } from "zod";

const optionalString = z.string().trim().optional().transform((value) => value || undefined);

const schema = z.object({
  COMPANION_PORT: z.coerce.number().int().min(1024).max(65535).default(8765),
  MOCK_CHAT: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  TWITCH_CLIENT_ID: optionalString,
  TWITCH_ACCESS_TOKEN: optionalString,
  TWITCH_BROADCASTER_ID: optionalString,
  TWITCH_USER_ID: optionalString,
  YOUTUBE_ACCESS_TOKEN: optionalString,
  YOUTUBE_LIVE_CHAT_ID: optionalString,
  KICK_RELAY_URL: optionalString,
  KICK_RELAY_TOKEN: optionalString
});

export const config = schema.parse(process.env);

