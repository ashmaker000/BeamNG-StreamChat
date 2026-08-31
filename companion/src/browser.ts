import { spawn } from "node:child_process";

export function parseTwitchActivationUrl(value: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("Invalid Twitch activation URL"); }
  const code = url.searchParams.get("device-code");
  if (
    url.protocol !== "https:" ||
    url.hostname !== "www.twitch.tv" ||
    url.port ||
    url.username ||
    url.password ||
    url.pathname !== "/activate" ||
    !code ||
    !/^[A-Z0-9]{6,12}$/i.test(code)
  ) {
    throw new Error("Only Twitch device activation URLs may be opened");
  }
  return url.toString();
}

export function openTwitchActivation(value: string): Promise<void> {
  const url = parseTwitchActivationUrl(value);
  if (process.platform !== "win32") throw new Error("Opening Twitch currently requires Windows");
  return new Promise((resolve, reject) => {
    const script = "$url = [Console]::In.ReadToEnd(); Start-Process -FilePath $url";
    const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
      stdio: ["pipe", "ignore", "pipe"],
      windowsHide: true
    });
    const errors: Buffer[] = [];
    child.stderr.on("data", (chunk: Buffer) => errors.push(chunk));
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(Buffer.concat(errors).toString("utf8").trim() || `Browser launcher exited with code ${code}`));
    });
    child.stdin.end(url);
  });
}
