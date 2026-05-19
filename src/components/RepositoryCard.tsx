import Link from "next/link";
import { Card, Badge } from "./ui";
import { RepositorySummary } from "@/types/github";

interface RepositoryCardProps {
  repo: RepositorySummary;
  /** Route to push to when the card is clicked. Defaults to `/repositories/{id}` */
  href?: string;
}

function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  const diff = Date.now() - date.getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

export function RepositoryCard({ repo, href }: RepositoryCardProps) {
  const linkHref = href ?? `/repositories/${repo.id}`;

  return (
    <Link href={linkHref} className="block">
      <Card interactive className="h-full">
        <div className="flex flex-col gap-3 px-5 py-4">
          {/* Top row: name + private/public */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-[15px] font-medium text-white">
                {repo.name}
              </h3>
              <p className="mt-0.5 truncate font-mono text-xs text-gray-7">
                {repo.fullName}
              </p>
            </div>
            <Badge tone={repo.private ? "private" : "public"}>
              {repo.private ? "Private" : "Public"}
            </Badge>
          </div>

          {/* Description */}
          {repo.description ? (
            <p className="line-clamp-2 text-sm text-gray-8">
              {repo.description}
            </p>
          ) : (
            <p className="text-sm italic text-gray-6">No description</p>
          )}

          {/* Footer meta */}
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-gray-7">
            {repo.language ? (
              <span className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="h-1.5 w-1.5 rounded-full bg-gray-8"
                />
                {repo.language}
              </span>
            ) : null}
            <span className="font-mono">{repo.defaultBranch}</span>
            <span>Updated {formatRelative(repo.pushedAt)}</span>
            {repo.archived ? <Badge tone="warn">Archived</Badge> : null}
          </div>
        </div>
      </Card>
    </Link>
  );
}