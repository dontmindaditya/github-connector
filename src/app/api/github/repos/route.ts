import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { guardRequest } from "@/app/api/_lib/guard";
import { ok, failFromError } from "@/app/api/_lib/response";
import type { RepositorySummary } from "@/types/github";

/**
 * GET /api/github/repos
 *
 * Returns the user's connected repositories from our denormalized cache.
 * Optional query: ?installation_id={dbId} to filter to one install.
 *
 * Why we read from the cache instead of GitHub
 * --------------------------------------------
 * The cache is kept fresh by the `installation_repositories` webhook and
 * the initial sync on callback. Reading from GitHub on every page load
 * would (a) burn rate limit and (b) be slower. If you want a force-refresh
 * endpoint, add a POST that calls listReposAccessibleToInstallation and
 * upserts.
 *
 * Authorization
 * -------------
 * We filter by `installation.userId = currentUser.id`. There's no way for
 * one user to query another user's repos through this route.
 */

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const guard = await guardRequest(req, { routeName: "github.repos" });
    if (guard) return guard;

    const user = await requireUser();

    const url = new URL(req.url);
    const installationDbId = url.searchParams.get("installation_id");

    const repos = await prisma.repository.findMany({
      where: {
        installation: { userId: user.id },
        ...(installationDbId ? { installationId: installationDbId } : {}),
      },
      orderBy: [{ pushedAt: "desc" }, { name: "asc" }],
    });

    const data: RepositorySummary[] = repos.map((r) => ({
      id: r.id,
      githubRepoId: r.githubRepoId.toString(),
      name: r.name,
      fullName: r.fullName,
      private: r.private,
      defaultBranch: r.defaultBranch,
      htmlUrl: r.htmlUrl,
      description: r.description,
      language: r.language,
      archived: r.archived,
      disabled: r.disabled,
      pushedAt: r.pushedAt?.toISOString() ?? null,
      lastSyncedAt: r.lastSyncedAt.toISOString(),
    }));

    return ok(data);
  } catch (err) {
    return failFromError(err);
  }
}