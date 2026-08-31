import "dotenv/config";
import { z } from "zod";

export const config = z.object({
  PORT: z.coerce.number().int().min(1024).max(65535).default(8080),
  RELAY_CLIENT_TOKEN: z.string().min(32),
  KICK_PUBLIC_KEY: z.string().min(64).transform((value) => value.replace(/\\n/g, "\n"))
}).parse(process.env);

