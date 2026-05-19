import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

/**
 * GitHub webhook signature verification.
 *
 * GitHub signs every webhook delivery with HMAC-SHA256 of the raw request
 * body using the secret we configured on the App's webhook settings. The
 * signature arrives in the `X-Hub-Signature-256` header, formatted as
 * `sha256=<hex>`.
 *
 * Two non-obvious rules to get right
 * ----------------------------------
 * 1. Verify against the RAW body, byte-for-byte. If you JSON.parse and
 *    re-stringify, key order or whitespace differences will change the hash
 *    and verification will fail. The Next.js route reads the body with
 *    `await req.text()` and passes that string here.
 *
 * 2. Use `timingSafeEqual` — comparing strings with `===` leaks timing
 *    information that an attacker can exploit to forge signatures byte by
 *    byte. timingSafeEqual takes constant time regardless of where the
 *    mismatch occurs.
 */

export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
): boolean {
  if (!signatureHeader) return false;
  if (!signatureHeader.startsWith("sha256=")) return false;

  const provided = signatureHeader.slice("sha256=".length);

  // Compute expected hash over the raw body with the configured secret.
  const expected = createHmac("sha256", env.GITHUB_WEBHOOK_SECRET)
    .update(rawBody, "utf8")
    .digest("hex");

  // Buffers must be the same length or timingSafeEqual throws. If lengths
  // differ, the signature is already invalid — bail out before the compare.
  const a = Buffer.from(provided, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length) return false;

  try {
    return timingSafeEqual(a, b);
  } catch {
    // Defensive: timingSafeEqual throws on non-buffer inputs.
    return false;
  }
}