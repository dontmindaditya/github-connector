"use client";

import { CommitSummary } from "@/types/github";
import { Card } from "./ui";

interface CommitListProps {
  commits: CommitSummary[];
}

function formatRelative(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.floor(day / 30);
  return mo < 12 ? `${mo}mo ago` : `${Math.floor(mo / 12)}y ago`;
}

export function CommitList({ commits }: CommitListProps) {
  if (commits.length === 0) {
    return (
      <p className="px-5 py-12 text-center text-sm text-gray-7">
        No commits on this branch.
      </p>
    );
  }

  return (
    <Card className="overflow-hidden">
      <ul className="divide-y divide-gray-4">
        {commits.map((c) => {
          // Commit message: first line is the title, rest is body
          const [title, ...rest] = c.message.split("\n");
          const body = rest.join("\n").trim();

          return (
            <li key={c.sha}>
              <a
                href={c.htmlUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-4 px-5 py-3.5 transition-colors hover:bg-gray-2"
              >
                {/* Avatar */}
                <div className="shrink-0">
                  {c.author.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={c.author.avatarUrl}
                      alt=""
                      width={28}
                      height={28}
                      className="rounded-full border border-gray-4"
                    />
                  ) : (
                    <div className="grid h-7 w-7 place-items-center rounded-full border border-gray-4 bg-gray-2 text-[10px] font-medium text-gray-7">
                      {(c.author.name ?? "?").slice(0, 1).toUpperCase()}
                    </div>
                  )}
                </div>

                {/* Message */}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white">
                    {title}
                  </p>
                  {body ? (
                    <p className="mt-0.5 line-clamp-1 text-xs text-gray-7">
                      {body}
                    </p>
                  ) : null}
                  <p className="mt-1.5 text-xs text-gray-7">
                    <span className="text-gray-8">
                      {c.author.login ?? c.author.name ?? "unknown"}
                    </span>{" "}
                    committed {formatRelative(c.author.date)}
                  </p>
                </div>

                {/* SHA */}
                <code className="shrink-0 self-center rounded-sm border border-gray-4 bg-gray-2 px-1.5 py-0.5 font-mono text-[11px] text-gray-8">
                  {c.sha.slice(0, 7)}
                </code>
              </a>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}