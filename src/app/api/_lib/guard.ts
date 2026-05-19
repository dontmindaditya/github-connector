import type { NextRequest } from "next/server";
import { verifyCsrf } from "@/lib/auth/csrf";
import {
  checkRateLimit,
  clientIpFromHeaders,
} from "@/lib/ratelimit/limiter";
import { fail } from "./response";

interface GuardOptions {
  /** Bucket name for the rate-limit key. e.g. "github.repos" */
  routeName: string;
  /** Max requests per window. Defaults to 60. */
  limit?: number;
  /** Window length in ms. Defaults to 60_000 (1 minute). */
  windowMs?: number;
  /** Skip CSRF check (use only when a route authenticates by other means). */
  skipCsrf?: boolean;
}

/**
 * One-call guard for API routes.
 *
 * Returns a NextResponse if the request should be rejected (rate-limited or
 * CSRF failure), or `null` to let the caller proceed. This avoids
 * boilerplate at the top of every handler.
 */
export async function guardRequest(
  req: NextRequest,
  opts: GuardOptions,
): Promise<Response | null> {
  // ---- CSRF ----
  if (!opts.skipCsrf) {
    const result = await verifyCsrf(req);
    if (!result.ok) {
      return fail("CSRF_FAILED", result.reason, 403);
    }
  }

  // ---- Rate limit ----
  const ip = clientIpFromHeaders(req.headers);
  const limit = opts.limit ?? 60;
  const windowMs = opts.windowMs ?? 60_000;
  const rl = checkRateLimit({
    key: `${opts.routeName}:${ip}`,
    limit,
    windowMs,
  });
  if (!rl.ok) {
    const retryAfter = Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000));
    const res = fail("RATE_LIMITED", "Too many requests", 429);
    res.headers.set("Retry-After", String(retryAfter));
    res.headers.set("X-RateLimit-Remaining", "0");
    res.headers.set("X-RateLimit-Reset", String(Math.floor(rl.resetAt / 1000)));
    return res;
  }

  return null;
}
