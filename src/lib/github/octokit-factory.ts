import { Octokit } from "@octokit/rest";
import { prisma } from "@/lib/db/prisma";
import {
  getInstallationToken,
  invalidateInstallationToken,
} from "./installation-token";
import { generateAppJwt } from "./app-auth";

/**
 * Octokit factory.
 *
 * Every route handler that needs to call GitHub goes through here. The
 * factory:
 *   1. Resolves a database installation row from either DB id or GitHub id.
 *   2. Fetches a valid installation access token (cached or freshly minted).
 *   3. Returns a pre-authenticated Octokit instance.
 *
 * Why we re-instantiate Octokit per request instead of caching one
 * ----------------------------------------------------------------
 * The auth token changes when it expires. Stuffing a long-lived client into
 * module scope would silently hold a dead token and start 401-ing. Octokit
 * itself is cheap to create; the cost we DO care about — minting tokens —
 * is amortized by the encrypted_tokens cache.
 *
 * 401 handling
 * ------------
 * If GitHub rejects our token (revoked install, key rotation, etc.), we
 * invalidate the cache so the next call mints a fresh one instead of
 * retrying with the same dead token. Callers can choose to retry; we don't
 * auto-retry inside Octokit because some 401s are legitimate (e.g. install
 * was deleted).
 */

interface ResolveOptions {
  installationDbId?: string;
  installationGithubId?: bigint | number;
}

/**
 * Build a request-scoped Octokit authenticated as a specific installation.
 */
export async function getOctokitForInstallation(
  opts: ResolveOptions,
): Promise<{ octokit: Octokit; installationDbId: string }> {
  const installation = await prisma.gitHubInstallation.findFirst({
    where: opts.installationDbId
      ? { id: opts.installationDbId }
      : { installationId: BigInt(opts.installationGithubId!) },
    select: { id: true, installationId: true, suspendedAt: true },
  });

  if (!installation) {
    throw new InstallationNotFoundError(
      "GitHub installation not found in database",
    );
  }
  if (installation.suspendedAt) {
    throw new InstallationSuspendedError(
      "GitHub installation is suspended; ask the account owner to unsuspend it.",
    );
  }

  const token = await getInstallationToken({
    installationDbId: installation.id,
    installationGithubId: installation.installationId,
  });

  const octokit = new Octokit({
    auth: token,
    // Optional: set a custom user-agent so GitHub's abuse system can identify
    // your app's traffic.
    userAgent: "github-connector/1.0",
  });

  // Hook: on a 401 we invalidate the cache so the NEXT request gets a new
  // token. We don't auto-retry the failing request — let the caller decide.
  octokit.hook.error("request", async (error: unknown) => {
    if ((error as { status?: number }).status === 401) {
      await invalidateInstallationToken(installation.id);
    }
    throw error;
  });

  return { octokit, installationDbId: installation.id };
}

/**
 * Build an Octokit authenticated AS THE APP (not as an installation).
 *
 * Use sparingly — App-level auth is needed for listing installations,
 * deleting an installation, etc. It can't read repository contents.
 */
export function getAppOctokit(): Octokit {
  return new Octokit({
    auth: generateAppJwt(),
    userAgent: "github-connector/1.0",
  });
}

// -----------------------------------------------------------------------------
// Error types — let callers distinguish 4xx-style failures from real bugs.
// -----------------------------------------------------------------------------

export class InstallationNotFoundError extends Error {
  status = 404 as const;
  constructor(message = "Installation not found") {
    super(message);
    this.name = "InstallationNotFoundError";
  }
}

export class InstallationSuspendedError extends Error {
  status = 403 as const;
  constructor(message = "Installation suspended") {
    super(message);
    this.name = "InstallationSuspendedError";
  }
}