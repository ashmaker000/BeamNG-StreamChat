import { spawn } from "node:child_process";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface StoredTwitchToken {
  clientId: string;
  refreshToken: string;
}

interface TokenDatabase {
  [pairingHash: string]: StoredTwitchToken;
}

export class TokenStore {
  private readonly filePath: string;

  constructor(filePath = defaultTokenPath()) {
    this.filePath = filePath;
  }

  async get(pairingHash: string): Promise<StoredTwitchToken | undefined> {
    const database = await this.readDatabase();
    return database[pairingHash];
  }

  async set(pairingHash: string, value: StoredTwitchToken): Promise<void> {
    const database = await this.readDatabase();
    database[pairingHash] = value;
    const protectedData = await protectForCurrentWindowsUser(JSON.stringify(database));
    await mkdir(dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
    await writeFile(temporaryPath, protectedData, { encoding: "utf8", mode: 0o600 });
    await rename(temporaryPath, this.filePath);
  }

  async delete(pairingHash: string): Promise<void> {
    const database = await this.readDatabase();
    if (!(pairingHash in database)) return;
    delete database[pairingHash];
    const protectedData = await protectForCurrentWindowsUser(JSON.stringify(database));
    await mkdir(dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
    await writeFile(temporaryPath, protectedData, { encoding: "utf8", mode: 0o600 });
    await rename(temporaryPath, this.filePath);
  }

  private async readDatabase(): Promise<TokenDatabase> {
    try {
      const protectedData = await readFile(this.filePath, "utf8");
      const clearText = await unprotectForCurrentWindowsUser(protectedData.trim());
      const value: unknown = JSON.parse(clearText);
      return value && typeof value === "object" && !Array.isArray(value) ? value as TokenDatabase : {};
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
      throw error;
    }
  }
}

function defaultTokenPath(): string {
  const appData = process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local");
  return join(appData, "BeamNGStreamChat", "twitch-auth.dpapi");
}

async function protectForCurrentWindowsUser(clearText: string): Promise<string> {
  ensureWindows();
  const script = [
    "Add-Type -AssemblyName System.Security",
    "$value = [Console]::In.ReadToEnd()",
    "$bytes = [Text.Encoding]::UTF8.GetBytes($value)",
    "$encrypted = [Security.Cryptography.ProtectedData]::Protect($bytes, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)",
    "[Console]::Out.Write([Convert]::ToBase64String($encrypted))"
  ].join("; ");
  return (await runPowerShell(script, clearText)).trim();
}

async function unprotectForCurrentWindowsUser(protectedData: string): Promise<string> {
  ensureWindows();
  const script = [
    "Add-Type -AssemblyName System.Security",
    "$value = [Console]::In.ReadToEnd()",
    "$bytes = [Convert]::FromBase64String($value)",
    "$clear = [Security.Cryptography.ProtectedData]::Unprotect($bytes, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)",
    "[Console]::Out.Write([Text.Encoding]::UTF8.GetString($clear))"
  ].join("; ");
  return runPowerShell(script, protectedData);
}

function ensureWindows(): void {
  if (process.platform !== "win32") {
    throw new Error("Secure Twitch token storage currently requires Windows");
  }
}

function runPowerShell(script: string, input: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"]
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let outputSize = 0;
    child.stdout.on("data", (chunk: Buffer) => {
      outputSize += chunk.length;
      if (outputSize > 1024 * 1024) child.kill();
      else stdout.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(Buffer.concat(stdout).toString("utf8"));
      else reject(new Error(Buffer.concat(stderr).toString("utf8").trim() || `PowerShell exited with code ${code}`));
    });
    child.stdin.end(input);
  });
}
