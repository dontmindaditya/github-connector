"use client";

import { useEffect, useState } from "react";
import { BranchSelector } from "@/components/BranchSelector";
import { CommitList } from "@/components/CommitList";
import { Card, Spinner, ErrorState } from "@/components/ui";
import type {
  CommitSummary,
  ContentEntry,
  FileContent,
} from "@/types/github";

interface RepoDetailClientProps {
  owner: string;
  repo: string;
  defaultBranch: string;
  initialCommits: CommitSummary[];
  initialCommitsError: string | null;
}

type Tab = "commits" | "files";

interface ContentsDir {
  kind: "dir";
  entries: ContentEntry[];
}
interface ContentsFile {
  kind: "file";
  file: FileContent;
}
interface ContentsOther {
  kind: "other";
  entry: ContentEntry;
}
type ContentsResponse = ContentsDir | ContentsFile | ContentsOther;

async function fetchJson<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15_000);

  let res: Response;
  try {
    res = await fetch(url, {
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      throw new Error("GitHub request timed out. Please try again.");
    }
    throw err;
  } finally {
    window.clearTimeout(timeout);
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error(`Expected JSON but received ${res.status}`);
  }

  const body = await res.json();
  if (!res.ok || !body.ok) {
    throw new Error(body?.error?.message ?? `Request failed: ${res.status}`);
  }
  return body.data as T;
}

