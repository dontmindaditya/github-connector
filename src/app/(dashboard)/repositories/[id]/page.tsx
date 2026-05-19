import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { getOctokitForInstallation } from "@/lib/github";
import { Card, Badge, cn } from "@/components/ui";
import { CommitList } from "@/components/CommitList";
import type {
  CommitSummary,
  ContentEntry,
  ContentEntryType,
  FileContent,
} from "@/types/github";

export const dynamic = "force-dynamic";

type Tab = "commits" | "files";
type ContentsResponse =
  | { kind: "dir"; entries: ContentEntry[] }
  | { kind: "file"; file: FileContent }
  | { kind: "other"; entry: ContentEntry };

const INITIAL_COMMITS_TTL_MS = 60_000;
const initialCommitsCache = new Map<
  string,
  { expiresAt: number; commits: CommitSummary[]; error: string | null }
>();

function repoHref(id: string, tab: Tab, ref: string, path = ""): string {
  const params = new URLSearchParams({ tab, ref });
  if (path) params.set("path", path);
  return `/repositories/${id}?${params.toString()}`;
}

async function getRepoOctokit(installationId: string) {
  return getOctokitForInstallation({ installationDbId: installationId });
}

async function getBranches({
  installationId,
  owner,
  repo,
}: {
  installationId: string;
  owner: string;
  repo: string;
}): Promise<string[]> {
  const { octokit } = await getRepoOctokit(installationId);
  const branches = await octokit.paginate(octokit.rest.repos.listBranches, {
    owner,
    repo,
    per_page: 100,
  });
  return branches.map((b) => b.name);
}

async function getCommits({
  installationId,
  owner,
  repo,
  branch,
}: {
  installationId: string;
  owner: string;
  repo: string;
  branch: string;
}): Promise<{ commits: CommitSummary[]; error: string | null }> {
  const cacheKey = `${installationId}:${owner}/${repo}:${branch}:10`;
  const cached = initialCommitsCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return { commits: cached.commits, error: cached.error };
  }

  try {
    const { octokit } = await getRepoOctokit(installationId);
    const { data } = await octokit.rest.repos.listCommits({
      owner,
      repo,
      sha: branch,
      per_page: 10,
    });
    const result = {
      error: null,
      commits: data.map((c) => ({
        sha: c.sha,
        message: c.commit.message,
        htmlUrl: c.html_url,
        author: {
          name: c.commit.author?.name ?? null,
          email: c.commit.author?.email ?? null,
          date: c.commit.author?.date ?? null,
          login: c.author?.login ?? null,
          avatarUrl: c.author?.avatar_url ?? null,
        },
      })),
    };
    initialCommitsCache.set(cacheKey, {
      ...result,
      expiresAt: Date.now() + INITIAL_COMMITS_TTL_MS,
    });
    return result;
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unable to load commits";
    const result = { commits: [], error: message };
    initialCommitsCache.set(cacheKey, { ...result, expiresAt: Date.now() + 5_000 });
    return result;
  }
}

async function getContents({
  installationId,
  owner,
  repo,
  branch,
  path,
}: {
  installationId: string;
  owner: string;
  repo: string;
  branch: string;
  path: string;
}): Promise<{ contents: ContentsResponse | null; error: string | null }> {
  try {
    const { octokit } = await getRepoOctokit(installationId);
    const { data } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path,
      ref: branch,
    });

    if (Array.isArray(data)) {
      return {
        error: null,
        contents: {
          kind: "dir",
          entries: data.map((d) => ({
            type: d.type as ContentEntryType,
            name: d.name,
            path: d.path,
            sha: d.sha,
            size: d.size,
            htmlUrl: d.html_url,
            downloadUrl: d.download_url,
          })),
        },
      };
    }

    if (data.type === "file") {
      return {
        error: null,
        contents: {
          kind: "file",
          file: {
            type: "file",
            name: data.name,
            path: data.path,
            sha: data.sha,
            size: data.size,
            htmlUrl: data.html_url,
            downloadUrl: data.download_url,
            encoding: (data.encoding as FileContent["encoding"]) ?? "base64",
            content: data.content ?? null,
          },
        },
      };
    }

    return {
      error: null,
      contents: {
        kind: "other",
        entry: {
          type: data.type as ContentEntryType,
          name: data.name,
          path: data.path,
          sha: data.sha,
          size: data.size,
          htmlUrl: data.html_url,
          downloadUrl: data.download_url,
        },
      },
    };
  } catch (err) {
    return {
      contents: null,
      error: err instanceof Error ? err.message : "Unable to load files",
    };
  }
}

