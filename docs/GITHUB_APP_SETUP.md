# GitHub App Setup

A walkthrough for creating the GitHub App that powers this connector. Takes about 5 minutes start to finish.

## Why a GitHub App (not an OAuth App)

OAuth Apps grant broad, account-wide access scopes and issue long-lived user tokens. GitHub Apps are different:

- **Fine-grained access.** Users pick which repositories the App can touch — public, private, or both.
- **Short-lived tokens.** Installation access tokens expire in ~1 hour. A leaked token has a small blast radius.
- **Higher rate limits.** 5,000 requests/hour per installation, vs. 5,000/hour across an entire OAuth user.
- **Native webhooks.** The App receives push, PR, and installation events without polling.
- **Per-account isolation.** A user can install the App into their personal account AND multiple orgs independently.

This connector relies on all five properties.

---

## Step 1 — Create the App

1. Open the new-App page:
   - Personal: <https://github.com/settings/apps/new>
   - Organization: `https://github.com/organizations/<org>/settings/apps/new`

2. Fill the basics:
   - **GitHub App name** — anything unique. Becomes the public install page URL (`github.com/apps/<slug>`).
   - **Homepage URL** — your app's URL, e.g. `https://your-app.vercel.app`.
   - **Description** — optional, shown to users on the install page.

3. **Identifying and authorizing users** — leave **"Request user authorization (OAuth) during installation"** UNCHECKED. We don't need the user OAuth flow; the App itself authenticates via JWT.

4. **Setup URL** — leave blank.

   For this connector's dashboard flow, set the Setup URL to `http://localhost:3000/api/github/callback` in local dev or `https://<your-domain>/api/github/callback` in production. GitHub redirects there after installation with `installation_id`, `setup_action`, and `state`; without it, GitHub leaves you on github.com and the connector cannot save the installation.

5. **Webhook**:
   - **Active** — ✅ checked.
   - **Webhook URL** — `https://<your-domain>/api/webhooks/github`. For local development, use [ngrok](https://ngrok.com/) or a similar tunnel and point this at the tunnel URL. You can change it later.
   - **Webhook secret** — generate one and SAVE IT NOW — you can't view it again later. The same value goes in your `.env` as `GITHUB_WEBHOOK_SECRET`:
     ```bash
     openssl rand -hex 32
     ```

---

## Step 2 — Permissions

Under **Repository permissions**, set:

| Permission | Access | Why |
|---|---|---|
| **Contents** | Read-only | Read repo files, branches, commits |
| **Metadata** | Read-only | Required (auto-selected when others are set) |
| **Pull requests** | Read-only | Receive PR webhook events |

Leave everything else at "No access". Adding permissions later forces users to manually re-approve the App on each installation — keep this list minimal.

Under **Subscribe to events**, check:

- ✅ Push
- ✅ Pull request
- ✅ Installation repositories

The `installation` event (created/deleted/suspend) is delivered automatically — no checkbox needed.

---

## Step 3 — Where can this App be installed?

Choose **"Any account"** if you want users from other GitHub accounts and orgs to install it. Choose **"Only on this account"** for an internal tool. This is irreversible-ish (you can flip it later but existing installs may behave oddly).

Click **Create GitHub App**.

---

## Step 4 — Generate credentials

You land on the App's settings page. Now collect the four pieces you need for `.env`:

### a) App ID

Top of the page, labeled "App ID" — usually 6–7 digits.

```
GITHUB_APP_ID="123456"
```

### b) App slug

Look at the "Public link" near the top — something like `https://github.com/apps/my-connector`. The trailing path is the slug.

```
GITHUB_APP_SLUG="my-connector"
```

### c) Client ID + Client Secret

Scroll down to **"Client ID"** — copy it directly.

```
GITHUB_CLIENT_ID="Iv1.abc123def456"
```

Right below, click **"Generate a new client secret"**. It's shown once — copy it immediately.

```
GITHUB_CLIENT_SECRET="<the-long-string-you-just-copied>"
```

### d) Private key

Scroll to **"Private keys"** at the bottom of the page. Click **"Generate a private key"**. Your browser downloads a `.pem` file named something like `my-connector.2026-05-19.private-key.pem`.

For local dev — paste the entire file contents into `.env.local`, newlines preserved:

```
GITHUB_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA...
...many lines...
-----END RSA PRIVATE KEY-----"
```

For Vercel and most other hosts that reject multi-line env vars — convert to a single line with literal `\n`:

```bash
awk 'NF {sub(/\r/, ""); printf "%s\\n",$0;}' my-connector.2026-05-19.private-key.pem
```

Paste that output as the env value. `src/lib/env.ts` restores newlines at boot.

> Treat this `.pem` like a root credential. Anyone with it can mint tokens for every installation of your App. Store it in your secret manager and delete the local file.

---

## Step 5 — Install the App on a test account

1. Open the public install page: `https://github.com/apps/<your-slug>`.
2. Click **Install**.
3. Choose **All repositories** or pick specific ones.
4. Confirm.

GitHub redirects you to whatever your App's setup URL is (blank → it stays on github.com). When you wire up the connector and hit `/api/github/install` from the dashboard, the flow ends at `/repositories` instead.

---

## Step 6 — Verify webhooks are arriving

1. Push a commit to one of the repos the App has access to.
2. In your App's settings, open **"Advanced"** in the sidebar. The **"Recent Deliveries"** panel shows every webhook GitHub tried to send.
3. Click a delivery — you should see a 200 response from your `/api/webhooks/github`. If you see a non-2xx, click "Redeliver" after fixing the issue.

If the panel is empty:
- The webhook URL on the App settings page is wrong (check for trailing slash, http vs https).
- Your server isn't publicly reachable (use ngrok for local dev).
- The webhook is unchecked under "Active".

---

## Updating permissions later

If you add a new permission after installs exist, GitHub puts the install into a "pending permissions" state. Users see a banner on github.com and must approve the changes before the App regains access. Plan permission expansions carefully — they're not seamless.

You can also tell users to re-install at `https://github.com/apps/<slug>/installations/new` if you want them to actively re-pick repositories.

---

## Common mistakes

- **Confusing App ID with Client ID** — they're different numbers. The JWT uses `iss = App ID` (numeric). OAuth flows use the Client ID. We don't actually use the OAuth flow in this connector, so you mainly need App ID.
- **Webhook secret mismatch** — if the secret in the App settings doesn't match `GITHUB_WEBHOOK_SECRET` in your env, every webhook fails signature verification and returns 401. Re-copy carefully; there's no whitespace tolerance.
- **Pasting the PEM into Vercel with literal newlines** — Vercel rejects it. Convert to `\n`-escaped single-line first.
- **Private key not converting back** — verify that `env.GITHUB_PRIVATE_KEY` (printed once at boot) starts with `-----BEGIN` on its own line. If you see `\n` characters in the actual string, the `.replace(/\\n/g, "\n")` in `env.ts` isn't matching — it usually means you double-escaped (`\\n` in source vs `\n`).

---

## Next steps

- [Environment variables](./ENVIRONMENT.md) — what every value does and how to generate it.
- [Deploying to Vercel](./DEPLOYMENT_VERCEL.md) — webhook URL config, Postgres provider choice, smoke tests.
