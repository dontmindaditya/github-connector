/**
 * Rate limiter (sliding window, in-memory).
 *
 * Honest caveat
 * -------------
 * This is an in-process implementation. It works on a single instance and is
 * useful for local dev and small deployments. On Vercel's serverless model,
 * each invocation can hit a different lambda, so the counter is effectively
 * per-instance — limits can be exceeded under load.
 *
 * For production multi-instance use, swap this module's internals for
 * Upstash Redis (or any shared store) while keeping the public API
 * identical:
 *
 *   import { Ratelimit } from "@upstash/ratelimit";
 *   import { Redis } from "@upstash/redis";
 *
 *   const limiter = new Ratelimit({
 *     redis: Redis.fromEnv(),
 *     limiter: Ratelimit.slidingWindow(60, "1 m"),
 *   });
 *
 * Sliding window algorithm
 * ------------------------
 * For each key, we keep an array of request timestamps. On each `check()`
 * we drop timestamps older than the window, then either append the current
 * timestamp (if count < limit) and return ok, or reject. This is more
 * accurate than fixed windows (no edge-of-bucket spikes) and cheap enough
 * at this volume.
 */

interface Window {
  timestamps: number[];
}

const store = new Map<string, Window>();

// Periodic GC so the map doesn't grow without bound. Runs every 60s.
// (no-op on Edge runtime — only used in Node route handlers)
let gcStarted = false;
function ensureGc(windowMs: number) {
  if (gcStarted) return;
  gcStarted = true;
  if (typeof setInterval === "undefined") return;
  setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [key, win] of store.entries()) {
      win.timestamps = win.timestamps.filter((t) => t > cutoff);
      if (win.timestamps.length === 0) store.delete(key);
    }
  }, 60_000).unref?.();
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  resetAt: number; // epoch ms when next slot opens
}

export interface RateLimitOptions {
  /** Unique bucket key. Usually `${routeName}:${ipOrUserId}` */
  key: string;
  /** Max requests in the window */
  limit: number;
  /** Window length in ms */
  windowMs: number;
}

export function checkRateLimit({
  key,
  limit,
  windowMs,
}: RateLimitOptions): RateLimitResult {
  ensureGc(windowMs);

  const now = Date.now();
  const cutoff = now - windowMs;

  let win = store.get(key);
  if (!win) {
    win = { timestamps: [] };
    store.set(key, win);
  }

  // Drop expired timestamps.
  win.timestamps = win.timestamps.filter((t) => t > cutoff);

  if (win.timestamps.length >= limit) {
    // Earliest timestamp in window dictates when one slot will free up.
    const oldest = win.timestamps[0];
    return {
      ok: false,
      remaining: 0,
      resetAt: oldest + windowMs,
    };
  }

  win.timestamps.push(now);
  return {
    ok: true,
    remaining: limit - win.timestamps.length,
    resetAt: now + windowMs,
  };
}

/**
 * Best-effort client IP from request headers.
 *
 * Vercel sets `x-forwarded-for` and `x-real-ip`. Falls back to a single
 * shared bucket if neither header is present (better than crashing).
 */
export function clientIpFromHeaders(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const real = headers.get("x-real-ip");
  if (real) return real;
  return "unknown";
}