import { prisma } from "@/lib/db/prisma";
import type {
  InstallationWebhookPayload,
  InstallationRepositoriesPayload,
  PushWebhookPayload,
  PullRequestWebhookPayload,
  WebhookRepository,
} from "@/types/github";

/**
 * Webhook event handlers.
 *
 * The route at /api/webhooks/github verifies the HMAC signature, dedupes by
 * X-GitHub-Delivery, then dispatches here. Each handler is responsible for
 * its own DB writes and must be IDEMPOTENT — GitHub retries on non-2xx
 * responses, and our dedupe is best-effort.
 *
 * "Idempotent" in practice
 * ------------------------
 *   - Use `upsert` instead of `create`.
 *   - Use `deleteMany` instead of `delete` when removing (no-op on absent).
 *   - Don't throw on "already exists" — that's expected on a replay.
 */

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function repoToCreatePayload(
  repo: WebhookRepository,
  installationDbId: string,
) {
  return {
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
    installationId: installationDbId,
    lastSyncedAt: new Date(),
  };
}

async function findInstallationDbId(
  installationGithubId: number,
): Promise<string | null> {
  const row = await prisma.gitHubInstallation.findUnique({
    where: { installationId: BigInt(installationGithubId) },
    select: { id: true },
  });
  return row?.id ?? null;
}

// -----------------------------------------------------------------------------
// installation: created | deleted | suspend | unsuspend
// -----------------------------------------------------------------------------

export async function handleInstallationEvent(
  payload: InstallationWebhookPayload,
): Promise<void> {
  const { action, installation, repositories } = payload;
  const installationGithubId = installation.id;

  switch (action) {
    case "created": {
      // The /api/github/callback route also handles `created` (when initiated
      // from our UI). This branch covers installs initiated FROM GITHUB
      // (e.g. the user installed the App from the Marketplace). Idempotent.
      //
      // We have no `userId` here because the sender chose to install without
      // going through our UI. We tag the row with the sender's GitHub ID and
      // let the user claim it on next login. For a first cut we attach to
      // the account itself as a placeholder; production should reconcile.
      const existing = await prisma.gitHubInstallation.findUnique({
        where: { installationId: BigInt(installationGithubId) },
        select: { id: true },
      });
      if (existing) return; // callback already wrote it

      // No user binding — skip until the user signs in and claims it.
      // We could persist a "pending" row here; left as a hook.
      return;
    }

    case "deleted": {
      // Cascading delete via FK on EncryptedToken and Repository.
      await prisma.gitHubInstallation.deleteMany({
        where: { installationId: BigInt(installationGithubId) },
      });
      return;
    }

    case "suspend": {
      await prisma.gitHubInstallation.updateMany({
        where: { installationId: BigInt(installationGithubId) },
        data: { suspendedAt: new Date() },
      });
      return;
    }

    case "unsuspend": {
      await prisma.gitHubInstallation.updateMany({
        where: { installationId: BigInt(installationGithubId) },
        data: { suspendedAt: null },
      });
      return;
    }

    case "new_permissions_accepted": {
      // User accepted new permissions in GitHub. Refresh the permissions blob.
      await prisma.gitHubInstallation.updateMany({
        where: { installationId: BigInt(installationGithubId) },
        data: { permissions: installation.permissions as object },
      });
      return;
    }
  }

  // Silently ignore unknown actions — GitHub may add new ones.
  void repositories;
}

// -----------------------------------------------------------------------------
// installation_repositories: added | removed
// -----------------------------------------------------------------------------

export async function handleInstallationRepositoriesEvent(
  payload: InstallationRepositoriesPayload,
): Promise<void> {
  const dbId = await findInstallationDbId(payload.installation.id);
  if (!dbId) return; // unknown installation — likely race, ignore

  if (payload.action === "added" && payload.repositories_added?.length) {
    // upsert each — they may already exist from a previous sync.
    await prisma.$transaction(
      payload.repositories_added.map((repo) =>
        prisma.repository.upsert({
          where: { githubRepoId: BigInt(repo.id) },
          create: repoToCreatePayload(repo, dbId),
          update: repoToCreatePayload(repo, dbId),
        }),
      ),
    );
  }

  if (payload.action === "removed" && payload.repositories_removed?.length) {
    await prisma.repository.deleteMany({
      where: {
        githubRepoId: {
          in: payload.repositories_removed.map((r) => BigInt(r.id)),
        },
      },
    });
  }
}

// -----------------------------------------------------------------------------
// push
// -----------------------------------------------------------------------------

export async function handlePushEvent(
  payload: PushWebhookPayload,
): Promise<void> {
  const dbId = await findInstallationDbId(payload.installation.id);
  if (!dbId) return;

  // Bump pushed_at + metadata for the affected repo. Cheap, useful for "last
  // updated" labels on the dashboard.
  await prisma.repository.updateMany({
    where: { githubRepoId: BigInt(payload.repository.id) },
    data: {
      pushedAt: payload.repository.pushed_at
        ? new Date(payload.repository.pushed_at)
        : new Date(),
      defaultBranch: payload.repository.default_branch ?? "main",
      lastSyncedAt: new Date(),
    },
  });

  // Hook for downstream jobs (build triggers, cache invalidation, etc.).
  // Intentionally empty.
}

// -----------------------------------------------------------------------------
// pull_request
// -----------------------------------------------------------------------------

export async function handlePullRequestEvent(
  payload: PullRequestWebhookPayload,
): Promise<void> {
  const dbId = await findInstallationDbId(payload.installation.id);
  if (!dbId) return;

  // No PR table in the schema yet — this is where you'd persist PR state if
  // your product needs it. Keeping the handler so the event isn't
  // unhandled-by-name, and so adding a PR table later is one place to wire.
  void payload;
}