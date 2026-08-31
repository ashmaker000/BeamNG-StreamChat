import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export function loadIpcKey(filePath = defaultIpcKeyPath()): string {
  const key = readFileSync(filePath, "utf8").trim();
  if (!/^[A-Za-z0-9_-]{43}$/.test(key)) {
    throw new Error("The Stream Chat installation key is missing or invalid; run the installer again");
  }
  return key;
}

function defaultIpcKeyPath(): string {
  const appData = process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local");
  return process.env.STREAM_CHAT_IPC_KEY_FILE || join(appData, "BeamNGStreamChat", "ipc-key");
}
