# GitHub Connector

A production-ready GitHub integration for Next.js apps, modeled after Vercel's GitHub connector. Supports public and private repositories via GitHub Apps (not OAuth).

```
┌──────────────────┐         ┌───────────────────┐
│  Your Next.js    │ ◀──────│  GitHub Webhooks  │
│      App         │  HMAC   │  (push, install)  │
└────────┬─────────┘         └───────────────────┘
         │
         │  short-lived installation tokens (~1h)
         │  encrypted (AES-256-GCM) at rest
         │
         ▼
┌──────────────────────────────────────────────────┐
│              GitHub REST API                     │
│   /repos, /branches, /commits, /contents         │
└──────────────────────────────────────────────────┘
```

## What's included

- **GitHub App auth.** App JWT (RS256) → installation access token exchange, encrypted caching with auto-refresh.
- **Webhooks.** Receiver verifies `X-Hub-Signature-256`, dedupes via `X-GitHub-Delivery`, dispatches `push` / `installation` / `installation_repositories` / `pull_request`.
- **Encryption.** AES-256-GCM with per-record IVs, used for installation tokens and any other secret you encrypt.
- **Security.** CSRF (double-submit cookie), OAuth state, HSTS + CSP, rate limiting hook.
- **UI.** Vercel-style black/white dashboard, repo list with search and public/private filter, repo detail with branch switcher and commit list.

## Quick start

```bash
# 1. Install
pnpm install

# 2. Set up a GitHub App
# → see docs/GITHUB_APP_SETUP.md

# 3. Configure environment
cp .env.example .env.local
# Generate the two secrets you need:
echo "ENCRYPTION_KEY=\"$(openssl rand -base64 32)\""
echo "GITHUB_WEBHOOK_SECRET=\"$(openssl rand -hex 32)\""
# Fill in the rest from your GitHub App settings page

# 4. Database
pnpm prisma migrate dev --name init

# 5. Run
pnpm dev
```

Visit `http://localhost:3000` and click **Connect GitHub**.

## Docs

| File | What it covers |
|---|---|
| [`docs/GITHUB_APP_SETUP.md`](docs/GITHUB_APP_SETUP.md) | Creating the GitHub App, permissions, generating credentials |
| [`docs/ENVIRONMENT.md`](docs/ENVIRONMENT.md) | Every env var, how to generate it, how to rotate keys |
| [`docs/DEPLOYMENT_VERCEL.md`](docs/DEPLOYMENT_VERCEL.md) | Postgres provider choice, env config on Vercel, smoke tests, hardening checklist |

## Project layout

```
github-connector/
├── prisma/
│   └── schema.prisma              # User, GitHubInstallation, EncryptedToken, Repository, WebhookDelivery
├── docs/
│   ├── GITHUB_APP_SETUP.md
│   ├── ENVIRONMENT.md
│   └── DEPLOYMENT_VERCEL.md
├── src/
│   ├── app/
│   │   ├── (dashboard)/           # /connect, /repositories, /repositories/[id]
│   │   ├── api/
│   │   │   ├── github/            # install, callback, repos, branches, commits, contents, disconnect
│   │   │   └── webhooks/github/   # webhook receiver
│   │   ├── layout.tsx
│   │   ├── globals.css
│   │   └── page.tsx
│   ├── lib/
│   │   ├── github/                # JWT, token exchange, octokit factory, webhook handlers
│   │   ├── crypto/                # encrypt, decrypt, webhook signature verify
│   │   ├── auth/                  # session stub, OAuth state, CSRF
│   │   ├── ratelimit/             # in-memory limiter (swap for Upstash in prod)
│   │   ├── db/                    # Prisma singleton
│   │   └── env.ts                 # Zod-validated env, fails fast on bad config
│   ├── components/                # ConnectGitHubButton, RepositoryList, RepositoryCard, BranchSelector, CommitList + ui/
│   ├── types/
│   │   └── github.ts              # lean shapes for installations, repos, branches, commits, webhooks
│   └── middleware.ts              # security headers, CSRF token issuance
├── .env.example
├── tailwind.config.ts
├── tsconfig.json
├── next.config.ts
└── package.json
```

## Architecture overview

**Why GitHub Apps, not OAuth Apps.** Per-repo access controlled by the user, short-lived tokens (~1h), native webhooks, higher rate limits (5,000/hr per installation), revocable instantly via uninstall. Long version in `docs/GITHUB_APP_SETUP.md`.

**Auth flow.**
1. `/api/github/install` — mint OAuth state cookie, redirect to `github.com/apps/{slug}/installations/new`.
2. User picks repos on GitHub.
3. GitHub → `/api/github/callback` with `installation_id` + `state`. Verify state, fetch install metadata, sync repo list, redirect to `/repositories`.
4. Any subsequent GitHub call: `octokit-factory` looks up cached encrypted token, refreshes 5min before expiry, returns auth'd Octokit.

**Trust boundary.** Frontend never sees a token, never sees the private key, never sees the installation ID in a usable form. All GitHub calls happen in route handlers. UI talks to `/api/...` which talks to GitHub.

**Idempotency.** Webhook deliveries are deduped by `X-GitHub-Delivery`. All handlers use upsert/deleteMany so retries are safe.

## What's NOT included (deliberately)

- **App user authentication.** The connector ships with a thin stub (`src/lib/auth/session.ts`). Bring your own — NextAuth, Clerk, Supabase, custom. The stub is a one-function replacement; see the integration snippets in [`docs/DEPLOYMENT_VERCEL.md`](docs/DEPLOYMENT_VERCEL.md#auth-integration).
- **Write operations on repos.** Read-only by design (Contents: Read on the App permissions). Adding write is a permission change + new route handlers; nothing in the architecture prevents it.
- **Production rate-limit store.** The in-memory limiter works for one instance. Swap for Upstash Redis on serverless — the file documents the exact 6-line change.

## License

MIT. Use it, fork it, ship it.