import { createVerify } from "node:crypto";

export function verifyKickSignature(
  publicKey: string,
  messageId: string,
  timestamp: string,
  body: Buffer,
  signature: string
): boolean {
  try {
    const verifier = createVerify("RSA-SHA256");
    verifier.update(`${messageId}.${timestamp}.`);
    verifier.update(body);
    verifier.end();
    return verifier.verify(publicKey, Buffer.from(signature, "base64"));
  } catch {
    return false;
  }
}

