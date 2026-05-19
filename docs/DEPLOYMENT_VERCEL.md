# Deploying to Vercel

Step-by-step for getting the connector live on Vercel with a Postgres database and working webhooks.

**Time estimate:** ~15 minutes if you already have the GitHub App created.

**Prerequisites:**
- GitHub App created — see [GITHUB_APP_SETUP.md](./GITHUB_APP_SETUP.md).
- All env values from [ENVIRONMENT.md](./ENVIRONMENT.md) on hand.
- A GitHub repo with this code, connected to your Vercel account.

---

## Step 1 — Pick a Postgres provider

Vercel doesn't run Postgres natively anymore; you bring your own. Three options that work well on Vercel's serverless runtime:

| Provider | Free tier | Notes |
|---|---|---|
| **Neon** | Yes, generous | Serverless Postgres. Best default — instant cold starts via pgbouncer. |
| **Supabase** | Yes | Full Postgres + extras. Use the "Transaction" pooler URL for serverless. |
| **Vercel Marketplace Postgres** | Provider-dependent | Vercel's storage UI now provisions through Neon/Supabase. Same thing, prettier. |

Whichever you pick, you need TWO URLs:

- **Pooled URL** for the app at runtime — use it as `DATABASE_URL`. Looks like `?pgbouncer=true` or contains `-pooler` in the hostname.
- **Direct URL** for migrations only — Prisma needs this because pgbouncer in transaction mode doesn't support the prepared statements migrations issue.

If you want both, add `DIRECT_URL` to `schema.prisma`:

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}
```

Then add `DIRECT_URL` to your env as well. Most providers expose both URLs side-by-side in their dashboard.

---

## Step 2 — Run the initial migration

Before deploying, get the schema into the database. From your local machine:

```bash
# Install deps if you haven't
pnpm install

# Generate the Prisma client
pnpm prisma generate

# Apply migrations to the production DB
# Uses DATABASE_URL from your local .env or shell
DATABASE_URL="<your-production-url>" pnpm prisma migrate deploy
```

If this is the first migration ever, run `prisma migrate dev --name init` once locally to create the migration file, commit it, then `migrate deploy` against production.

> Running migrations from a developer machine against production is fine for early-stage projects. Once you have a team, run them from CI or a dedicated migration job.

---

## Step 3 — Push the repo and import to Vercel

1. Push to GitHub.
2. <https://vercel.com/new> → import the repo.
3. Framework preset: **Next.js** (auto-detected).
4. Build command: leave default (`next build`).
5. **Don't deploy yet** — click into **"Environment Variables"** first.

---

## Step 4 — Set environment variables on Vercel

Add every variable from your `.env.local`. A few gotchas specific to Vercel:

### `GITHUB_PRIVATE_KEY` — convert to single line

Vercel's env input is single-line. Convert the PEM:

```bash
awk 'NF {sub(/\r/, ""); printf "%s\\n",$0;}' your-app.private-key.pem
```

Paste the output (a long string containing literal `\n` sequences). `src/lib/env.ts` restores real newlines at boot.

**Sanity check** — the value you paste should start with `-----BEGIN RSA PRIVATE KEY-----\n` and end with `\n-----END RSA PRIVATE KEY-----\n`.

### `DATABASE_URL` — use the pooled URL

Use the connection-pooled URL (the one with `pgbouncer=true` or `-pooler` in the hostname). The direct URL is for migrations only.

### `APP_URL` — set after the first deploy

You don't know your URL yet. Two options:

1. Deploy with a placeholder (`https://placeholder.vercel.app`), then update it after the first build and redeploy.
2. Assign a custom domain immediately and use that.

The first approach is simpler.

### Environment scope

By default Vercel applies env vars to all three environments (Production, Preview, Development). Three things to consider:

- **Production-only secrets** — uncheck "Preview" and "Development" for things like `GITHUB_PRIVATE_KEY` if you want preview deployments to fail loudly instead of using real credentials.
- **Preview deployments need their own GitHub App** — or webhooks fired in prod will hit preview URLs and fail signature verification (different secret).
- **`APP_URL`** should differ per environment (preview URLs are random per branch).

---

## Step 5 — Deploy

Hit **Deploy**. The build runs `next build` which:

1. Runs Prisma's postinstall script (regenerates the client for Vercel's Linux runtime).
2. Type-checks.
3. Builds and uploads.

If the build fails:

- **`@prisma/client did not initialize yet`** — add `"postinstall": "prisma generate"` to your `package.json` scripts.
- **Env validation error at build** — `src/lib/env.ts` runs on import. If you're missing a var, the build sees it. Fix the var in Vercel's env UI and redeploy.
- **`PEM_read_bio_PrivateKey failed`** — `GITHUB_PRIVATE_KEY` is mangled. Re-run the awk conversion and verify the pasted value starts with `-----BEGIN` and includes `\n` sequences.

---

## Step 6 — Update the GitHub App with your real URLs

Once deployed, you have your Vercel URL (e.g. `https://github-connector-aditya.vercel.app`).

1. Update `APP_URL` in Vercel env → redeploy.
2. On your GitHub App settings page:
   - **Webhook URL** → `https://<your-domain>/api/webhooks/github`
   - **Homepage URL** → `https://<your-domain>`
3. Save.

---

## Step 7 — Smoke test

Walk through the full flow against the live deployment:

