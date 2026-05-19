import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { guardRequest } from "@/app/api/_lib/guard";
import { ok, fail, failFromError } from "@/app/api/_lib/response";
import { resolveRepoForUser } from "@/app/api/_lib/resolve-repo";
import type { CommitSummary } from "@/types/github";

/**
 * GET /api/github/repos/{owner}/{repo}/commits?ref=main&per_page=30&page=1
 *
 * Returns recent commits on a branch (or any ref). Default branch is used
 * if no ref is provided.
 *
 * Pagination is straight passthrough to GitHub's `page` / `per_page`. We
 * don't aggregate across pages — that's the UI's job (infinite scroll or
 * paged buttons).
 */

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ owner: string; repo: string }>;
}

export async function GET(req: NextRequest, { params }: RouteContext) {
  try {
    const guard = await guardRequest(req, { routeName: "github.commits" });
    if (guard) return guard;

    const user = await requireUser();
    const { owner, repo } = await params;

    if (!owner || !repo) {
      return fail("BAD_REQUEST", "Missing owner or repo", 400);
    }

    const url = new URL(req.url);
    const ref = url.searchParams.get("ref") ?? undefined;
    const perPage = Math.min(
      100,
      Math.max(1, Number(url.searchParams.get("per_page") ?? 30)),
    );
    const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));

    const { octokit, defaultBranch } = await resolveRepoForUser({
      owner,
      repo,
      userId: user.id,
    });

    const { data: commits } = await octokit.rest.repos.listCommits({
      owner,
      repo,
      sha: ref ?? defaultBranch,
      per_page: perPage,
      page,
    });

    // Octokit's commit objects nest the parts we need across `commit`,
    // `author`, and `commit.author`. Normalize to the lean UI shape.
    const data: CommitSummary[] = commits.map((c: (typeof commits)[number]) => ({
      sha: c.sha,
      message: c.commit.message,
      htmlUrl: c.html_url,
      author: {
        name: c.commit.author?.name ?? null,
        email: c.commit.author?.email ?? null,
        date: c.commit.author?.date ?? null,
        login: c.author?.login ?? null,
        avatarUrl: c.author?.avatar_url ?? null,
      },
    }));

    return ok(data);
  } catch (err) {
    return failFromError(err);
  }
}