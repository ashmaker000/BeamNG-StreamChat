import assert from "node:assert/strict";
import { generateKeyPairSync, createSign } from "node:crypto";
import test from "node:test";
import { verifyKickSignature } from "./verify.js";

test("verifies the exact Kick signed message and rejects tampering", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const messageId = "01TEST";
  const timestamp = "2026-08-26T12:00:00Z";
  const body = Buffer.from('{"message_id":"chat-1","content":"hello"}');
  const signer = createSign("RSA-SHA256");
  signer.update(`${messageId}.${timestamp}.`);
  signer.update(body);
  signer.end();
  const signature = signer.sign(privateKey).toString("base64");
  const pem = publicKey.export({ type: "spki", format: "pem" }).toString();

  assert.equal(verifyKickSignature(pem, messageId, timestamp, body, signature), true);
  assert.equal(verifyKickSignature(pem, messageId, timestamp, Buffer.from("tampered"), signature), false);
});

