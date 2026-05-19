/**
 * Shared GitHub-related types.
 *
 * We DON'T re-export Octokit's giant generated types from here — they pull in
 * a lot at build time. Instead we declare the lean shapes our own code and UI
 * actually consume. Where a route returns Octokit data verbatim, the route file
 * narrows it to one of these types before responding.
 */

// -----------------------------------------------------------------------------
// Installation
// -----------------------------------------------------------------------------

export type GitHubAccountType = "User" | "Organization";
export type RepositorySelection = "all" | "selected";

export interface InstallationSummary {
  id: string; // our DB id
  installationId: string; // GitHub's numeric id, stringified for JSON safety
  accountLogin: string;
  accountType: GitHubAccountType;
  repositorySelection: RepositorySelection;
  suspendedAt: string | null;
  createdAt: string;
}

// -----------------------------------------------------------------------------
// Repository
// -----------------------------------------------------------------------------

export interface RepositorySummary {
  id: string;
  githubRepoId: string;
  name: string;
  fullName: string;
  private: boolean;
  defaultBranch: string;
  htmlUrl: string;
  description: string | null;
  language: string | null;
  archived: boolean;
  disabled: boolean;
  pushedAt: string | null;
  lastSyncedAt: string;
}

// -----------------------------------------------------------------------------
// Branch / Commit / Contents (lean shapes for UI)
// -----------------------------------------------------------------------------

export interface BranchSummary {
  name: string;
  protected: boolean;
  commit: {
    sha: string;
    url: string;
  };
}

export interface CommitSummary {
  sha: string;
  message: string;
  author: {
    name: string | null;
    email: string | null;
    date: string | null;
    login: string | null;
    avatarUrl: string | null;
  };
  htmlUrl: string;
}

export type ContentEntryType = "file" | "dir" | "symlink" | "submodule";

export interface ContentEntry {
  type: ContentEntryType;
  name: string;
  path: string;
  sha: string;
  size: number;
  htmlUrl: string | null;
  downloadUrl: string | null;
}

export interface FileContent extends ContentEntry {
  type: "file";
  encoding: "base64" | "utf-8" | "none";
  content: string | null; // base64 when encoding === "base64"
}

// -----------------------------------------------------------------------------
// Webhook payloads (narrow subset)
//
// We only type the fields we actually read; GitHub's full payloads are huge.
// -----------------------------------------------------------------------------

export type GitHubWebhookEvent =
  | "push"
  | "installation"
  | "installation_repositories"
  | "pull_request"
  | "ping";

export interface WebhookAccount {
  id: number;
  login: string;
  type: GitHubAccountType;
}

export interface WebhookRepository {
  id: number;
  node_id: string;
  name: string;
  full_name: string;
  private: boolean;
  html_url: string;
  default_branch: string;
  description: string | null;
  language: string | null;
  archived: boolean;
  disabled: boolean;
  pushed_at: string | null;
}

export interface InstallationWebhookPayload {
  action:
    | "created"
    | "deleted"
    | "suspend"
    | "unsuspend"
    | "new_permissions_accepted";
  installation: {
    id: number;
    account: WebhookAccount;
    repository_selection: RepositorySelection;
    permissions: Record<string, string>;
    events: string[];
    target_type: string;
  };
  repositories?: WebhookRepository[];
  sender: WebhookAccount;
}

export interface InstallationRepositoriesPayload {
  action: "added" | "removed";
  installation: { id: number; account: WebhookAccount };
  repository_selection: RepositorySelection;
  repositories_added: WebhookRepository[];
  repositories_removed: WebhookRepository[];
  sender: WebhookAccount;
}

export interface PushWebhookPayload {
  ref: string;
  before: string;
  after: string;
  installation: { id: number };
  repository: WebhookRepository;
  pusher: { name: string; email: string | null };
  commits: Array<{
    id: string;
    message: string;
    timestamp: string;
    author: { name: string; email: string };
  }>;
}

export interface PullRequestWebhookPayload {
  action:
    | "opened"
    | "closed"
    | "reopened"
    | "edited"
    | "synchronize"
    | "ready_for_review";
  number: number;
  installation: { id: number };
  repository: WebhookRepository;
  pull_request: {
    id: number;
    number: number;
    state: "open" | "closed";
    title: string;
    body: string | null;
    html_url: string;
    user: WebhookAccount;
    merged: boolean;
    draft: boolean;
    head: { ref: string; sha: string };
    base: { ref: string; sha: string };
  };
}

// -----------------------------------------------------------------------------
// API response envelopes
// -----------------------------------------------------------------------------

export interface ApiSuccess<T> {
  ok: true;
  data: T;
}

export interface ApiError {
  ok: false;
  error: {
    code: string;
    message: string;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;