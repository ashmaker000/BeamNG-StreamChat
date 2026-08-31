import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { TokenStore } from "./token-store.js";

test("encrypts refresh tokens for the current Windows user", { skip: process.platform !== "win32" }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "beamng-stream-chat-token-test-"));
  try {
    const filePath = join(directory, "tokens.dpapi");
    const store = new TokenStore(filePath);
    await store.set("pairing-hash", { clientId: "client-id", refreshToken: "secret-refresh-token" });
    assert.deepEqual(await store.get("pairing-hash"), { clientId: "client-id", refreshToken: "secret-refresh-token" });
    assert.equal((await readFile(filePath, "utf8")).includes("secret-refresh-token"), false);
    await store.delete("pairing-hash");
    assert.equal(await store.get("pairing-hash"), undefined);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
