import { NextRequest, NextResponse } from "next/server";
import { generateState, setStateCookie } from "@/lib/auth/state";
import { env } from "@/lib/env";
import { guardRequest } from "@/app/api/_lib/guard";
import { failFromError } from "@/app/api/_lib/response";
import { requireUser } from "@/lib/auth/session";

/**
 * GET /api/github/install
 *
 * The entry point of the install flow. Steps:
 *   1. Confirm we have an app-user session — we need a user to attach the
 *      installation to on callback.
 *   2. Mint a random `state` value, set it as an HttpOnly cookie.
 *   3. 302 to GitHub's install page with the state as a query param.
 *
 * GitHub displays the repo selection UI to the user. After they finish, it
 * redirects back to /api/github/callback?installation_id=...&state=...
 *
 * The install URL is:
 *   https://github.com/apps/{slug}/installations/new?state={state}
 *
 * NOTE: GitHub does NOT honor `redirect_uri` for App installations unless
 * "Request user authorization (OAuth) during installation" is enabled in
 * the App settings. The callback URL is configured server-side on the App.
 */

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const guard = await guardRequest(req, {
      routeName: "github.install",
      limit: 10,
      windowMs: 60_000,
    });
    if (guard) return guard;

    // Require a logged-in app user before starting the install flow.
    // (Otherwise we'd have no one to attach the installation to.)
    const user = await requireUser();

    const state = generateState(user.id);
    await setStateCookie(state);

    const installUrl = new URL(
      `https://github.com/apps/${env.GITHUB_APP_SLUG}/installations/new`,
    );
    installUrl.searchParams.set("state", state);

    return NextResponse.redirect(installUrl.toString(), { status: 302 });
  } catch (err) {
    return failFromError(err);
  }
}
