import { execFileSync } from "node:child_process";

import { z } from "zod";

import type { AgentLabel, IssueCommentRecord } from "../verification/agent-policy.ts";

/** Runs `gh` with the given arguments and returns its standard output. */
export type GhExec = (args: readonly string[]) => string;

type ExecFile = (
  file: string,
  args: readonly string[],
  options: { cwd: string; encoding: "utf8"; maxBuffer: number },
) => string;

/** How a client resolves its repository from the environment and spawns `gh`; tests replace both. */
type GhProcess = { env?: NodeJS.ProcessEnv; execFile?: ExecFile };

/** Paginated REST requests ask for GitHub's largest page; `gh api --paginate` follows every page. */
const REST_PAGE_SIZE = 100;

/** Paginated responses with long issue bodies exceed Node's 1 MiB default output buffer. */
const GH_MAX_BUFFER_BYTES = 32 * 1024 * 1024;

/** Creates a `gh` runner in `repoRoot` that uses the environment's own `GH_TOKEN` or `gh auth` login. */
export const createGhExec = ({
  repoRoot,
  execFile = execFileSync,
}: {
  repoRoot: string;
  execFile?: ExecFile;
}): GhExec => {
  const options = { cwd: repoRoot, encoding: "utf8", maxBuffer: GH_MAX_BUFFER_BYTES } as const;
  return (args) => execFile("gh", args, options);
};

export type RepoIdentity = {
  owner: string;
  name: string;
};

/** Every REST request names this host, so neither `GH_HOST` nor `gh`'s default can redirect it. */
const GITHUB_HOST = "github.com";

const ownerAndName = (match: RegExpExecArray | null): RepoIdentity | null =>
  match?.[1] && match[2] ? { owner: match[1], name: match[2] } : null;

/** Parses owner/repo from a github.com HTTPS or SSH URL. */
const parseGitHubDotComUrl = (url: string): RepoIdentity | null =>
  ownerAndName(/^git@github\.com:([^/]+)\/([^/]+)$/i.exec(url)) ??
  ownerAndName(/^https?:\/\/(?:[^@]+@)?github\.com\/([^/]+)\/([^/]+)$/i.exec(url));

/**
 * Parses GitHub owner/repo from a git remote without invoking GraphQL: a github.com HTTPS or SSH
 * URL, or the cloud session's proxy URL for this checkout's own origin.
 */
export const parseGitHubRemote = (remoteUrl: string): RepoIdentity | null => {
  const trimmed = remoteUrl.trim().replace(/\.git$/, "");
  return (
    parseGitHubDotComUrl(trimmed) ??
    ownerAndName(/^https?:\/\/[^/]+\/git\/([^/]+)\/([^/]+)$/.exec(trimmed))
  );
};

/**
 * Parses `[github.com/]OWNER/REPO` (the `GH_REPO` format) or a github.com remote URL. Requests carry
 * no host, so `gh` sends them to github.com; a spec naming another host is rejected rather than
 * silently pointed at a same-named github.com repository.
 */
const parseGitHubRepoSpec = (spec: string): RepoIdentity | null => {
  const trimmed = spec.trim().replace(/\.git$/, "");
  // Only github.com URLs: a proxy-shaped URL could name any host, which requests would then ignore.
  const fromUrl = parseGitHubDotComUrl(trimmed);
  if (fromUrl) {
    return fromUrl;
  }
  const segments = trimmed.split("/");
  const isRepoPath =
    (segments.length === 2 || segments.length === 3) &&
    segments.every((segment) => segment.length > 0 && !/[\s:]/.test(segment));
  const onGitHubDotCom = segments.length === 2 || segments[0]?.toLowerCase() === "github.com";
  const [owner, name] = segments.slice(-2);
  return isRepoPath && onGitHubDotCom && owner && name ? { owner, name } : null;
};