export function RepoDetailClient({
  owner,
  repo,
  defaultBranch,
  initialCommits,
  initialCommitsError,
}: RepoDetailClientProps) {
  const [tab, setTab] = useState<Tab>("commits");
  const [branch, setBranch] = useState(defaultBranch);

  return (
    <div>
      {/* Toolbar */}
      <div className="mb-4 flex items-center gap-3">
        <BranchSelector
          owner={owner}
          repo={repo}
          value={branch}
          onChange={setBranch}
        />
        <div className="flex h-9 items-center gap-0.5 rounded-md border border-gray-4 bg-gray-1 p-0.5">
          {(["commits", "files"] as const).map((t) => (
            <button
              type="button"
              key={t}
              onClick={() => setTab(t)}
              className={
                "h-7 rounded-[5px] px-3 text-xs font-medium capitalize transition-colors " +
                (tab === t
                  ? "bg-white text-black"
                  : "text-gray-7 hover:bg-gray-3 hover:text-white")
              }
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {tab === "commits" ? (
        <CommitsTab
          owner={owner}
          repo={repo}
          branch={branch}
          defaultBranch={defaultBranch}
          initialCommits={initialCommits}
          initialCommitsError={initialCommitsError}
        />
      ) : (
        <FilesTab owner={owner} repo={repo} branch={branch} />
      )}
    </div>
  );
}

function CommitsTab({
  owner,
  repo,
  branch,
  defaultBranch,
  initialCommits,
  initialCommitsError,
}: {
  owner: string;
  repo: string;
  branch: string;
  defaultBranch: string;
  initialCommits: CommitSummary[];
  initialCommitsError: string | null;
}) {
  const [commits, setCommits] = useState<CommitSummary[] | null>(
    branch === defaultBranch && !initialCommitsError ? initialCommits : null,
  );
  const [error, setError] = useState<string | null>(
    branch === defaultBranch ? initialCommitsError : null,
  );

  useEffect(() => {
    let cancelled = false;

    if (branch === defaultBranch) {
      setCommits(initialCommitsError ? null : initialCommits);
      setError(initialCommitsError);
      return () => {
        cancelled = true;
      };
    }

    setCommits(null);
    setError(null);
    fetchJson<CommitSummary[]>(
      `/api/github/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits?ref=${encodeURIComponent(branch)}&per_page=10`,
    )
      .then((data) => {
        if (!cancelled) setCommits(data);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [owner, repo, branch, defaultBranch, initialCommits, initialCommitsError]);

  if (error) {
    return <ErrorState title="Couldn't load commits" description={error} />;
  }
  if (!commits) {
    return (
      <div className="flex items-center justify-center gap-3 py-12 text-sm text-gray-7">
        <Spinner size="sm" />
        <span>Loading commits from GitHub...</span>
      </div>
    );
  }
  return <CommitList commits={commits} />;
}

function FilesTab({
  owner,
  repo,
  branch,
}: {
  owner: string;
  repo: string;
  branch: string;
}) {
  const [path, setPath] = useState("");
  const [resp, setResp] = useState<ContentsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setResp(null);
    setError(null);
    fetchJson<ContentsResponse>(
      `/api/github/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents?path=${encodeURIComponent(path)}&ref=${encodeURIComponent(branch)}`,
    )
      .then((data) => {
        if (!cancelled) setResp(data);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [owner, repo, branch, path]);

  if (error) {
    return <ErrorState title="Couldn't load files" description={error} />;
  }
  if (!resp) {
    return (
      <div className="flex items-center justify-center gap-3 py-12 text-sm text-gray-7">
        <Spinner size="sm" />
        <span>Loading files from GitHub...</span>
      </div>
    );
  }

  const segments = path === "" ? [] : path.split("/");

  return (
    <div>
      {/* Path breadcrumb */}
      <nav className="mb-3 flex flex-wrap items-center gap-1 text-xs">
        <button
          type="button"
          onClick={() => setPath("")}
          className={
            "rounded px-1.5 py-0.5 font-mono transition-colors " +
            (path === ""
              ? "text-white"
              : "text-gray-7 hover:bg-gray-3 hover:text-white")
          }
        >
          {repo}
        </button>
        {segments.map((seg, i) => {
          const sub = segments.slice(0, i + 1).join("/");
          const isLast = i === segments.length - 1;
          return (
            <span key={sub} className="flex items-center gap-1">
              <span className="text-gray-5">/</span>
              <button
                type="button"
                onClick={() => setPath(sub)}
                className={
                  "rounded px-1.5 py-0.5 font-mono transition-colors " +
                  (isLast
                    ? "text-white"
                    : "text-gray-7 hover:bg-gray-3 hover:text-white")
                }
              >
                {seg}
              </button>
            </span>
          );
        })}
      </nav>

      {resp.kind === "dir" ? (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-gray-4">
            {[...resp.entries]
              .sort((a, b) => {
                // dirs first, then alpha
                if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
                return a.name.localeCompare(b.name);
              })
              .map((entry) => (
                <li key={entry.path}>
                  <button
                    type="button"
                    onClick={() => {
                      if (entry.type === "dir") setPath(entry.path);
                      else if (entry.htmlUrl) window.open(entry.htmlUrl, "_blank");
                    }}
                    className="flex w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-gray-2"
                  >
                    <FileIcon type={entry.type} />
                    <span className="flex-1 truncate font-mono text-xs text-gray-9">
                      {entry.name}
                    </span>
                    {entry.type === "file" ? (
                      <span className="text-[11px] text-gray-7">
                        {formatBytes(entry.size)}
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
          </ul>
        </Card>
      ) : resp.kind === "file" ? (
        <FilePreview file={resp.file} />
      ) : (
        <Card>
          <div className="px-5 py-6 text-sm text-gray-7">
            {resp.entry.type} (not previewable)
          </div>
        </Card>
      )}
    </div>
  );
}

function FilePreview({ file }: { file: FileContent }) {
  let text: string | null = null;
  if (file.content && file.encoding === "base64") {
    try {
      text = atob(file.content.replace(/\n/g, ""));
    } catch {
      text = null;
    }
  } else if (file.content && file.encoding === "utf-8") {
    text = file.content;
  }

  const looksBinary =
    text !== null && /[\x00-\x08\x0E-\x1F]/.test(text.slice(0, 1024));

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-gray-4 px-4 py-2">
        <span className="font-mono text-xs text-gray-9">{file.name}</span>
        <span className="text-[11px] text-gray-7">{formatBytes(file.size)}</span>
      </div>
      {text === null || looksBinary ? (
        <div className="px-5 py-6 text-sm text-gray-7">
          Preview not available.{" "}
          {file.downloadUrl ? (
            <a
              href={file.downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-white underline-offset-4 hover:underline"
            >
              Download
            </a>
          ) : null}
        </div>
      ) : (
        <pre className="overflow-x-auto px-4 py-3 font-mono text-xs leading-relaxed text-gray-9">
          {text}
        </pre>
      )}
    </Card>
  );
}

function FileIcon({ type }: { type: ContentEntry["type"] }) {
  if (type === "dir") {
    return (
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="text-gray-7"
        aria-hidden
      >
        <path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-7l-2-2H5a2 2 0 0 0-2 2z" />
      </svg>
    );
  }
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className="text-gray-7"
      aria-hidden
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

function formatBytes(n: number): string {
  if (!n) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}
