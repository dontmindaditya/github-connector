import type { Octokit } from "@octokit/rest";
import { prisma } from "@/lib/db/prisma";
import { getOctokitForInstallation } from "@/lib/github/octokit-factory";

interface ResolveArgs {
  owner: string;
  repo: string;
  userId: string;
}

interface ResolveResult {
  octokit: Octokit;
  installationDbId: string;
  defaultBranch: string;
}

/**
 * Resolve {owner, repo} to an installation-scoped Octokit, scoped to the
 * given user.
 *
 * The repo MUST exist in our denormalized Repository cache AND its
 * installation MUST belong to the user. This is both a 404 guard (so we
 * don't leak existence) and an authorization check (one user can't read
 * another's repos by guessing slugs).
 */
export async function resolveRepoForUser({
  owner,
  repo,
  userId,
}: ResolveArgs): Promise<ResolveResult> {
  const fullName = `${owner}/${repo}`;

  const row = await prisma.repository.findFirst({
    where: {
      fullName,
      installation: { userId },
    },
    select: {
      installationId: true,
      defaultBranch: true,
    },
  });

  if (!row) {
    // Generic 404 — don't disclose whether the repo exists for another user.
    const err = new Error("Repository not connected") as Error & {
      status?: number;
    };
    err.status = 404;
    throw err;
  }

  const { octokit, installationDbId } = await getOctokitForInstallation({
    installationDbId: row.installationId,
  });

  return {
    octokit,
    installationDbId,
    defaultBranch: row.defaultBranch,
  };
}
