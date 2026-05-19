import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { guardRequest } from "@/app/api/_lib/guard";
import { ok, fail, failFromError } from "@/app/api/_lib/response";
import { resolveRepoForUser } from "@/app/api/_lib/resolve-repo";
import type {
  ContentEntry,
  ContentEntryType,
  FileContent,
} from "@/types/github";

/**
 * GET /api/github/repos/{owner}/{repo}/contents?path=src/lib&ref=main
 *
 * Returns directory listing OR a single file's content depending on what
 * `path` resolves to on GitHub.
 *
 * GitHub's `getContent` endpoint is polymorphic:
 *   - directory  → array of entries
 *   - file       → object with `content` (base64) and `encoding`
 *   - symlink    → object describing the link
 *   - submodule  → object describing the submodule
 *
 * We narrow the response into our `ContentEntry[]` (always an array) so the
 * UI has a single shape to render. When the path is a single file, we wrap
 * it in a one-element array and add the `content`/`encoding` fields.
 *
 * File size cap
 * -------------
 * The GitHub Contents API returns files up to 1 MB inline. Larger files
 * require the Blob API. We pass through whatever GitHub returns; if you
 * need >1MB files, switch to git.getBlob with the sha.
 */

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ owner: string; repo: string }>;
}

export async function GET(req: NextRequest, { params }: RouteContext) {
  try {
    const guard = await guardRequest(req, { routeName: "github.contents" });
    if (guard) return guard;

    const user = await requireUser();
    const { owner, repo } = await params;

    if (!owner || !repo) {
      return fail("BAD_REQUEST", "Missing owner or repo", 400);
    }

    const url = new URL(req.url);
    const path = url.searchParams.get("path") ?? ""; // empty = repo root
    const ref = url.searchParams.get("ref") ?? undefined;

    const { octokit, defaultBranch } = await resolveRepoForUser({
      owner,
      repo,
      userId: user.id,
    });

    const { data } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path,
      ref: ref ?? defaultBranch,
    });

    // Polymorphic response — branch on shape.
    if (Array.isArray(data)) {
      const entries: ContentEntry[] = data.map((d) => ({
        type: d.type as ContentEntryType,
        name: d.name,
        path: d.path,
        sha: d.sha,
        size: d.size,
        htmlUrl: d.html_url,
        downloadUrl: d.download_url,
      }));
      return ok({ kind: "dir" as const, entries });
    }

    // Single file / symlink / submodule. Narrow with discriminator.
    if (data.type === "file") {
      const file: FileContent = {
        type: "file",
        name: data.name,
        path: data.path,
        sha: data.sha,
        size: data.size,
        htmlUrl: data.html_url,
        downloadUrl: data.download_url,
        encoding: (data.encoding as FileContent["encoding"]) ?? "base64",
        content: data.content ?? null,
      };
      return ok({ kind: "file" as const, file });
    }

    // symlink / submodule — return basic entry info, no content.
    const entry: ContentEntry = {
      type: data.type as ContentEntryType,
      name: data.name,
      path: data.path,
      sha: data.sha,
      size: data.size,
      htmlUrl: data.html_url,
      downloadUrl: data.download_url,
    };
    return ok({ kind: "other" as const, entry });
  } catch (err) {
    return failFromError(err);
  }
}