1. Go to `https://<your-domain>` — should redirect to `/login` (or show landing if not auth'd).
2. Sign in (using whatever app auth you wired in — see "Auth integration" below).
3. Go to `/connect` and click **Connect GitHub**. Browser should redirect to `github.com/apps/<slug>/installations/new?state=...`.
4. Pick an account and one or two repos. Confirm.
5. You should land on `/repositories?installed=1` with the success banner and your repos rendered.
6. Click into a repo — branches and commits should load.
7. Push a commit to that repo on GitHub. Within ~5 seconds, the `pushed_at` on the repo card should update (after a refresh — we don't push to the client in real time).
8. Check **GitHub App settings → Advanced → Recent Deliveries** — every webhook should show a 200 response.

If step 8 shows non-2xx:

- 401: webhook secret mismatch. Re-copy `GITHUB_WEBHOOK_SECRET`.
- 500: open the Vercel **Functions** logs for `/api/webhooks/github` and look at the stack.
- Timeouts: a handler is doing too much work. The endpoint must respond in ≤10 seconds. Push slow work to a queue.

---

## Auth integration

The connector ships with a deliberately thin auth stub in `src/lib/auth/session.ts` — it reads a `session_user_id` cookie and looks the user up. Replace the body of `getCurrentUser()` with your real auth provider.

Common integrations:

### NextAuth.js / Auth.js

```ts
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";

export async function getCurrentUser() {
  const session = await auth();
  if (!session?.user?.email) return null;
  return prisma.user.findUnique({ where: { email: session.user.email } });
}
```

### Clerk

```ts
import { currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db/prisma";

export async function getCurrentUser() {
  const u = await currentUser();
  if (!u?.emailAddresses[0]?.emailAddress) return null;
  return prisma.user.upsert({
    where: { email: u.emailAddresses[0].emailAddress },
    create: {
      email: u.emailAddresses[0].emailAddress,
      name: u.firstName,
      image: u.imageUrl,
    },
    update: { name: u.firstName, image: u.imageUrl },
  });
}
```

### Supabase Auth

```ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db/prisma";

export async function getCurrentUser() {
  const supabase = createServerClient(/* ... */);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return null;
  return prisma.user.upsert({
    where: { email: user.email },
    create: { email: user.email },
    update: {},
  });
}
```

Whatever you wire in, keep the contract identical: `getCurrentUser()` returns `User | null`, `requireUser()` throws `UnauthorizedError` on null.

---

## Domains and HTTPS

- Vercel issues SSL certs automatically for `.vercel.app` subdomains and custom domains.
- The middleware sets `Strict-Transport-Security` — keep it.
- If you later put Cloudflare in front, set the SSL mode to **Full (strict)** or you'll get redirect loops.

---

## Logs and observability

- **Function logs** — Vercel dashboard → your project → Logs. Filter by route.
- **Webhook deliveries** — GitHub App settings → Advanced → Recent Deliveries. You can replay any of them while debugging.
- **DB query logs** — Prisma logs queries in `development`. In production it logs errors only.

For deeper observability, plug in Vercel Analytics or a third-party APM (Datadog, Sentry, etc.). The route handlers all return structured `{ ok, error: { code, message } }` envelopes, so error rates per code are easy to surface.

---

## Production hardening checklist

Before sending real users at this:

- [ ] Replace the in-memory rate limiter (`src/lib/ratelimit/limiter.ts`) with Upstash Redis. The current implementation is per-instance — Vercel's serverless model will let limits drift under load. The TODO is documented in the file.
- [ ] Add Sentry or equivalent error reporting in `src/app/api/_lib/response.ts` (replace the `console.error` in `failFromError`).
- [ ] Set up a scheduled job to prune `WebhookDelivery` rows older than 30 days. Vercel Cron is one click.
- [ ] Move migrations to CI instead of running them from a developer machine.
- [ ] Rotate `ENCRYPTION_KEY` on a schedule and confirm the rotation procedure (see [ENVIRONMENT.md](./ENVIRONMENT.md#rotation)).
- [ ] Add monitoring on `encrypted_tokens` decryption failures — should be near-zero. Spike means key drift or DB tamper.
- [ ] Decide on `installation_repositories` retry behavior. The current handler is idempotent; you may want to dead-letter persistent failures.
- [ ] Confirm the security headers in `src/middleware.ts` match your CSP needs. The default allows GitHub avatars; add other sources you actually use.

---

## Troubleshooting

**"Invalid state" error on `/connect`** — the state cookie expired or didn't match. Common cause: the user took longer than 10 minutes in GitHub's install UI. Restart the flow.

**Webhooks 401 in GitHub's delivery panel** — `GITHUB_WEBHOOK_SECRET` mismatch. The secret here must character-for-character match what's saved on the App's webhook config.

**Webhooks 500** — handler error. Check the Function logs. The route still returns 200 to GitHub if the handler throws after the delivery row is created (idempotency was already recorded), so you may see "Recent Delivery: 200" but `WebhookDelivery.action = null`. Look at Vercel logs, not GitHub's panel.

**"Installation suspended"** — the account owner suspended the App. The user (or an admin) clicks unsuspend on `github.com/settings/installations/<id>`.

**Tokens minting too often** — check that `expiresAt` is being written correctly. If the encrypted token row has an `expiresAt` in the past, every request re-mints. Confirm your DB timezone (Postgres should be UTC).