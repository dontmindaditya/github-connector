import { NextRequest, NextResponse } from "next/server";

/**
 * Edge middleware.
 *
 * Runs on every matched request before the route handler. We use it for three
 * concerns that should be applied uniformly:
 *
 *  1. Security headers — HSTS, CSP, frame-ancestors, etc. Set once here so
 *     individual routes don't have to remember.
 *  2. CSRF token issuance — drops a token cookie + matching readable cookie
 *     so the client can echo it back via header (double-submit pattern).
 *  3. Hooks for rate limiting — the actual limiter lives in
 *     `src/lib/ratelimit/limiter.ts` and is invoked from route handlers
 *     where it has access to Node APIs / the DB. Middleware runs on the Edge
 *     runtime, so heavy work belongs in the handler.
 *
 * Note: the webhook endpoint is INTENTIONALLY excluded from CSRF — GitHub
 * is not a browser, can't read cookies, and authenticates via the
 * X-Hub-Signature-256 header instead.
 */

const PUBLIC_PATHS = [
  "/_next",
  "/favicon.ico",
  "/api/webhooks/github", // CSRF-exempt, HMAC-verified instead
];

// 32 hex chars = 16 bytes of entropy, plenty for CSRF.
function generateToken(): string {
  // Edge runtime provides Web Crypto.
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const res = NextResponse.next();
  const isDev = process.env.NODE_ENV !== "production";

  // ---------------------------------------------------------------------------
  // 1. Security headers
  // ---------------------------------------------------------------------------
  // HSTS — only meaningful over HTTPS, but harmless on http (browsers ignore it).
  res.headers.set(
    "Strict-Transport-Security",
    "max-age=63072000; includeSubDomains; preload",
  );
  // Prevent MIME-sniffing.
  res.headers.set("X-Content-Type-Options", "nosniff");
  // Refuse to be framed (clickjacking).
  res.headers.set("X-Frame-Options", "DENY");
  // Limit referrer leakage.
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  // Modern replacement for X-XSS-Protection (which is deprecated).
  res.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  );
  // CSP — tight default. Adjust `img-src` if you add avatars from other hosts.
  // `connect-src` includes GitHub for any client-side fetches you might add.
  res.headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline'", // Tailwind injects inline styles
      "img-src 'self' data: https://avatars.githubusercontent.com https://github.com",
      "font-src 'self' data:",
      "connect-src 'self' https://api.github.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self' https://github.com",
    ].join("; "),
  );

  // Skip CSRF + rate-limit hints for static + webhook paths.
  if (isPublicPath(pathname)) return res;

  // ---------------------------------------------------------------------------
  // 2. CSRF token (double-submit cookie)
  // ---------------------------------------------------------------------------
  // Strategy: keep ONE HttpOnly cookie (`csrf_token`) as the source of truth,
  // and a SECOND, non-HttpOnly cookie (`csrf_token_client`) that the client
  // can read and echo back as `x-csrf-token` on mutating requests. The
  // server compares the two. Because attacker pages on other origins can't
  // read either cookie, they can't forge a matching pair.
  const existing = req.cookies.get("csrf_token")?.value;
  if (!existing) {
    const token = generateToken();
    const isProd = process.env.NODE_ENV === "production";
    res.cookies.set("csrf_token", token, {
      httpOnly: true,
      secure: isProd,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24, // 24h
    });
    res.cookies.set("csrf_token_client", token, {
      httpOnly: false, // readable by client to echo back
      secure: isProd,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24,
    });
  }

  // ---------------------------------------------------------------------------
  // 3. Pass-through; actual CSRF + rate-limit checks happen in route handlers
  //    so they can return structured JSON errors and touch the DB.
  // ---------------------------------------------------------------------------
  return res;
}

export const config = {
  // Match everything except static assets. Webhook path is allowed through
  // (we want security headers there too) but skipped above for CSRF.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
