import { Octokit } from "@octokit/rest";
import { prisma } from "@/lib/db/prisma";
import { encrypt, decrypt } from "@/lib/crypto";
import { generateAppJwt } from "./app-auth";

/**
 * Installation access tokens.
 *
 * Why these are SAFER than user OAuth tokens
 * ------------------------------------------
 * - They expire in ~1 hour. A leaked installation token has a small blast
 *   window vs. a long-lived user token that's good until revoked.
 * - They're scoped to one installation. If the user only granted access to
 *   3 repos, the token can only touch those 3 — even if the App itself has
 *   broader permissions.
 * - They're scoped to the App's permissions on the install (Contents: Read,
 *   etc.). A token can't escalate beyond what was granted at install time.
 * - They can be revoked by uninstalling the App, instantly and atomically.
 *
 * How private repository access works
 * -----------------------------------
 * Private repos are READ THROUGH THE SAME TOKEN as public ones. The user
 * grants the App access to specific repos (or all repos) during install.
 * Whether each repo is public or private is irrelevant to authorization —
 * the installation has access, full stop. So the only difference between
 * "list public repos" and "list private repos" in our code is: nothing.
 * Same Octokit, same call.
 *
 * Caching strategy
 * ----------------
 * We cache the encrypted token in `encrypted_tokens`. On each access:
 *   1. Look up the cached token for this installation.
 *   2. If absent OR within 5 minutes of expiry → mint a fresh JWT, exchange
 *      it for a new installation token, encrypt + upsert.
 *   3. Decrypt and return.
 *
 * The 5-minute safety margin guarantees a token we return is good for
 * several minutes of subsequent API calls — even a slow request chain
 * won't outlive it.
 */

const REFRESH_BEFORE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

interface CachedInstallation {
  installationDbId: string;
  installationGithubId: bigint;
}

/**
 * Get a valid installation access token for the given installation.
 * Mints a new one if the cached value is missing or near expiry.
 */
export async function getInstallationToken(
  installation: CachedInstallation,
): Promise<string> {
  // Try cache first
  const cached = await prisma.encryptedToken.findUnique({
    where: { installationId: installation.installationDbId },
  });

  if (cached) {
    const msUntilExpiry = cached.expiresAt.getTime() - Date.now();
    if (msUntilExpiry > REFRESH_BEFORE_EXPIRY_MS) {
      // Still valid with safety margin — decrypt and return.
      return decrypt({
        ciphertext: cached.ciphertext,
        iv: cached.iv,
        authTag: cached.authTag,
      });
    }
    // else: fall through and refresh
  }

  // Mint a fresh App JWT and exchange it for an installation token.
  const jwt = generateAppJwt();
  const appOctokit = new Octokit({ auth: jwt });

  const { data } =
    await appOctokit.rest.apps.createInstallationAccessToken({
      installation_id: Number(installation.installationGithubId),
    });

  // data.token is the secret; data.expires_at is ISO timestamp.
  const token = data.token;
  const expiresAt = new Date(data.expires_at);

  // Encrypt and upsert.
  const enc = encrypt(token);
  await prisma.encryptedToken.upsert({
    where: { installationId: installation.installationDbId },
    create: {
      installationId: installation.installationDbId,
      ciphertext: enc.ciphertext,
      iv: enc.iv,
      authTag: enc.authTag,
      expiresAt,
    },
    update: {
      ciphertext: enc.ciphertext,
      iv: enc.iv,
      authTag: enc.authTag,
      expiresAt,
    },
  });

  return token;
}

/**
 * Invalidate a cached token — call after a 401 from GitHub, or when an
 * installation gets revoked. Forces the next call to mint a fresh token.
 */
export async function invalidateInstallationToken(
  installationDbId: string,
): Promise<void> {
  await prisma.encryptedToken
    .delete({ where: { installationId: installationDbId } })
    .catch(() => {
      // ignore — row may already be gone
    });
}