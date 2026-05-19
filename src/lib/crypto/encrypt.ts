import { createCipheriv, randomBytes } from "node:crypto";
import { env } from "@/lib/env";

/**
 * AES-256-GCM encryption.
 *
 * Why AES-256-GCM
 * ---------------
 * GCM is an "authenticated" cipher mode — it produces both ciphertext AND an
 * authentication tag. Decrypting with the tag verifies the data hasn't been
 * tampered with. Without authentication (e.g. raw CBC), an attacker with DB
 * write access could flip bits in the ciphertext and we'd silently decrypt
 * garbage. With GCM, decrypt() throws if anything was modified.
 *
 * IV (initialization vector)
 * --------------------------
 * GCM requires a UNIQUE IV per encryption with the same key. 12 bytes is the
 * recommended size for GCM (NIST SP 800-38D). We generate a fresh random IV
 * for every call. Reusing an IV with the same key is catastrophic — it leaks
 * the XOR of two plaintexts and breaks authentication entirely.
 *
 * Output
 * ------
 * Three base64 strings: ciphertext, iv, authTag. Stored as separate columns
 * on `encrypted_tokens` so we don't have to parse a packed format on read.
 */

export interface EncryptedPayload {
  ciphertext: string; // base64
  iv: string; // base64, 12 bytes
  authTag: string; // base64, 16 bytes
}

export function encrypt(plaintext: string): EncryptedPayload {
  if (typeof plaintext !== "string") {
    throw new TypeError("encrypt() expects a string");
  }

  // 12-byte IV for GCM. Crypto-secure random.
  const iv = randomBytes(12);

  // Cipher is keyed with the 32 raw bytes derived from ENCRYPTION_KEY at boot.
  const cipher = createCipheriv("aes-256-gcm", env.ENCRYPTION_KEY_BYTES, iv);

  // Buffer.concat so we capture the final block too.
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  // Auth tag must be read AFTER final(). It's 16 bytes by default for GCM.
  const authTag = cipher.getAuthTag();

  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
  };
}