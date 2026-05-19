import { ConnectGitHubButton } from "@/components/ConnectGitHubButton";
import { Card } from "@/components/ui";

/**
 * /connect — empty-state-style page that explains the flow and starts it.
 * Pulled out of the home page so logged-in users have a place to add a
 * second installation (e.g. an org) without re-onboarding.
 */
export default function ConnectPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  return <ConnectPageInner searchParams={searchParams} />;
}

async function ConnectPageInner({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const error = params.error;

  return (
    <div className="mx-auto max-w-2xl">
      <header className="mb-8">
        <h1 className="text-2xl font-medium tracking-tight text-white">
          Connect GitHub
        </h1>
        <p className="mt-1.5 text-sm text-gray-7">
          Install the GitHub App to grant access to specific repositories.
        </p>
      </header>

      {error ? (
        <div className="mb-6 rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error === "invalid_state"
            ? "The GitHub install link expired or was already used. Please try connecting again."
            : error === "missing_user"
            ? "The local test user no longer exists. Please sign in again."
            : error === "missing_installation_id"
            ? "GitHub didn't return an installation. Please try again."
            : "Something went wrong during install. Please try again."}
        </div>
      ) : null}

      <Card>
        <div className="space-y-6 px-6 py-6">
          <div className="space-y-3">
            {[
              "Click Connect GitHub and choose your account or organization.",
              "Pick which repositories to grant access to — public or private.",
              "Confirm. You'll land back here with your repositories synced.",
            ].map((step, i) => (
              <div key={step} className="flex items-start gap-3">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border border-gray-4 bg-gray-2 text-[11px] font-medium text-gray-8">
                  {i + 1}
                </span>
                <p className="text-sm text-gray-8">{step}</p>
              </div>
            ))}
          </div>

          <div className="border-t border-gray-4 pt-6">
            <ConnectGitHubButton size="lg" />
          </div>
        </div>
      </Card>

      <p className="mt-6 text-xs text-gray-7">
        Installation tokens are encrypted with AES-256-GCM and expire after
        ~1 hour. You can revoke access at any time from your GitHub settings
        or from the connected repositories dashboard.
      </p>
    </div>
  );
}
