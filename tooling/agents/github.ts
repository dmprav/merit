import { execFileSync } from "node:child_process";

import { z } from "zod";

import type { AgentLabel, IssueCommentRecord } from "../verification/agent-policy.ts";

/** Runs `gh` with the given arguments and returns its standard output. */
export type GhExec = (args: readonly string[]) => string;

/**
 * Whose credentials `gh` uses: `ambient` keeps the environment's own `GH_TOKEN` or `gh auth` login;
 * `scout` prefers `MERIT_SCOUT_GH_TOKEN` for runners whose default token cannot write issues.
 */
export type GhAuth = "ambient" | "scout";

type ExecFile = (
  file: string,
  args: readonly string[],
  options: { cwd: string; encoding: "utf8"; env?: NodeJS.ProcessEnv },
) => string;

/** Issue list queries return at most this many issues; `gh issue list` does not page beyond it. */
export const ISSUE_LIST_LIMIT = 200;

export const SCOUT_GH_TOKEN_ENV = "MERIT_SCOUT_GH_TOKEN";

/** Prefers `MERIT_SCOUT_GH_TOKEN` over injected integration tokens (such as Cursor's `GH_TOKEN`) when running `gh`. */
export const resolveScoutGhEnv = (env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv => {
  const scoutToken = env[SCOUT_GH_TOKEN_ENV]?.trim();
  if (!scoutToken) {
    return env;
  }
  return {
    ...env,
    GH_TOKEN: scoutToken,
  };
};

/** Creates a `gh` runner in `repoRoot` with the requested credentials. */
export const createGhExec = ({
  repoRoot,
  auth,
  env = process.env,
  execFile = execFileSync,
}: {
  repoRoot: string;
  auth: GhAuth;
  env?: NodeJS.ProcessEnv;
  execFile?: ExecFile;
}): GhExec => {
  if (auth === "ambient") {
    return (args) => execFile("gh", args, { cwd: repoRoot, encoding: "utf8" });
  }
  return (args) =>
    execFile("gh", args, { cwd: repoRoot, encoding: "utf8", env: resolveScoutGhEnv(env) });
};

export type RepoIdentity = {
  owner: string;
  name: string;
};

/** Parses GitHub owner/repo from HTTPS, SSH, or cloud-proxy git remote URLs without invoking GraphQL. */
export const parseGitHubRemote = (remoteUrl: string): RepoIdentity | null => {
  const trimmed = remoteUrl.trim().replace(/\.git$/, "");
  const sshMatch = /^git@github\.com:([^/]+)\/([^/]+)$/.exec(trimmed);
  if (sshMatch?.[1] && sshMatch[2]) {
    return { owner: sshMatch[1], name: sshMatch[2] };
  }
  const httpsMatch = /^https?:\/\/(?:[^@]+@)?github\.com\/([^/]+)\/([^/]+)$/.exec(trimmed);
  if (httpsMatch?.[1] && httpsMatch[2]) {
    return { owner: httpsMatch[1], name: httpsMatch[2] };
  }
  const proxyMatch = /^https?:\/\/[^/]+\/git\/([^/]+)\/([^/]+)$/.exec(trimmed);
  if (proxyMatch?.[1] && proxyMatch[2]) {
    return { owner: proxyMatch[1], name: proxyMatch[2] };
  }
  return null;
};

/** Reads the repository from `GITHUB_REPOSITORY` in Actions, otherwise from the `origin` remote. */
export const resolveRepoIdentity = (
  repoRoot: string,
  env: NodeJS.ProcessEnv = process.env,
): RepoIdentity => {
  const envRepo = env.GITHUB_REPOSITORY;
  if (envRepo && /^[^/]+\/[^/]+$/.test(envRepo)) {
    const [owner, name] = envRepo.split("/");
    if (owner && name) {
      return { owner, name };
    }
  }
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

export type RestIssue = {
  number: number;
  state: string;
  title: string;
  body: string;
  labels: string[];
  commentCount: number;
  isPullRequest: boolean;
};

export type RestPull = {
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

export type RestWorkflowRun = {
  id: number;
  attempt: number;
  conclusion: string | null;
};

export type RestOpenedPull = {
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

/**
 * Reads and writes issues and pull requests through the GitHub REST API with ambient credentials.
 * Every request is a `gh api` call to a REST path, because the Claude Code cloud proxy rejects the
 * GraphQL requests that `gh issue` and `gh pr` make.
 */
export type GitHubRestClient = ReturnType<typeof createGitHubRestClient>;

export const createGitHubRestClient = ({
  repoRoot,
  repo = resolveRepoIdentity(repoRoot),
  exec = createGhExec({ repoRoot, auth: "ambient" }),
}: {
  repoRoot: string;
  repo?: RepoIdentity;
  exec?: GhExec;
}) => {
  const base = `repos/${repo.owner}/${repo.name}`;

  const api = (args: readonly string[]): unknown => {
    const raw = exec(["api", ...args]);
    return raw.trim() ? JSON.parse(raw) : null;
  };

  const paginate = <T extends z.ZodType>(endpoint: string, pageSchema: T): z.output<T>[] =>
    z.array(pageSchema).parse(api(["--paginate", "--slurp", endpoint]));

  const post = (endpoint: string, fields: readonly string[] = []) =>
    api([endpoint, "-X", "POST", ...fields.flatMap((field) => ["-f", field])]);

  return {
    repo,

    getIssue: (number: number): RestIssue =>
      toRestIssue(restIssueSchema.parse(api([`${base}/issues/${number}`]))),

    /** Lists open issues and pull requests carrying `label`; pull requests have `isPullRequest`. */
    listOpenIssues: (label: AgentLabel): RestIssue[] =>
      paginate(
        `${base}/issues?state=open&labels=${label}&per_page=100`,
        z.array(restIssueSchema),
      ).flatMap((page) => page.map(toRestIssue)),

    listIssueComments: (number: number): IssueCommentRecord[] =>
      paginate(`${base}/issues/${number}/comments?per_page=100`, z.array(restCommentSchema))
        .flat()
        .map((comment) => ({
          body: comment.body ?? "",
          authorAssociation: comment.author_association,
        })),

    getPull: (number: number): RestPull => {
      const pr = restPullSchema.parse(api([`${base}/pulls/${number}`]));
      return {
        number: pr.number,
        title: pr.title,
        body: pr.body ?? "",
        draft: pr.draft,
        createdAt: pr.created_at,
        updatedAt: pr.updated_at,
        labels: labelNames(pr.labels),
        headRefName: pr.head.ref,
        headSha: pr.head.sha,
      };
    },

    listReviewComments: (prNumber: number): RestPullReviewComment[] =>
      paginate(
        `${base}/pulls/${prNumber}/comments?per_page=100`,
        z.array(restPullReviewCommentSchema),
      ).flat(),

    /** Lists every check run and commit status reported for `sha`, including superseded reruns. */
    listCommitChecks: (
      sha: string,
    ): { checkRuns: RestCheckRun[]; statuses: RestCommitStatus[] } => ({
      checkRuns: paginate(
        `${base}/commits/${sha}/check-runs?per_page=100`,
        restCheckRunsPageSchema,
      ).flatMap((page) => page.check_runs),
      statuses: paginate(
        `${base}/commits/${sha}/status?per_page=100`,
        restCommitStatusPageSchema,
      ).flatMap((page) => page.statuses),
    }),

    /** Lists the ten most recent runs of `workflowFile` for `headSha`. */
    listWorkflowRuns: (workflowFile: string, headSha: string): RestWorkflowRun[] =>
      restWorkflowRunsSchema
        .parse(
          api([
            `${base}/actions/workflows/${workflowFile}/runs?head_sha=${encodeURIComponent(headSha)}&per_page=10`,
          ]),
        )
        .workflow_runs.map((run) => ({
          id: run.id,
          attempt: run.run_attempt,
          conclusion: run.conclusion,
        })),

    rerunFailedJobs: (runId: number) => {
      post(`${base}/actions/runs/${runId}/rerun-failed-jobs`);
    },

    postIssueComment: (number: number, body: string) => {
      post(`${base}/issues/${number}/comments`, [`body=${body}`]);
    },

    addLabels: (number: number, labels: readonly AgentLabel[]) => {
      post(
        `${base}/issues/${number}/labels`,
        labels.map((label) => `labels[]=${label}`),
      );
    },

    /** Returns the first open pull request from `head` into `base`, if any. */
    findOpenPull: ({ head, base: baseRef }: { head: string; base: string }) =>
      z
        .array(restOpenedPullSchema)
        .parse(
          api([
            `${base}/pulls?state=open&head=${encodeURIComponent(`${repo.owner}:${head}`)}&base=${encodeURIComponent(baseRef)}&per_page=10`,
          ]),
        )
        .map(toOpenedPull)[0] ?? null,

    createPull: (pull: { title: string; head: string; base: string; body: string }) =>
      toOpenedPull(
        restOpenedPullSchema.parse(
          post(`${base}/pulls`, [
            `title=${pull.title}`,
            `head=${pull.head}`,
            `base=${pull.base}`,
            `body=${pull.body}`,
          ]),
        ),
      ),

    replyToReviewComment: (prNumber: number, commentId: number, body: string) => {
      post(`${base}/pulls/${prNumber}/comments/${commentId}/replies`, [`body=${body}`]);
    },
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
  state: "open" | "closed";
  label?: AgentLabel;
  /** Also fetches each issue's comments, which `gh` otherwise leaves out. */
  withComments?: boolean;
};

const issueListSchema = z.array(
  z.object({
    number: z.number(),
    title: z.string(),
    state: z.enum(["OPEN", "CLOSED"]),
    body: z.string().default(""),
    labels: z.array(restLabelSchema),
    comments: z
      .array(
        z.object({
          authorAssociation: z.string().default(""),
          body: z.string().default(""),
        }),
      )
      .default([]),
  }),
);

const issueViewSchema = z.object({
  number: z.number(),
  state: z.string(),
  title: z.string(),
  body: z.string(),
});

/**
 * Reads and files issues with `gh issue`, authenticated with `MERIT_SCOUT_GH_TOKEN` when it is set
 * so scout and proposal runs can write issues where the default token cannot.
 */
export type GitHubIssueCliClient = ReturnType<typeof createGitHubIssueCliClient>;

export const createGitHubIssueCliClient = ({
  repoRoot,
  exec = createGhExec({ repoRoot, auth: "scout" }),
}: {
  repoRoot: string;
  exec?: GhExec;
}) => ({
  /** Lists up to `ISSUE_LIST_LIMIT` issues in `state`, optionally only those carrying `label`. */
  listIssues: ({ state, label, withComments = false }: IssueListQuery): IssueListItem[] => {
    const fields = ["number", "title", "state", "labels", "body"];
    if (withComments) {
      fields.push("comments");
    }
    const raw = exec([
      "issue",
      "list",
      "--state",
      state,
      ...(label ? ["--label", label] : []),
      "--limit",
      String(ISSUE_LIST_LIMIT),
      "--json",
      fields.join(","),
    ]);
    return issueListSchema.parse(JSON.parse(raw)).map((issue) => ({
      ...issue,
      labels: labelNames(issue.labels),
    }));
  },

  viewIssue: (number: number) =>
    issueViewSchema.parse(
      JSON.parse(exec(["issue", "view", String(number), "--json", "number,state,title,body"])),
    ),

  editIssueBody: (number: number, body: string) => {
    exec(["issue", "edit", String(number), "--body", body]);
  },

  /** Files an issue and returns its URL. */
  createIssue: ({
    title,
    body,
    labels,
  }: {
    title: string;
    body: string;
    labels: readonly string[];
  }): string =>
    exec([
      "issue",
      "create",
      "--title",
      title,
      "--body",
      body,
      ...labels.flatMap((label) => ["--label", label]),
    ]).trim(),
});
