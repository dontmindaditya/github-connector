"use client";

import { useEffect, useRef, useState } from "react";
import { Spinner } from "./ui";
import { BranchSummary } from "@/types/github";

interface BranchSelectorProps {
  owner: string;
  repo: string;
  value: string;
  onChange: (branch: string) => void;
}

/**
 * Branch dropdown. Fetches once on open and caches in component state.
 * Closes on outside-click and on Escape.
 *
 * Styling note: this is a custom dropdown (not <select>) so we can match
 * the Vercel-style chrome — native selects ignore Tailwind for the popup.
 */
export function BranchSelector({
  owner,
  repo,
  value,
  onChange,
}: BranchSelectorProps) {
  const [open, setOpen] = useState(false);
  const [branches, setBranches] = useState<BranchSummary[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  // Outside click closes the popup
  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handle);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  // Fetch branches once when first opened
  useEffect(() => {
    if (!open || branches !== null || loading) return;
    setLoading(true);
    setError(null);
    fetch(
      `/api/github/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches`,
    )
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok || !json.ok)
          throw new Error(json?.error?.message ?? "Failed to load");
        setBranches(json.data as BranchSummary[]);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [open, owner, repo, branches, loading]);

  const filtered = (branches ?? []).filter((b) =>
    b.name.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-9 items-center gap-2 rounded-md border border-gray-4 bg-gray-1 px-3 text-sm font-medium text-white transition-colors hover:border-gray-5 hover:bg-gray-2"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <line x1="6" y1="3" x2="6" y2="15" />
          <circle cx="18" cy="6" r="3" />
          <circle cx="6" cy="18" r="3" />
          <path d="M18 9a9 9 0 0 1-9 9" />
        </svg>
        <span className="font-mono">{value}</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open ? (
        <div className="absolute left-0 top-full z-10 mt-1.5 w-72 rounded-md border border-gray-4 bg-gray-1 shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_8px_24px_rgba(0,0,0,0.5)]">
          <div className="border-b border-gray-4 p-2">
            <input
              autoFocus
              type="search"
              placeholder="Search branches"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-7 w-full rounded-sm border border-gray-4 bg-black px-2 text-xs text-white placeholder:text-gray-7 focus:border-gray-6 focus:outline-none"
            />
          </div>

          <div className="max-h-72 overflow-y-auto py-1">
            {loading ? (
              <div className="flex justify-center py-4">
                <Spinner size="sm" />
              </div>
            ) : error ? (
              <p className="px-3 py-3 text-xs text-red-400">{error}</p>
            ) : filtered.length === 0 ? (
              <p className="px-3 py-3 text-xs text-gray-7">No branches found</p>
            ) : (
              filtered.map((b) => (
                <button
                  key={b.name}
                  onClick={() => {
                    onChange(b.name);
                    setOpen(false);
                  }}
                  className={
                    "flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-gray-3 " +
                    (b.name === value ? "text-white" : "text-gray-8")
                  }
                >
                  <span className="truncate font-mono">{b.name}</span>
                  {b.name === value ? (
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      aria-hidden
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : null}
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}