import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { RepositoryList } from "@/components/RepositoryList";
import { ConnectGitHubButton } from "@/components/ConnectGitHubButton";
import type { RepositorySummary } from "@/types/github";

/**
 * /repositories — main dashboard. Server-renders the repo list from DB,
 * keeping the client lightweight. Refresh and filter happen client-side
 * inside <RepositoryList />.
 */

export const dynamic = "force-dynamic"; // always reflect latest DB state

export default async function RepositoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ installed?: string }>;
}) {
  const user = await requireUser().catch(() => {
    redirect("/login");
  });
  // requireUser returns User | never, but TS needs help past `catch`.
  if (!user) redirect("/login");

  const params = await searchParams;

  // Fetch installations + repos in two parallel queries.
  const [installations, repos] = await Promise.all([
    prisma.gitHubInstallation.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
    }),
    prisma.repository.findMany({
      where: { installation: { userId: user.id } },
      orderBy: [{ pushedAt: "desc" }, { name: "asc" }],
    }),
  ]);

  const hasInstallation = installations.length > 0;
  // Deep-link to GitHub's install settings for the FIRST installation.
  // Multi-installation users get a list further down to switch.
  const manageUrl = hasInstallation
    ? `https://github.com/${installations[0].accountType === "Organization" ? "organizations/" + installations[0].accountLogin + "/" : ""}settings/installations/${installations[0].installationId}`
    : undefined;

  const data: RepositorySummary[] = repos.map((r) => ({
    id: r.id,
    githubRepoId: r.githubRepoId.toString(),
    name: r.name,
    fullName: r.fullName,
    private: r.private,
    defaultBranch: r.defaultBranch,
    htmlUrl: r.htmlUrl,
    description: r.description,
    language: r.language,
    archived: r.archived,
    disabled: r.disabled,
    pushedAt: r.pushedAt?.toISOString() ?? null,
    lastSyncedAt: r.lastSyncedAt.toISOString(),
  }));

  return (
    <div>
      <header className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-medium tracking-tight text-white">
            Repositories
          </h1>
          <p className="mt-1.5 text-sm text-gray-7">
            {hasInstallation
              ? `${installations.length} installation${installations.length === 1 ? "" : "s"} · ${repos.length} repositor${repos.length === 1 ? "y" : "ies"}`
              : "No GitHub installations yet."}
          </p>
        </div>
        {hasInstallation ? <ConnectGitHubButton label="Add installation" /> : null}
      </header>

      {params.installed === "1" ? (
        <div className="mb-6 flex items-center gap-2.5 rounded-md border border-white/20 bg-white/[0.04] px-3.5 py-2.5 text-sm text-white">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            aria-hidden
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
          GitHub installation completed — repositories synced.
        </div>
      ) : null}

      <RepositoryList
        repositories={data}
        hasInstallation={hasInstallation}
        manageUrl={manageUrl}
      />

      {/* Installation footer — list each install for transparency. */}
      {installations.length > 0 ? (
        <section className="mt-12 border-t border-gray-4 pt-8">
          <h2 className="mb-4 text-sm font-medium text-white">Installations</h2>
          <ul className="space-y-2">
            {installations.map((inst) => (
              <li
                key={inst.id}
                className="flex items-center justify-between rounded-md border border-gray-4 bg-gray-1 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-white">
                    {inst.accountLogin}
                    {inst.suspendedAt ? (
                      <span className="ml-2 text-xs text-yellow-500">
                        (suspended)
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs text-gray-7">
                    {inst.accountType} · {inst.repositorySelection === "all"
                      ? "All repositories"
                      : "Selected repositories"}
                  </p>
                </div>
                <a
                  href={`https://github.com/${inst.accountType === "Organization" ? "organizations/" + inst.accountLogin + "/" : ""}settings/installations/${inst.installationId.toString()}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-white underline-offset-4 hover:underline"
                >
                  Manage
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
