import { NextResponse } from "next/server";
import type { ApiError, ApiResponse } from "@/types/github";
import { UnauthorizedError } from "@/lib/auth/session";
import {
  InstallationNotFoundError,
  InstallationSuspendedError,
} from "@/lib/github/octokit-factory";

/**
 * JSON response helpers for API routes.
 *
 * Every route returns ApiResponse<T> — a discriminated union of
 * `{ ok: true, data }` and `{ ok: false, error: { code, message } }`.
 * Centralizing here means clients have ONE shape to parse.
 */

export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  const body: ApiResponse<T> = { ok: true, data };
  return NextResponse.json(body, init);
}

export function fail(
  code: string,
  message: string,
  status = 400,
): NextResponse {
  const body: ApiError = { ok: false, error: { code, message } };
  return NextResponse.json(body, { status });
}

/**
 * Map known errors to HTTP responses. Anything unknown becomes a 500 with a
 * generic message — we log the real error server-side but never leak stack
 * traces to clients.
 */
export function failFromError(err: unknown): NextResponse {
  if (err instanceof UnauthorizedError) {
    return fail("UNAUTHORIZED", err.message, 401);
  }
  if (err instanceof InstallationNotFoundError) {
    return fail("INSTALLATION_NOT_FOUND", err.message, 404);
  }
  if (err instanceof InstallationSuspendedError) {
    return fail("INSTALLATION_SUSPENDED", err.message, 403);
  }

  // Octokit errors carry a `status` field for HTTP status codes.
  const status = (err as { status?: number } | null)?.status;
  if (typeof status === "number" && status >= 400 && status < 500) {
    const message =
      (err as { message?: string } | null)?.message ?? "Upstream error";
    return fail("UPSTREAM_ERROR", message, status);
  }

  console.error("[api] unhandled error", err);
  return fail("INTERNAL_ERROR", "Internal server error", 500);
}
