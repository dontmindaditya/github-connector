import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { guardRequest } from "@/app/api/_lib/guard";
import { ok, fail, failFromError } from "@/app/api/_lib/response";
import { resolveRepoForUser } from "@/app/api/_lib/resolve-repo";
import type { BranchSummary } from "@/types/github";

/**
 * GET /api/github/repos/{owner}/{repo}/branches
 *
 * Private vs public is irrelevant here — the installation token's scope
 * decides. If the App was granted access to the repo, this works. If not,
 * GitHub returns 404 and we surface it as 404.
 */

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ owner: string; repo: string }>;
}

export async function GET(req: NextRequest, { params }: RouteContext) {
  try {
    const guard = await guardRequest(req, { routeName: "github.branches" });
    if (guard) return guard;

    const user = await requireUser();
    const { owner, repo } = await params;

    if (!owner || !repo) {
      return fail("BAD_REQUEST", "Missing owner or repo", 400);
    }

    const { octokit } = await resolveRepoForUser({
      owner,
      repo,
      userId: user.id,
    });

    // listBranches paginates; we cap at 100 for the UI. Add pagination later
    // if you have repos with hundreds of branches.
    const branches = await octokit.paginate(octokit.rest.repos.listBranches, {
      owner,
      repo,
      per_page: 100,
    });

    const data: BranchSummary[] = branches.map((b: (typeof branches)[number]) => ({
      name: b.name,
      protected: b.protected,
      commit: { sha: b.commit.sha, url: b.commit.url },
    }));

    return ok(data);
  } catch (err) {
    return failFromError(err);
  }
}