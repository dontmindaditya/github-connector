"use client";

import { useMemo, useState } from "react";
import { RepositoryCard } from "./RepositoryCard";
import { State } from "./ui";
import { ConnectGitHubButton } from "./ConnectGitHubButton";
import { RepositorySummary } from "@/types/github";

interface RepositoryListProps {
  repositories: RepositorySummary[];
  /** When true, show the "Manage on GitHub" deep-link instead of Connect button */
  hasInstallation?: boolean;
  manageUrl?: string;
}

type Filter = "all" | "public" | "private";

export function RepositoryList({
  repositories,
  hasInstallation = false,
  manageUrl,
}: RepositoryListProps) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return repositories.filter((r) => {
      if (filter === "private" && !r.private) return false;
      if (filter === "public" && r.private) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        r.fullName.toLowerCase().includes(q) ||
        (r.description ?? "").toLowerCase().includes(q)
      );
    });
  }, [repositories, query, filter]);

  if (repositories.length === 0) {
    return (
      <State
        title="No repositories connected"
        description="Connect GitHub to grant access to public and private repositories."
        action={<ConnectGitHubButton />}
        icon={
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-7l-2-2H5a2 2 0 0 0-2 2z" />
          </svg>
        }
      />
    );
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 items-center gap-2">
          <div className="relative flex-1 sm:max-w-md">
            {/* Search input */}
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-7"
              aria-hidden
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="search"
              placeholder="Search repositories"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-9 w-full rounded-md border border-gray-4 bg-gray-1 pl-8 pr-3 text-sm text-white placeholder:text-gray-7 focus:border-gray-6 focus:outline-none focus:ring-1 focus:ring-gray-6"
            />
          </div>

          {/* Filter pills */}
          <div className="flex h-9 items-center gap-0.5 rounded-md border border-gray-4 bg-gray-1 p-0.5">
            {(["all", "public", "private"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={
                  "h-7 rounded-[5px] px-2.5 text-xs font-medium capitalize transition-colors " +
                  (filter === f
                    ? "bg-white text-black"
                    : "text-gray-7 hover:bg-gray-3 hover:text-white")
                }
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Manage on GitHub */}
        {hasInstallation && manageUrl ? (
          <a
            href={manageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-9 items-center justify-center rounded-md border border-gray-4 px-3.5 text-sm font-medium text-white transition-colors hover:border-gray-5 hover:bg-gray-3"
          >
            Manage on GitHub
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="ml-1.5"
              aria-hidden
            >
              <path d="M7 17 17 7M7 7h10v10" />
            </svg>
          </a>
        ) : null}
      </div>

      {/* Results */}
      {filtered.length === 0 ? (
        <State
          title="No matches"
          description={`Nothing matches "${query}". Try a different search.`}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((repo) => (
            <RepositoryCard key={repo.id} repo={repo} />
          ))}
        </div>
      )}

      {/* Counter */}
      <p className="mt-6 text-xs text-gray-7">
        Showing {filtered.length} of {repositories.length}
      </p>
    </div>
  );
}