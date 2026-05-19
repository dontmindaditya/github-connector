import { NextRequest, NextResponse } from "next/server";
import {
  clearStateCookie,
  verifyInstallState,
} from "@/lib/auth/state";
import { prisma } from "@/lib/db/prisma";
import { getAppOctokit, getOctokitForInstallation } from "@/lib/github";
import { failFromError } from "@/app/api/_lib/response";
import { env } from "@/lib/env";
import type { GitHubAccountType, RepositorySelection } from "@/types/github";

/**
 * GET /api/github/callback
 *
 * Handles the redirect from GitHub after the user finishes installing the
 * App. Query params we care about:
 *   - installation_id: numeric, from GitHub
 *   - setup_action: "install" | "update"
 *   - state: the value we set on the state cookie (CSRF defence)
 *
 * Steps:
 *   1. Verify state matches the cookie. If not, abort — this could be a
 *      drive-by where someone tries to bind their installation to our user.
 *   2. Read the user from session — required to know whose installation
 *      this is.
 *   3. Use App-level Octokit to fetch the installation metadata.
 *   4. Upsert GitHubInstallation row.
 *   5. Pull the initial repo list and upsert Repository rows.
 *   6. Clear the state cookie and redirect to /repositories.
 *
 * Important: we DO NOT trust ?installation_id alone. We confirm with GitHub
 * that the installation exists and read its true owner. A malicious caller
 * who crafts ?installation_id=999 would either hit a 404 or get a row that
 * doesn't belong to our App.
 */

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const installationIdParam = url.searchParams.get("installation_id");
    const setupAction = url.searchParams.get("setup_action");
    const stateFromUrl = url.searchParams.get("state");

    // ---- 1. State / CSRF ----
    const verifiedState = verifyInstallState(stateFromUrl);
    if (!verifiedState) {
      // Wipe the cookie regardless of outcome so it can't be replayed.
      await clearStateCookie();
      return NextResponse.redirect(
        new URL("/connect?error=invalid_state", env.APP_URL),
        { status: 302 },
      );
    }
    await clearStateCookie();

    if (!installationIdParam) {
      return NextResponse.redirect(
        new URL("/connect?error=missing_installation_id", env.APP_URL),
        { status: 302 },
      );
    }

    const installationGithubId = BigInt(installationIdParam);

    // ---- 2. App user ----
    const user = await prisma.user.findUnique({
      where: { id: verifiedState.userId },
    });
    if (!user) {
      return NextResponse.redirect(
        new URL("/connect?error=missing_user", env.APP_URL),
        { status: 302 },
      );
    }

    // ---- 3. Fetch install metadata via App JWT ----
    const appOctokit = getAppOctokit();
    const { data: install } = await appOctokit.rest.apps.getInstallation({
      installation_id: Number(installationGithubId),
    });

    // GitHub's response types are a union (User | Enterprise | etc).
    // Narrow to what we expect; if `account` is null (rare org case), bail.
    const account = install.account;
    if (!account) {
      return NextResponse.redirect(
        new URL("/connect?error=missing_account", env.APP_URL),
        { status: 302 },
      );
    }

    // `account` can be `SimpleUser` (User type) or `Enterprise`. We only
    // support user/org installs; reject Enterprise installs here.
    if (!("login" in account) || !("id" in account)) {
      return NextResponse.redirect(
        new URL("/connect?error=unsupported_account_type", env.APP_URL),
        { status: 302 },
      );
    }

    const accountType = (install.target_type as GitHubAccountType) ?? "User";
    const repositorySelection =
      (install.repository_selection as RepositorySelection) ?? "selected";

    // ---- 4. Upsert installation row ----
    const dbInstall = await prisma.gitHubInstallation.upsert({
      where: { installationId: installationGithubId },
      create: {
        installationId: installationGithubId,
        accountId: BigInt(account.id),
        accountLogin: account.login,
        accountType,
        targetType: install.target_type ?? accountType,
        repositorySelection,
        permissions: install.permissions as object,
        events: install.events ?? [],
        userId: user.id,
      },
      update: {
        // If a user re-installs, keep them as the owner; only metadata refreshes.
        accountId: BigInt(account.id),
        accountLogin: account.login,
        accountType,
        targetType: install.target_type ?? accountType,
        repositorySelection,
        permissions: install.permissions as object,
        events: install.events ?? [],
        suspendedAt: null, // re-install clears suspension
      },
    });

    // ---- 5. Initial repo sync ----
    // Use an installation-scoped Octokit (auto-paginates).
    const { octokit } = await getOctokitForInstallation({
      installationDbId: dbInstall.id,
    });

    const repos = await octokit.paginate(
      octokit.rest.apps.listReposAccessibleToInstallation,
      { per_page: 100 },
    );

    if (repos.length > 0) {
      await prisma.$transaction(
        repos.map((repo: (typeof repos)[number]) =>
          prisma.repository.upsert({
            where: { githubRepoId: BigInt(repo.id) },
            create: {
              githubRepoId: BigInt(repo.id),
              nodeId: repo.node_id,
              name: repo.name,
              fullName: repo.full_name,
              private: repo.private,
              defaultBranch: repo.default_branch ?? "main",
              htmlUrl: repo.html_url,
              description: repo.description,
              language: repo.language,
              archived: repo.archived,
              disabled: repo.disabled,
              pushedAt: repo.pushed_at ? new Date(repo.pushed_at) : null,
              installationId: dbInstall.id,
            },
            update: {
              name: repo.name,
              fullName: repo.full_name,
              private: repo.private,
              defaultBranch: repo.default_branch ?? "main",
              htmlUrl: repo.html_url,
              description: repo.description,
              language: repo.language,
              archived: repo.archived,
              disabled: repo.disabled,
              pushedAt: repo.pushed_at ? new Date(repo.pushed_at) : null,
              installationId: dbInstall.id,
              lastSyncedAt: new Date(),
            },
          }),
        ),
      );
    }

    // ---- 6. Done — go to the dashboard ----
    void setupAction; // currently unused but kept for future "update" handling
    return NextResponse.redirect(
      new URL("/repositories?installed=1", env.APP_URL),
      { status: 302 },
    );
  } catch (err) {
    return failFromError(err);
  }
}