const repoFromOrigin = (repoRoot: string): RepoIdentity => {
  const remoteUrl = execFileSync("git", ["remote", "get-url", "origin"], {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();
  const parsed = parseGitHubRemote(remoteUrl);
  if (!parsed) {
    throw new Error(`Could not determine GitHub owner/repo from origin remote "${remoteUrl}".`);
  }
  return parsed;
};

/**
 * Reads the repository the way `gh` does: `GH_REPO` first, then `GITHUB_REPOSITORY` in Actions,
 * otherwise the `origin` remote.
 */
export const resolveRepoIdentity = (
  repoRoot: string,
  env: NodeJS.ProcessEnv = process.env,
): RepoIdentity => {
  const ghRepo = env.GH_REPO?.trim();
  if (ghRepo) {
    const parsed = parseGitHubRepoSpec(ghRepo);
    if (!parsed) {
      throw new Error(
        `Invalid GH_REPO "${ghRepo}"; expected [github.com/]OWNER/REPO (only github.com repositories are supported).`,
      );
    }
    return parsed;
  }
  const [owner, name] =
    env.GITHUB_REPOSITORY?.trim()
      .match(/^([^/\s]+)\/([^/\s]+)$/)
      ?.slice(1) ?? [];
  return owner && name ? { owner, name } : repoFromOrigin(repoRoot);
};

export type RestCheckRun = {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
};

export type RestCommitStatus = {
  context: string;
  state: string;
};

export type RestPullReviewComment = {
  id: number;
  in_reply_to_id?: number | null;
  path: string;
  line?: number | null;
  original_line?: number | null;
  author_association: string;
  user: { login: string } | null;
  body: string;
};

type RestIssue = {
  number: number;
  state: string;
  title: string;
  body: string;
  labels: string[];
  commentCount: number;
  isPullRequest: boolean;
};

type RestPull = {
  number: number;
  title: string;
  body: string;
  draft: boolean;
  createdAt: string;
  updatedAt: string;
  labels: string[];
  headRefName: string;
  headSha: string;
};

type RestWorkflowRun = {
  id: number;
  attempt: number;
  conclusion: string | null;
};

type RestOpenedPull = {
  number: number;
  url: string;
  headRefName: string;
};

const restLabelSchema = z.object({ name: z.string() });

const restCommentSchema = z.object({
  body: z.string().nullable().default(""),
  author_association: z.string().default(""),
});

const restIssueSchema = z.object({
  number: z.number(),
  state: z.string(),
  title: z.string(),
  body: z.string().nullable().default(""),
  labels: z.array(restLabelSchema),
  comments: z.number().default(0),
  pull_request: z.unknown().optional(),
});

const restPullSchema = z.object({
  number: z.number(),
  title: z.string(),
  body: z.string().nullable().default(""),
  draft: z.boolean().default(false),
  created_at: z.string(),
  updated_at: z.string(),
  labels: z.array(restLabelSchema),
  head: z.object({
    ref: z.string(),
    sha: z.string(),
  }),
});

const restCheckRunsPageSchema = z.object({
  check_runs: z.array(
    z.object({
      id: z.number(),
      name: z.string(),
      status: z.string(),
      conclusion: z.string().nullable(),
    }),
  ),
});

const restCommitStatusPageSchema = z.object({
  statuses: z.array(
    z.object({
      context: z.string(),
      state: z.string(),
    }),
  ),
});

const restPullReviewCommentSchema = z.object({
  id: z.number(),
  in_reply_to_id: z.number().nullable().optional(),
  path: z.string(),
  line: z.number().nullable().optional(),
  original_line: z.number().nullable().optional(),
  author_association: z.string().default(""),
  user: z.object({ login: z.string() }).nullable(),
  body: z.string(),
});

const restWorkflowRunsSchema = z.object({
  workflow_runs: z.array(
    z.object({
      id: z.number(),
      run_attempt: z.number().int().positive(),
      conclusion: z.string().nullable(),
    }),
  ),
});

const restOpenedPullSchema = z.object({
  number: z.number(),
  html_url: z.string(),
  head: z.object({ ref: z.string() }),
});

const labelNames = (labels: ReadonlyArray<{ name: string }>) => labels.map((label) => label.name);

const toRestIssue = (issue: z.output<typeof restIssueSchema>): RestIssue => ({
  number: issue.number,
  state: issue.state,
  title: issue.title,
  body: issue.body ?? "",
  labels: labelNames(issue.labels),
  commentCount: issue.comments,
  isPullRequest: issue.pull_request !== undefined,
});

const toOpenedPull = (pr: z.output<typeof restOpenedPullSchema>): RestOpenedPull => ({
  number: pr.number,
  url: pr.html_url,
  headRefName: pr.head.ref,
});

const toRestPull = (pr: z.output<typeof restPullSchema>): RestPull => ({
  number: pr.number,
  title: pr.title,
  body: pr.body ?? "",
  draft: pr.draft,
  createdAt: pr.created_at,
  updatedAt: pr.updated_at,
  labels: labelNames(pr.labels),
  headRefName: pr.head.ref,
  headSha: pr.head.sha,
});

/** The repository and the `gh api` requests every REST operation builds on. */
type RestContext = {
  /** The repository, resolved on first use so a client can be built before it is needed. */
  repo: () => RepoIdentity;
  /** Prefixes `path` with the repository's `repos/<owner>/<name>` endpoint. */
  endpoint: (path: string) => string;
  /** Runs one request and returns its parsed JSON, or null for an empty response. */
  api: (args: readonly string[]) => unknown;
  /** Fetches every page of `endpoint`, validating each page against `pageSchema`. */
  paginate: <T extends z.ZodType>(endpoint: string, pageSchema: T) => z.output<T>[];
  /** Sends `fields` as `-f` form fields to `endpoint` with the given method. */
  send: (method: "POST" | "PATCH", endpoint: string, fields?: readonly string[]) => unknown;
};

const createRestContext = (resolveRepo: () => RepoIdentity, exec: GhExec): RestContext => {
  let resolved: RepoIdentity | undefined;

  const repo = () => (resolved ??= resolveRepo());

  const api = (args: readonly string[]): unknown => {
    const raw = exec(["api", "--hostname", GITHUB_HOST, ...args]);
    return raw.trim() ? JSON.parse(raw) : null;
  };

  return {
    repo,
    endpoint: (path) => `repos/${repo().owner}/${repo().name}/${path}`,
    api,
    paginate: (endpoint, pageSchema) =>
      z.array(pageSchema).parse(api(["--paginate", "--slurp", endpoint])),
    send: (method, endpoint, fields = []) =>
      api([endpoint, "-X", method, ...fields.flatMap((field) => ["-f", field])]),
  };
};

type IssueState = "open" | "closed";

/** Lists issues and pull requests in `state`, optionally only those carrying `label`. */
const listRestIssues = (
  { endpoint, paginate }: RestContext,
  { state, label }: { state: IssueState; label?: AgentLabel },
): RestIssue[] => {
  const query = new URLSearchParams({ state, per_page: String(REST_PAGE_SIZE) });
  if (label) {
    query.set("labels", label);
  }
  return paginate(endpoint(`issues?${query.toString()}`), z.array(restIssueSchema)).flatMap(
    (page) => page.map(toRestIssue),
  );
};

const getRestIssue = ({ endpoint, api }: RestContext, number: number): RestIssue =>
  toRestIssue(restIssueSchema.parse(api([endpoint(`issues/${number}`)])));

const listRestIssueComments = (
  { endpoint, paginate }: RestContext,
  number: number,
): IssueCommentRecord[] =>
  paginate(
    endpoint(`issues/${number}/comments?per_page=${REST_PAGE_SIZE}`),
    z.array(restCommentSchema),
  )
    .flat()
    .map((comment) => ({
      body: comment.body ?? "",
      authorAssociation: comment.author_association,
    }));

const restIssueOperations = (context: RestContext) => ({
  getIssue: (number: number): RestIssue => getRestIssue(context, number),

  /** Lists open issues and pull requests carrying `label`; pull requests have `isPullRequest`. */
  listOpenIssues: (label: AgentLabel): RestIssue[] =>
    listRestIssues(context, { state: "open", label }),

  listIssueComments: (number: number): IssueCommentRecord[] =>
    listRestIssueComments(context, number),

  postIssueComment: (number: number, body: string) => {
    context.send("POST", context.endpoint(`issues/${number}/comments`), [`body=${body}`]);
  },

  addLabels: (number: number, labels: readonly AgentLabel[]) => {
    context.send(
      "POST",
      context.endpoint(`issues/${number}/labels`),
      labels.map((label) => `labels[]=${label}`),
    );
  },
});

const restPullOperations = ({ repo, endpoint, api, paginate, send }: RestContext) => ({
  getPull: (number: number): RestPull =>
    toRestPull(restPullSchema.parse(api([endpoint(`pulls/${number}`)]))),

  listReviewComments: (prNumber: number): RestPullReviewComment[] =>
    paginate(
      endpoint(`pulls/${prNumber}/comments?per_page=${REST_PAGE_SIZE}`),
      z.array(restPullReviewCommentSchema),
    ).flat(),

  /** Returns the first open pull request from `head` into `base`, if any. */
  findOpenPull: ({ head, base }: { head: string; base: string }) =>
    z
      .array(restOpenedPullSchema)
      .parse(
        api([
          endpoint(
            `pulls?state=open&head=${encodeURIComponent(`${repo().owner}:${head}`)}&base=${encodeURIComponent(base)}&per_page=10`,
          ),
        ]),
      )
      .map(toOpenedPull)[0] ?? null,

  createPull: (pull: { title: string; head: string; base: string; body: string }) =>
    toOpenedPull(
      restOpenedPullSchema.parse(
        send("POST", endpoint("pulls"), [
          `title=${pull.title}`,
          `head=${pull.head}`,
          `base=${pull.base}`,
          `body=${pull.body}`,
        ]),
      ),
    ),

  replyToReviewComment: (prNumber: number, commentId: number, body: string) => {
    send("POST", endpoint(`pulls/${prNumber}/comments/${commentId}/replies`), [`body=${body}`]);
  },
});

const restCheckOperations = ({ endpoint, api, paginate, send }: RestContext) => ({
  /** Lists every check run and commit status reported for `sha`, including superseded reruns. */
  listCommitChecks: (sha: string): { checkRuns: RestCheckRun[]; statuses: RestCommitStatus[] } => ({
    checkRuns: paginate(
      endpoint(`commits/${sha}/check-runs?per_page=${REST_PAGE_SIZE}`),
      restCheckRunsPageSchema,
    ).flatMap((page) => page.check_runs),
    statuses: paginate(
      endpoint(`commits/${sha}/status?per_page=${REST_PAGE_SIZE}`),
      restCommitStatusPageSchema,
    ).flatMap((page) => page.statuses),
  }),

  /** Lists the ten most recent runs of `workflowFile` for `headSha`. */
  listWorkflowRuns: (workflowFile: string, headSha: string): RestWorkflowRun[] =>
    restWorkflowRunsSchema
      .parse(
        api([
          endpoint(
            `actions/workflows/${workflowFile}/runs?head_sha=${encodeURIComponent(headSha)}&per_page=10`,
          ),
        ]),
      )
      .workflow_runs.map((run) => ({
        id: run.id,
        attempt: run.run_attempt,
        conclusion: run.conclusion,
      })),

  rerunFailedJobs: (runId: number) => {
    send("POST", endpoint(`actions/runs/${runId}/rerun-failed-jobs`));
  },
});

/** How a client finds its repository and runs `gh`; tests replace any of them. */
type ClientOptions = GhProcess & {
  repoRoot: string;
  /** Defaults to `GH_REPO`, `GITHUB_REPOSITORY`, or the `origin` remote, read on first request. */
  repo?: RepoIdentity;
  exec?: GhExec;
};

const createClientContext = ({ repoRoot, repo, env, execFile, exec }: ClientOptions): RestContext =>
  createRestContext(
    () => repo ?? resolveRepoIdentity(repoRoot, env),
    exec ?? createGhExec({ repoRoot, execFile }),
  );

/**
 * Reads and writes issues and pull requests through the GitHub REST API with ambient credentials.
 * Every request is a `gh api` call to a REST path, because the Claude Code cloud proxy rejects the
 * GraphQL requests that `gh issue` and `gh pr` make.
 */
export type GitHubRestClient = ReturnType<typeof createGitHubRestClient>;

export const createGitHubRestClient = (options: ClientOptions) => {
  const context = createClientContext(options);
  return {
    ...restIssueOperations(context),
    ...restPullOperations(context),
    ...restCheckOperations(context),
  };
};

export type IssueListItem = {
  number: number;
  title: string;
  state: "OPEN" | "CLOSED";
  body: string;
  labels: string[];
  comments: IssueCommentRecord[];
};

export type IssueListQuery = {
  state: IssueState;
  label?: AgentLabel;
  /** Also fetches the comments of each issue that has any, which the issue list leaves out. */
  withComments?: boolean;
};

const restCreatedIssueSchema = z.object({
  html_url: z.string(),
  labels: z.array(restLabelSchema).default([]),
});

/** Returns any requested labels missing from GitHub's created-issue response (case-insensitive). */
const findMissingAppliedLabels = (
  requestedLabels: readonly string[],
  appliedLabels: readonly { name: string }[],
): string[] => {
  const applied = new Set(appliedLabels.map((label) => label.name.toLowerCase()));
  return requestedLabels.filter((label) => !applied.has(label.toLowerCase()));
};

const upperCaseState = (state: string): "OPEN" | "CLOSED" =>
  state.toUpperCase() === "CLOSED" ? "CLOSED" : "OPEN";

const listIssuesOnly = (
  context: RestContext,
  { state, label, withComments = false }: IssueListQuery,
): IssueListItem[] =>
  listRestIssues(context, { state, label })
    .filter((issue) => !issue.isPullRequest)
    .map((issue) => ({
      number: issue.number,
      title: issue.title,
      state: upperCaseState(issue.state),
      body: issue.body,
      labels: issue.labels,
      comments:
        withComments && issue.commentCount > 0 ? listRestIssueComments(context, issue.number) : [],
    }));

/** Files an issue and returns its URL, failing when GitHub drops a requested label. */
const createRestIssue = (
  { endpoint, send }: RestContext,
  { title, body, labels }: { title: string; body: string; labels: readonly string[] },
): string => {
  const created = restCreatedIssueSchema.parse(
    send("POST", endpoint("issues"), [
      `title=${title}`,
      `body=${body}`,
      ...labels.map((label) => `labels[]=${label}`),
    ]),
  );
  const missingLabels = findMissingAppliedLabels(labels, created.labels);
  if (missingLabels.length > 0) {
    throw new Error(
      `Issue created at ${created.html_url}, but GitHub did not apply requested label(s): ${missingLabels.join(", ")}. Check token permissions and apply the missing labels manually.`,
    );
  }
  return created.html_url;
};

/** Reads and files issues for scout and proposal runs through the GitHub REST API. */
export type GitHubIssueClient = ReturnType<typeof createGitHubIssueClient>;

export const createGitHubIssueClient = (options: ClientOptions) => {
  const context = createClientContext(options);
  return {
    /** Lists every issue in `state`, optionally only those carrying `label`; never pull requests. */
    listIssues: (query: IssueListQuery): IssueListItem[] => listIssuesOnly(context, query),

    viewIssue: (number: number) => {
      const issue = getRestIssue(context, number);
      return {
        number: issue.number,
        state: issue.state.toUpperCase(),
        title: issue.title,
        body: issue.body,
      };
    },

    editIssueBody: (number: number, body: string) => {
      context.send("PATCH", context.endpoint(`issues/${number}`), [`body=${body}`]);
    },

    createIssue: (issue: { title: string; body: string; labels: readonly string[] }): string =>
      createRestIssue(context, issue),
  };
};
