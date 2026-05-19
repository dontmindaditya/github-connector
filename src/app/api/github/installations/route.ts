import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { guardRequest } from "@/app/api/_lib/guard";
import { ok, failFromError } from "@/app/api/_lib/response";
import type {
  GitHubAccountType,
  InstallationSummary,
  RepositorySelection,
} from "@/types/github";

/**
 * GET /api/github/installations
 *
 * Lists all GitHub App installations belonging to the current app user.
 * One user can have multiple installations (e.g. their personal account
 * plus several orgs).
 *
 * Pure DB read — no GitHub call. Cheap and fast.
 */

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const guard = await guardRequest(req, { routeName: "github.installations" });
    if (guard) return guard;

    const user = await requireUser();

    const rows = await prisma.gitHubInstallation.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
    });

    const data: InstallationSummary[] = rows.map((r) => ({
      id: r.id,
      installationId: r.installationId.toString(),
      accountLogin: r.accountLogin,
      accountType: r.accountType as GitHubAccountType,
      repositorySelection: r.repositorySelection as RepositorySelection,
      suspendedAt: r.suspendedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    }));

    return ok(data);
  } catch (err) {
    return failFromError(err);
  }
}