export default async function RepositoryDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; ref?: string; path?: string }>;
}) {
  const user = await requireUser().catch(() => {
    redirect("/login");
  });
  if (!user) redirect("/login");

  const { id } = await params;
  const query = await searchParams;

  const repo = await prisma.repository.findFirst({
    where: { id, installation: { userId: user.id } },
    include: { installation: { select: { accountLogin: true } } },
  });
  if (!repo) notFound();

  const [owner, name] = repo.fullName.split("/");
  const tab: Tab = query.tab === "files" ? "files" : "commits";
  const branch = query.ref || repo.defaultBranch;
  const path = query.path || "";

  const [branches, commitsResult, contentsResult] = await Promise.all([
    getBranches({ installationId: repo.installationId, owner, repo: name }).catch(
      () => [branch],
    ),
    tab === "commits"
      ? getCommits({ installationId: repo.installationId, owner, repo: name, branch })
      : Promise.resolve({ commits: [], error: null }),
    tab === "files"
      ? getContents({
          installationId: repo.installationId,
          owner,
          repo: name,
          branch,
          path,
        })
      : Promise.resolve({ contents: null, error: null }),
  ]);

  return (
    <div>
      <nav className="mb-6 flex items-center gap-2 text-sm text-gray-7">
        <Link href="/repositories" className="transition-colors hover:text-white">
          Repositories
        </Link>
        <span className="text-gray-5">/</span>
        <span>{owner}</span>
        <span className="text-gray-5">/</span>
        <span className="text-white">{name}</span>
      </nav>

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
            <p className="mt-1 font-mono text-xs text-gray-7">{repo.fullName}</p>
            {repo.description ? (
              <p className="mt-3 max-w-2xl text-sm text-gray-8">
                {repo.description}
              </p>
            ) : null}
            <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-1.5 text-xs text-gray-7">
              <div className="flex items-center gap-1.5">
                <dt>Default branch</dt>
                <dd className="font-mono text-gray-9">{repo.defaultBranch}</dd>
              </div>
              {repo.language ? (
                <div className="flex items-center gap-1.5">
                  <dt>Language</dt>
                  <dd className="text-gray-9">{repo.language}</dd>
                </div>
              ) : null}
              <div className="flex items-center gap-1.5">
                <dt>Installation</dt>
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
            <span aria-hidden>↗</span>
          </a>
        </div>
      </Card>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <form action={`/repositories/${id}`} className="flex items-center gap-2">
          <input type="hidden" name="tab" value={tab} />
          {path ? <input type="hidden" name="path" value={path} /> : null}
          <select
            name="ref"
            defaultValue={branch}
            className="h-11 rounded-md border border-gray-4 bg-gray-1 px-3 font-mono text-sm font-medium text-white"
          >
            {branches.map((b) => (
              <option key={b} value={b} className="bg-black text-white">
                {b}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="h-11 rounded-md border border-gray-4 px-3 text-sm font-medium text-white hover:bg-gray-3"
          >
            Go
          </button>
        </form>

        <div className="flex h-9 items-center gap-0.5 rounded-md border border-gray-4 bg-gray-1 p-0.5">
          {(["commits", "files"] as const).map((t) => (
            <Link
              key={t}
              href={repoHref(id, t, branch)}
              className={cn(
                "inline-flex h-7 items-center rounded-[5px] px-3 text-xs font-medium capitalize transition-colors",
                tab === t
                  ? "bg-white text-black"
                  : "text-gray-7 hover:bg-gray-3 hover:text-white",
              )}
            >
              {t}
            </Link>
          ))}
        </div>
      </div>

      {tab === "commits" ? (
        commitsResult.error ? (
          <InlineError message={commitsResult.error} />
        ) : (
          <CommitList commits={commitsResult.commits} />
        )
      ) : contentsResult.error || !contentsResult.contents ? (
        <InlineError message={contentsResult.error ?? "Unable to load files"} />
      ) : (
        <FilesView
          id={id}
          repo={name}
          branch={branch}
          path={path}
          contents={contentsResult.contents}
        />
      )}
    </div>
  );
}

function InlineError({ message }: { message: string }) {
  return (
    <Card>
      <div className="px-5 py-6 text-sm text-red-400">{message}</div>
    </Card>
  );
}

function FilesView({
  id,
  repo,
  branch,
  path,
  contents,
}: {
  id: string;
  repo: string;
  branch: string;
  path: string;
  contents: ContentsResponse;
}) {
  const segments = path === "" ? [] : path.split("/");

  return (
    <div>
      <nav className="mb-3 flex flex-wrap items-center gap-1 text-xs">
        <Link
          href={repoHref(id, "files", branch)}
          className={cn(
            "rounded px-1.5 py-0.5 font-mono transition-colors",
            path === "" ? "text-white" : "text-gray-7 hover:bg-gray-3 hover:text-white",
          )}
        >
          {repo}
        </Link>
        {segments.map((seg, i) => {
          const sub = segments.slice(0, i + 1).join("/");
          const isLast = i === segments.length - 1;
          return (
            <span key={sub} className="flex items-center gap-1">
              <span className="text-gray-5">/</span>
              <Link
                href={repoHref(id, "files", branch, sub)}
                className={cn(
                  "rounded px-1.5 py-0.5 font-mono transition-colors",
                  isLast
                    ? "text-white"
                    : "text-gray-7 hover:bg-gray-3 hover:text-white",
                )}
              >
                {seg}
              </Link>
            </span>
          );
        })}
      </nav>

      {contents.kind === "dir" ? (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-gray-4">
            {[...contents.entries]
              .sort((a, b) => {
                if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
                return a.name.localeCompare(b.name);
              })
              .map((entry) => (
                <li key={entry.path}>
                  <Link
                    href={
                      entry.type === "dir" || entry.type === "file"
                        ? repoHref(id, "files", branch, entry.path)
                        : entry.htmlUrl ?? "#"
                    }
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
                  </Link>
                </li>
              ))}
          </ul>
        </Card>
      ) : contents.kind === "file" ? (
        <FilePreview file={contents.file} />
      ) : (
        <Card>
          <div className="px-5 py-6 text-sm text-gray-7">
            {contents.entry.type} is not previewable.
          </div>
        </Card>
      )}
    </div>
  );
}

function FilePreview({ file }: { file: FileContent }) {
  const text =
    file.content && file.encoding === "base64"
      ? Buffer.from(file.content.replace(/\n/g, ""), "base64").toString("utf8")
      : file.encoding === "utf-8"
        ? file.content
        : null;
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
  return (
    <span className="w-4 shrink-0 text-gray-7" aria-hidden>
      {type === "dir" ? "▸" : "•"}
    </span>
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
