import { createDecipheriv } from "node:crypto";
import { env } from "@/lib/env";
import type { EncryptedPayload } from "./encrypt";

/**
 * AES-256-GCM decryption.
 *
 * This is the inverse of encrypt(). If the ciphertext, IV, or auth tag have
 * been modified — or if a different key is used — `decipher.final()` throws
 * with "Unsupported state or unable to authenticate data". That error is
 * intentional: it means tampering was detected and the plaintext should NOT
 * be trusted.
 *
 * Callers should treat any thrown error as a hard failure — log it, surface
 * a 500, but never fall back to using partial output.
 */

export function decrypt(payload: EncryptedPayload): string {
  if (
    !payload ||
    typeof payload.ciphertext !== "string" ||
    typeof payload.iv !== "string" ||
    typeof payload.authTag !== "string"
  ) {
    throw new TypeError(
      "decrypt() expects { ciphertext, iv, authTag } as base64 strings",
    );
  }

  const iv = Buffer.from(payload.iv, "base64");
  const authTag = Buffer.from(payload.authTag, "base64");
  const ciphertext = Buffer.from(payload.ciphertext, "base64");

  // Sanity checks — these would be programmer errors, not attack signals.
  if (iv.length !== 12) {
    throw new Error(`Invalid IV length: expected 12 bytes, got ${iv.length}`);
  }
  if (authTag.length !== 16) {
    throw new Error(
      `Invalid auth tag length: expected 16 bytes, got ${authTag.length}`,
    );
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    env.ENCRYPTION_KEY_BYTES,
    iv,
  );

  // Tag must be set BEFORE final(). If the tag doesn't match the ciphertext,
  // final() throws — this is the authentication step.
  decipher.setAuthTag(authTag);

  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return plaintext.toString("utf8");
}