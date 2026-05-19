import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { ConnectGitHubButton } from "@/components/ConnectGitHubButton";

/**
 * Marketing-style landing page. Logged-in users skip straight to
 * /repositories — they've already seen this.
 */
export default async function HomePage() {
  const user = await getCurrentUser();
  if (user) redirect("/repositories");

  return (
    <main className="relative min-h-screen overflow-hidden">
      {/* Faint grid background — gives texture without color. */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.18]"
        style={{
          backgroundImage:
            "linear-gradient(to right, #1a1a1a 1px, transparent 1px), linear-gradient(to bottom, #1a1a1a 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          maskImage:
            "radial-gradient(ellipse at center, rgba(0,0,0,1) 0%, rgba(0,0,0,0.4) 60%, rgba(0,0,0,0) 100%)",
        }}
      />

      <div className="relative mx-auto flex min-h-screen max-w-5xl flex-col items-center justify-center px-6 py-24 text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-4 bg-gray-1 px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wider text-gray-7">
          <span className="h-1.5 w-1.5 rounded-full bg-white" />
          GitHub Connector
        </span>

        <h1 className="mt-6 max-w-3xl text-balance text-5xl font-medium tracking-tight text-white sm:text-6xl">
          Connect GitHub to your workspace.
        </h1>
        <p className="mt-5 max-w-xl text-balance text-base text-gray-7 sm:text-lg">
          Grant fine-grained access to public and private repositories. Tokens
          stay server-side. Revoke anytime.
        </p>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <ConnectGitHubButton size="lg" />
          <Link
            href="/login"
            className="inline-flex h-11 items-center justify-center rounded-md border border-gray-4 px-5 text-sm font-medium text-white transition-colors hover:border-gray-5 hover:bg-gray-3"
          >
            Sign in
          </Link>
        </div>

        {/* Trust-signal row */}
        <div className="mt-20 grid w-full max-w-3xl grid-cols-1 gap-px overflow-hidden rounded-md border border-gray-4 bg-gray-4 sm:grid-cols-3">
          {[
            {
              title: "Fine-grained",
              body: "Per-repo access via GitHub Apps, not OAuth scopes.",
            },
            {
              title: "Short-lived tokens",
              body: "Installation tokens expire in 1 hour and are encrypted at rest.",
            },
            {
              title: "Auditable",
              body: "Every webhook delivery is logged and idempotent.",
            },
          ].map((f) => (
            <div key={f.title} className="bg-bg p-5 text-left">
              <h3 className="text-sm font-medium text-white">{f.title}</h3>
              <p className="mt-1 text-xs text-gray-7">{f.body}</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}