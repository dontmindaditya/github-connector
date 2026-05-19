import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { Card, Badge } from "@/components/ui";
import { RepoDetailClient } from "./RepoDetailClient";

/**
 * /repositories/[id]
 *
 * Detail view for a single connected repo. We render the server-side header
 * + meta from the DB row, then hand off to a small client component for the
 * interactive branch/commit/file tabs (so the network calls happen lazily).
 */

export const dynamic = "force-dynamic";

export default async function RepositoryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser().catch(() => {
    redirect("/login");
  });
  if (!user) redirect("/login");

  const { id } = await params;

  const repo = await prisma.repository.findFirst({
    where: { id, installation: { userId: user.id } },
    include: { installation: { select: { accountLogin: true } } },
  });

  if (!repo) notFound();

  const [owner, name] = repo.fullName.split("/");

  return (
    <div>
      {/* Breadcrumb */}
      <nav className="mb-6 flex items-center gap-2 text-sm text-gray-7">
        <Link
          href="/repositories"
          className="transition-colors hover:text-white"
        >
          Repositories
        </Link>
        <span className="text-gray-5">/</span>
        <span className="text-gray-7">{owner}</span>
        <span className="text-gray-5">/</span>
        <span className="text-white">{name}</span>
      </nav>

      {/* Header card */}
      <Card className="mb-6">
        <div className="flex flex-col gap-4 px-6 py-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <h1 className="truncate text-xl font-medium tracking-tight text-white">
                {repo.name}
              </h1>
              <Badge tone={repo.private ? "private" : "public"}>
                {repo.private ? "Private" : "Public"}
              </Badge>
              {repo.archived ? <Badge tone="warn">Archived</Badge> : null}
            </div>
            <p className="mt-1 font-mono text-xs text-gray-7">
              {repo.fullName}
            </p>
            {repo.description ? (
              <p className="mt-3 max-w-2xl text-sm text-gray-8">
                {repo.description}
              </p>
            ) : null}
            <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-1.5 text-xs text-gray-7">
              <div className="flex items-center gap-1.5">
                <dt className="text-gray-7">Default branch</dt>
                <dd className="font-mono text-gray-9">{repo.defaultBranch}</dd>
              </div>
              {repo.language ? (
                <div className="flex items-center gap-1.5">
                  <dt className="text-gray-7">Language</dt>
                  <dd className="text-gray-9">{repo.language}</dd>
                </div>
              ) : null}
              <div className="flex items-center gap-1.5">
                <dt className="text-gray-7">Installation</dt>
                <dd className="text-gray-9">{repo.installation.accountLogin}</dd>
              </div>
            </dl>
          </div>

          <a
            href={repo.htmlUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-md border border-gray-4 px-3.5 text-sm font-medium text-white transition-colors hover:border-gray-5 hover:bg-gray-3"
          >
            Open on GitHub
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden
            >
              <path d="M7 17 17 7M7 7h10v10" />
            </svg>
          </a>
        </div>
      </Card>

      {/* Interactive section */}
      <RepoDetailClient
        owner={owner}
        repo={name}
        defaultBranch={repo.defaultBranch}
      />
    </div>
  );
}