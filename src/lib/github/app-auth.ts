import { createSign } from "node:crypto";
import { env } from "@/lib/env";

/**
 * GitHub App JWT minting.
 *
 * How GitHub App authentication works (the short version)
 * -------------------------------------------------------
 * A GitHub App owns a private key (RSA). To authenticate AS THE APP (e.g. to
 * list installations, request an installation token), we mint a short-lived
 * JWT signed with that private key (algorithm RS256). GitHub verifies the
 * signature against the matching public key it already has on file.
 *
 * GitHub enforces strict claim rules:
 *   - `iat` (issued at): now - 60s. The 60s back-dating is REQUIRED to
 *     tolerate clock drift between our server and github.com — without it,
 *     even tiny skew rejects the token.
 *   - `exp` (expires): max 10 minutes from now. We use 9 min to leave a
 *     safety margin.
 *   - `iss` (issuer): the App ID.
 *   - `alg`: must be RS256.
 *
 * Why this token is safe-ish to mint per-request
 * ----------------------------------------------
 * The JWT only lets us talk to the *app endpoints* — it can list
 * installations, but it CAN'T read code. To touch a repo, we still have to
 * trade the JWT for an installation token (see installation-token.ts).
 * Even if a JWT leaked, it expires in minutes and grants no repo access.
 *
 * Why we don't use a JWT library here
 * -----------------------------------
 * Two reasons. (1) RS256 with a static key, three claims, no validation
 * needed on our side — the whole thing is ~30 lines and a dep is overkill.
 * (2) Most popular JWT libs pull in extra polyfills that bloat the Edge
 * bundle. This file is Node-only and uses the built-in `crypto` module.
 */

function b64url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function generateAppJwt(): string {
  const now = Math.floor(Date.now() / 1000);

  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iat: now - 60, // 60s back-date for clock skew tolerance
    exp: now + 9 * 60, // 9 minutes — GitHub caps at 10
    iss: env.GITHUB_APP_ID, // App ID, NOT client ID
  };

  const headerSeg = b64url(JSON.stringify(header));
  const payloadSeg = b64url(JSON.stringify(payload));
  const signingInput = `${headerSeg}.${payloadSeg}`;

  // Sign with the PEM private key. createSign handles PKCS#1 and PKCS#8 PEMs.
  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  const signature = b64url(signer.sign(env.GITHUB_PRIVATE_KEY));

  return `${signingInput}.${signature}`;
}