import { cookies } from "next/headers";
import { timingSafeEqual } from "node:crypto";

/**
 * CSRF check for state-changing routes.
 *
 * The middleware issues two cookies with the SAME value:
 *   - `csrf_token` (HttpOnly, server-side reference)
 *   - `csrf_token_client` (readable by JS, echoed back as a header)
 *
 * On any mutating request, the client must send `x-csrf-token` matching the
 * HttpOnly cookie. Attacker pages on other origins can't read the readable
 * cookie (browser blocks cross-origin reads of cookie headers), so they
 * can't forge a matching header. The HttpOnly cookie alone isn't enough
 * because that's exactly what CSRF abuses (the browser sends it
 * automatically).
 *
 * Webhook routes skip this — they authenticate with HMAC signatures instead.
 */

export async function verifyCsrf(
  request: Request,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  // Only mutating verbs need CSRF protection.
  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return { ok: true };
  }

  const headerToken = request.headers.get("x-csrf-token");
  if (!headerToken) {
    return { ok: false, reason: "Missing x-csrf-token header" };
  }

  const store = await cookies();
  const cookieToken = store.get("csrf_token")?.value;
  if (!cookieToken) {
    return { ok: false, reason: "Missing csrf_token cookie" };
  }

  if (headerToken.length !== cookieToken.length) {
    return { ok: false, reason: "CSRF token mismatch" };
  }

  const a = Buffer.from(headerToken, "utf8");
  const b = Buffer.from(cookieToken, "utf8");
  try {
    if (!timingSafeEqual(a, b)) {
      return { ok: false, reason: "CSRF token mismatch" };
    }
  } catch {
    return { ok: false, reason: "CSRF token compare failed" };
  }

  return { ok: true };
}