import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { getAppOctokit } from "@/lib/github";
import { guardRequest } from "@/app/api/_lib/guard";
import { ok, fail, failFromError } from "@/app/api/_lib/response";

/**
 * POST /api/github/disconnect
 * Body: { installationId: string }   // our DB id, NOT the GitHub numeric
 *
 * Revoke a connected installation:
 *   1. Confirm it belongs to the current user.
 *   2. Call GitHub's `apps.deleteInstallation` — this severs the App↔account
 *      link on GitHub's side, so future webhooks won't fire and tokens
 *      can't be minted.
 *   3. Delete our DB row. The schema's onDelete: Cascade tears down the
 *      encrypted token + repo rows.
 *
 * GitHub will also fire an `installation.deleted` webhook back at us, which
 * our handler treats as a no-op since the row is already gone.
 *
 * Note: this is a state-changing route, so CSRF is enforced by guardRequest.
 */

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const guard = await guardRequest(req, {
      routeName: "github.disconnect",
      limit: 20,
    });
    if (guard) return guard;

    const user = await requireUser();

    const body = (await req.json().catch(() => null)) as {
      installationId?: string;
    } | null;

    if (!body?.installationId) {
      return fail("BAD_REQUEST", "installationId is required", 400);
    }

    const row = await prisma.gitHubInstallation.findFirst({
      where: { id: body.installationId, userId: user.id },
      select: { id: true, installationId: true },
    });

    if (!row) {
      return fail("NOT_FOUND", "Installation not found", 404);
    }

    // 1. Best-effort revoke on GitHub. If this fails (already deleted,
    //    permissions error), we still drop the local row.
    try {
      const appOctokit = getAppOctokit();
      await appOctokit.rest.apps.deleteInstallation({
        installation_id: Number(row.installationId),
      });
    } catch (e) {
      console.warn(
        "[disconnect] GitHub delete failed, deleting locally anyway",
        e,
      );
    }

    // 2. Local cascade: deletes encrypted_tokens + repositories via FK
    await prisma.gitHubInstallation.delete({ where: { id: row.id } });

    return ok({ deleted: true });
  } catch (err) {
    return failFromError(err);
  }
}