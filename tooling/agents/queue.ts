import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import { readFlagValue, readIntegerFlag } from "../cli.ts";
import {
  extractLinkedIssueNumbers,
  TRUSTED_AUTHOR_ASSOCIATIONS,
  type IssueCommentRecord,
} from "../verification/agent-policy.ts";
import { DESIGN_PROPOSAL_LABEL } from "./proposal.ts";

export const MAX_OPEN_AGENT_PRS = 2;
export const MAX_SHEPHERD_ROUNDS = 2;
export const CLAIM_TTL_MS = 2 * 60 * 60 * 1000;
export const ADDRESSED_THREAD_MARKER = "<!-- merit-addressed -->";

const CLAIM_MARKER_PATTERN = /<!--\s*merit-claim:\s*(\{[\s\S]*?\})\s*-->/;
const AGENT_PR_MARKER_PATTERN = /<!--\s*merit-agent:\s*(\{[\s\S]*?\})\s*-->/;

export const claimMarkerSchema = z.object({
  runId: z.string().min(1),
  claimedAt: z.string().min(10),
  expiresAt: z.string().min(10),
});

export type ClaimMarker = z.infer<typeof claimMarkerSchema>;

export const agentPrStateSchema = z.object({
  issueNumber: z.number().int().positive().optional(),
  shepherdRounds: z.number().int().min(0).default(0),
  lastHeadSha: z.string().min(7).optional(),
  flakeReruns: z.number().int().min(0).default(0),
});

export type AgentPrState = z.infer<typeof agentPrStateSchema>;

export type PrCheckStatus = {
  name: string;
  status: string;
  conclusion: string | null;
};

export type RawStatusCheckEntry = {
  name?: string;
  context?: string;
  status?: string;
  state?: string;
  conclusion?: string | null;
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

export type ReviewThreadSummary = {
  id: string;
  path: string;
  line: number | null;
  author: string;
  body: string;
};

export type FailedVerifyRun = {
  databaseId: number;
  attempt: number;
};

export type OpenAgentPr = {
  number: number;
  title: string;
  body: string;
  headRefName: string;
  headSha: string;
  isDraft: boolean;
  stateInitialized?: boolean;
  createdAt?: string;
  updatedAt?: string;
  labels: string[];
  checks: PrCheckStatus[];
  unresolvedThreads: ReviewThreadSummary[];
  state: AgentPrState;
  failedVerifyRun?: FailedVerifyRun | null;
};

export type ReadyIssueCandidate = {
  number: number;
  title: string;
  labels: string[];
  comments: IssueCommentRecord[];
};

export type RepoIdentity = {
  owner: string;
  name: string;
};

export type QueueWorkOrder =
  | {
      kind: "rerun_flake";
      prNumber: number;
      runId: number;
      headRefName: string;
      headSha: string;
      failedChecks: string[];
      state: AgentPrState;
    }
  | {
      kind: "escalate";
      prNumber: number;
      headRefName: string;
      reason: string;
      failedChecks: string[];
      unresolvedThreadCount: number;
    }
  | {
      kind: "shepherd";
      prNumber: number;
      headRefName: string;
      headSha: string;
      issueNumber: number | null;
      nextRound: number;
      failedChecks: string[];
      unresolvedThreads: ReviewThreadSummary[];
    }
  | {
      kind: "implement";
      issueNumber: number;
      title: string;
      branchSuggestion: string;
    }
  | {
      kind: "idle";
      reason: "wip_limit_reached" | "no_work" | "waiting_for_checks";
      openAgentPrCount: number;
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

export const parseClaimMarker = (commentBody: string): ClaimMarker | null => {
  const match = CLAIM_MARKER_PATTERN.exec(commentBody);
  if (!match?.[1]) {
    return null;
  }
  try {
    return claimMarkerSchema.parse(JSON.parse(match[1]));
  } catch {
    return null;
  }
};

export const formatClaimComment = (claim: ClaimMarker): string =>
  `Claimed for autonomous implementation until ${claim.expiresAt}.\n\n<!-- merit-claim: ${JSON.stringify(claim)} -->`;

export const formatAddressedReplyBody = (summary: string): string => {
  const trimmed = summary.trim();
  if (trimmed.includes(ADDRESSED_THREAD_MARKER)) {
    return trimmed;
  }
  return `${trimmed}\n\n${ADDRESSED_THREAD_MARKER}`;
};

/** Returns the runId of the earliest active claim from a trusted repo author, clamping TTL to `claimedAt + CLAIM_TTL_MS`. */
export const findEarliestActiveClaimRunId = (
  comments: readonly IssueCommentRecord[],
  nowMs: number,
): string | null => {
  const latestExpiryByRunId = new Map<string, number>();
  for (const comment of comments) {
    if (!TRUSTED_AUTHOR_ASSOCIATIONS.has(comment.authorAssociation)) {
      continue;
    }
    const marker = parseClaimMarker(comment.body);
    if (!marker) {
      continue;
    }
    const claimedMs = Date.parse(marker.claimedAt);
    const expiresMs = Date.parse(marker.expiresAt);
    if (Number.isNaN(claimedMs) || Number.isNaN(expiresMs)) {
      continue;
    }
    const clampedExpiryMs = Math.min(expiresMs, claimedMs + CLAIM_TTL_MS);
    const previous = latestExpiryByRunId.get(marker.runId) ?? 0;
    if (clampedExpiryMs > previous) {
      latestExpiryByRunId.set(marker.runId, clampedExpiryMs);
    }
  }
  for (const [runId, expiryMs] of latestExpiryByRunId) {
    if (expiryMs > nowMs) {
      return runId;
    }
  }
  return null;
};

/** Checks for an active claim from a trusted repo author, clamping TTL to `claimedAt + CLAIM_TTL_MS`. */
export const hasActiveClaim = (comments: readonly IssueCommentRecord[], nowMs: number): boolean =>
  findEarliestActiveClaimRunId(comments, nowMs) !== null;

/** Returns true when a draft or uninitialized `agent:pr` has been stranded longer than `CLAIM_TTL_MS`. */
export const isStaleDraftPr = (pr: OpenAgentPr, nowMs: number): boolean => {
  const pendingInit = pr.isDraft || pr.stateInitialized === false;
  if (!pendingInit || pr.labels.includes("agent:needs-human")) {
    return false;
  }
  const referenceTimestamp = pr.isDraft ? pr.updatedAt : (pr.createdAt ?? pr.updatedAt);
  if (!referenceTimestamp) {
    return false;
  }
  const referenceMs = Date.parse(referenceTimestamp);
  return Number.isFinite(referenceMs) && nowMs - referenceMs >= CLAIM_TTL_MS;
};

/** Returns true when a PR has at least one valid `merit-agent` state comment from a trusted writer. */
export const hasAgentPrState = (comments: readonly IssueCommentRecord[]): boolean => {
  for (const comment of comments) {
    if (!TRUSTED_AUTHOR_ASSOCIATIONS.has(comment.authorAssociation)) {
      continue;
    }
    const match = AGENT_PR_MARKER_PATTERN.exec(comment.body);
    if (!match?.[1]) {
      continue;
    }
    try {
      agentPrStateSchema.parse(JSON.parse(match[1]));
      return true;
    } catch {
      continue;
    }
  }
  return false;
};

/** Parses the latest agent state comment authored by a trusted repository writer. */
export const parseAgentPrState = (comments: readonly IssueCommentRecord[]): AgentPrState => {
  let latest: AgentPrState = { shepherdRounds: 0, flakeReruns: 0 };
  for (const comment of comments) {
    if (!TRUSTED_AUTHOR_ASSOCIATIONS.has(comment.authorAssociation)) {
      continue;
    }
    const match = AGENT_PR_MARKER_PATTERN.exec(comment.body);
    if (!match?.[1]) {
      continue;
    }
    try {
      latest = agentPrStateSchema.parse(JSON.parse(match[1]));
    } catch {
      continue;
    }
  }
  return latest;
};

export const mergeAgentPrState = (
  previous: AgentPrState,
  updates: Partial<AgentPrState>,
): AgentPrState =>
  agentPrStateSchema.parse({
    ...previous,
    ...updates,
    shepherdRounds: Math.max(
      previous.shepherdRounds,
      updates.shepherdRounds ?? previous.shepherdRounds,
    ),
  });

export const formatAgentPrStateComment = (state: AgentPrState): string =>
  `Agent status: shepherd rounds ${state.shepherdRounds}/${MAX_SHEPHERD_ROUNDS}.\n\n<!-- merit-agent: ${JSON.stringify(state)} -->`;

export const normalizeStatusCheckRollup = (
  rollup: readonly RawStatusCheckEntry[] | null | undefined,
): PrCheckStatus[] =>
  (rollup ?? []).map((check) => {
    const name = check.name ?? check.context ?? "unknown";
    if (check.status) {
      return {
        name,
        status: check.status.toUpperCase(),
        conclusion: check.conclusion ? check.conclusion.toUpperCase() : null,
      };
    }
    const normalizedState = check.state?.toUpperCase();
    const isPendingContext = normalizedState === "PENDING" || normalizedState === "EXPECTED";
    return {
      name,
      status: isPendingContext ? "IN_PROGRESS" : "COMPLETED",
      conclusion: isPendingContext
        ? null
        : (check.conclusion?.toUpperCase() ?? normalizedState ?? null),
    };
  });

/** Normalizes GitHub REST check-runs (keeping the latest rerun per name) and combined commit statuses. */
export const normalizeRestChecks = ({
  checkRuns,
  statuses,
}: {
  checkRuns: readonly RestCheckRun[];
  statuses: readonly RestCommitStatus[];
}): PrCheckStatus[] => {
  const latestByName = new Map<string, RestCheckRun>();
  for (const run of checkRuns) {
    const existing = latestByName.get(run.name);
    if (!existing || run.id > existing.id) {
      latestByName.set(run.name, run);
    }
  }
  const entries: RawStatusCheckEntry[] = [
    ...[...latestByName.values()].map((run) => ({
      name: run.name,
      status: run.status,
      conclusion: run.conclusion,
    })),
    ...statuses.map((status) => ({
      context: status.context,
      state: status.state,
    })),
  ];
  return normalizeStatusCheckRollup(entries);
};

/** Extracts PR inline review threads whose latest comment is not a trusted `<!-- merit-addressed -->` reply. */
export const extractUnaddressedReviewThreads = (
  comments: readonly RestPullReviewComment[],
): ReviewThreadSummary[] => {
  const threadsByRootId = new Map<number, RestPullReviewComment[]>();
  const sorted = [...comments].sort((a, b) => a.id - b.id);
  for (const comment of sorted) {
    const rootId = comment.in_reply_to_id ?? comment.id;
    const thread = threadsByRootId.get(rootId) ?? [];
    thread.push(comment);
    threadsByRootId.set(rootId, thread);
  }

  const unaddressed: ReviewThreadSummary[] = [];
  for (const thread of threadsByRootId.values()) {
    const root = thread[0];
    if (!root) {
      continue;
    }
    let lastAddressedIndex = -1;
    for (let index = 0; index < thread.length; index += 1) {
      const comment = thread[index];
      if (
        comment &&
        TRUSTED_AUTHOR_ASSOCIATIONS.has(comment.author_association) &&
        comment.body.includes(ADDRESSED_THREAD_MARKER)
      ) {
        lastAddressedIndex = index;
      }
    }
    if (lastAddressedIndex === thread.length - 1) {
      continue;
    }
    const followUps = lastAddressedIndex >= 0 ? thread.slice(lastAddressedIndex + 1) : [];
    const body =
      followUps.length > 0
        ? [
            root.body,
            ...followUps.map(
              (comment) => `Follow-up (${comment.user?.login ?? "unknown"}): ${comment.body}`,
            ),
          ].join("\n\n---\n\n")
        : root.body;
    unaddressed.push({
      id: String(root.id),
      path: root.path,
      line: root.line ?? root.original_line ?? null,
      author: root.user?.login ?? "unknown",
      body,
    });
  }
  return unaddressed;
};

const isPassingConclusion = (conclusion: string | null) =>
  conclusion === "SUCCESS" || conclusion === "SKIPPED" || conclusion === "NEUTRAL";

export const inspectPrChecks = (checks: readonly PrCheckStatus[]) => {
  const verifyCheck = checks.find((check) => check.name === "verify");
  const hasPending =
    checks.length === 0 ||
    !verifyCheck ||
    verifyCheck.status !== "COMPLETED" ||
    checks.some((check) => check.status !== "COMPLETED");
  const failedChecks = checks
    .filter((check) => check.status === "COMPLETED" && !isPassingConclusion(check.conclusion))
    .map((check) => check.name);
  const nonAggregatorFailures = failedChecks.filter((name) => name !== "verify");
  const onlyBrowserFailures =
    nonAggregatorFailures.length > 0 &&
    nonAggregatorFailures.every((name) => name.startsWith("browser-"));

  return { hasPending, failedChecks, onlyBrowserFailures };
};

export const selectNextWork = ({
  openAgentPrs,
  readyIssues,
  nowMs = Date.now(),
}: {
  openAgentPrs: readonly OpenAgentPr[];
  readyIssues: readonly ReadyIssueCandidate[];
  nowMs?: number;
}): QueueWorkOrder => {
  const sortedPrs = [...openAgentPrs].sort((a, b) => a.number - b.number);
  let waitingForChecks = false;

  for (const pr of sortedPrs) {
    if (pr.labels.includes("agent:needs-human")) {
      continue;
    }
    if (pr.isDraft || pr.stateInitialized === false) {
      if (isStaleDraftPr(pr, nowMs)) {
        return {
          kind: "escalate",
          prNumber: pr.number,
          headRefName: pr.headRefName,
          reason: pr.isDraft
            ? "Draft agent PR was not marked ready within 2 hours; needs human check or cleanup."
            : "Agent PR was not initialized with initial state within 2 hours; needs human check or cleanup.",
          failedChecks: [],
          unresolvedThreadCount: 0,
        };
      }
      continue;
    }
    const { hasPending, failedChecks, onlyBrowserFailures } = inspectPrChecks(pr.checks);
    if (hasPending) {
      waitingForChecks = true;
      continue;
    }

    const canRerunFlake =
      onlyBrowserFailures &&
      pr.unresolvedThreads.length === 0 &&
      pr.state.flakeReruns < 1 &&
      pr.failedVerifyRun != null &&
      pr.failedVerifyRun.attempt <= 1;

    if (canRerunFlake && pr.failedVerifyRun) {
      return {
        kind: "rerun_flake",
        prNumber: pr.number,
        runId: pr.failedVerifyRun.databaseId,
        headRefName: pr.headRefName,
        headSha: pr.headSha,
        failedChecks,
        state: pr.state,
      };
    }

    if (failedChecks.length === 0 && pr.unresolvedThreads.length === 0) {
      continue;
    }

    if (pr.state.shepherdRounds >= MAX_SHEPHERD_ROUNDS) {
      return {
        kind: "escalate",
        prNumber: pr.number,
        headRefName: pr.headRefName,
        reason: `Reached max ${MAX_SHEPHERD_ROUNDS} shepherd rounds.`,
        failedChecks,
        unresolvedThreadCount: pr.unresolvedThreads.length,
      };
    }

    const linkedIssues = extractLinkedIssueNumbers(pr.body);
    return {
      kind: "shepherd",
      prNumber: pr.number,
      headRefName: pr.headRefName,
      headSha: pr.headSha,
      issueNumber: pr.state.issueNumber ?? linkedIssues[0] ?? null,
      nextRound: pr.state.shepherdRounds + 1,
      failedChecks,
      unresolvedThreads: pr.unresolvedThreads,
    };
  }

  if (sortedPrs.length >= MAX_OPEN_AGENT_PRS) {
    return {
      kind: "idle",
      reason: waitingForChecks ? "waiting_for_checks" : "wip_limit_reached",
      openAgentPrCount: sortedPrs.length,
    };
  }

  const linkedIssueNumbers = new Set<number>();
  for (const pr of sortedPrs) {
    if (pr.state.issueNumber) {
      linkedIssueNumbers.add(pr.state.issueNumber);
    }
    for (const num of extractLinkedIssueNumbers(pr.body)) {
      linkedIssueNumbers.add(num);
    }
  }

  const eligibleIssues = [...readyIssues]
    .sort((a, b) => a.number - b.number)
    .filter(
      (issue) =>
        !issue.labels.includes("agent:needs-human") &&
        !issue.labels.includes(DESIGN_PROPOSAL_LABEL) &&
        !linkedIssueNumbers.has(issue.number) &&
        !hasActiveClaim(issue.comments, nowMs),
    );

  const nextIssue = eligibleIssues[0];
  if (nextIssue) {
    return {
      kind: "implement",
      issueNumber: nextIssue.number,
      title: nextIssue.title,
      branchSuggestion: `claude/issue-${nextIssue.number}`,
    };
  }

  return {
    kind: "idle",
    reason: waitingForChecks ? "waiting_for_checks" : "no_work",
    openAgentPrCount: sortedPrs.length,
  };
};

const restLabelSchema = z.object({ name: z.string() });

const restCommentSchema = z.object({
  body: z.string().nullable().default(""),
  author_association: z.string().default(""),
});

const restIssueItemSchema = z.object({
  number: z.number(),
  state: z.string(),
  title: z.string(),
  body: z.string().nullable().default(""),
  labels: z.array(restLabelSchema),
  comments: z.number().default(0),
  pull_request: z.unknown().optional(),
});

const restPullDetailSchema = z.object({
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

const restCommitStatusSchema = z.object({
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

const restCreatedPrSchema = z.object({
  number: z.number(),
  html_url: z.string(),
  head: z.object({ ref: z.string() }),
});

const ghApiJson = (repoRoot: string, args: readonly string[]): unknown => {
  const raw = execFileSync("gh", ["api", ...args], { cwd: repoRoot, encoding: "utf8" });
  return raw.trim() ? JSON.parse(raw) : null;
};

const ghApiPaginatedArray = <T>(
  repoRoot: string,
  endpoint: string,
  itemSchema: z.ZodType<T>,
): T[] => {
  const pages = z
    .array(z.array(itemSchema))
    .parse(ghApiJson(repoRoot, ["--paginate", "--slurp", endpoint]));
  return pages.flat();
};

const getRepoIdentity = (repoRoot: string): RepoIdentity => {
  const envRepo = process.env.GITHUB_REPOSITORY;
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

const fetchIssueComments = (
  repoRoot: string,
  repo: RepoIdentity,
  number: number,
): IssueCommentRecord[] =>
  ghApiPaginatedArray(
    repoRoot,
    `repos/${repo.owner}/${repo.name}/issues/${number}/comments?per_page=100`,
    restCommentSchema,
  ).map((comment) => ({
    body: comment.body ?? "",
    authorAssociation: comment.author_association,
  }));

const fetchUnaddressedThreads = (
  repoRoot: string,
  repo: RepoIdentity,
  prNumber: number,
): ReviewThreadSummary[] => {
  const comments = ghApiPaginatedArray(
    repoRoot,
    `repos/${repo.owner}/${repo.name}/pulls/${prNumber}/comments?per_page=100`,
    restPullReviewCommentSchema,
  );
  return extractUnaddressedReviewThreads(comments);
};

const fetchCommitChecks = (
  repoRoot: string,
  repo: RepoIdentity,
  headSha: string,
): PrCheckStatus[] => {
  const checkPages = z
    .array(restCheckRunsPageSchema)
    .parse(
      ghApiJson(repoRoot, [
        "--paginate",
        "--slurp",
        `repos/${repo.owner}/${repo.name}/commits/${headSha}/check-runs?per_page=100`,
      ]),
    );
  const checkRuns = checkPages.flatMap((page) => page.check_runs);
  const statusPages = z
    .array(restCommitStatusSchema)
    .parse(
      ghApiJson(repoRoot, [
        "--paginate",
        "--slurp",
        `repos/${repo.owner}/${repo.name}/commits/${headSha}/status?per_page=100`,
      ]),
    );
  const statuses = statusPages.flatMap((page) => page.statuses);
  return normalizeRestChecks({ checkRuns, statuses });
};

const fetchLatestFailedVerifyRun = (
  repoRoot: string,
  repo: RepoIdentity,
  headSha: string,
): FailedVerifyRun | null => {
  const parsed = restWorkflowRunsSchema.parse(
    ghApiJson(repoRoot, [
      `repos/${repo.owner}/${repo.name}/actions/workflows/verify.yml/runs?head_sha=${encodeURIComponent(headSha)}&per_page=10`,
    ]),
  );
  const failedRun = parsed.workflow_runs.find((run) => run.conclusion === "failure");
  return failedRun ? { databaseId: failedRun.id, attempt: failedRun.run_attempt } : null;
};

const fetchOpenAgentPrs = (repoRoot: string, repo: RepoIdentity): OpenAgentPr[] => {
  const labeledItems = ghApiPaginatedArray(
    repoRoot,
    `repos/${repo.owner}/${repo.name}/issues?state=open&labels=agent:pr&per_page=100`,
    restIssueItemSchema,
  );
  const prItems = labeledItems.filter((item) => item.pull_request !== undefined);

  return prItems.map((item) => {
    const pr = restPullDetailSchema.parse(
      ghApiJson(repoRoot, [`repos/${repo.owner}/${repo.name}/pulls/${item.number}`]),
    );
    const comments = fetchIssueComments(repoRoot, repo, pr.number);
    const checks = fetchCommitChecks(repoRoot, repo, pr.head.sha);
    const { hasPending, onlyBrowserFailures } = inspectPrChecks(checks);
    const failedVerifyRun =
      !hasPending && onlyBrowserFailures
        ? fetchLatestFailedVerifyRun(repoRoot, repo, pr.head.sha)
        : null;
    return {
      number: pr.number,
      title: pr.title,
      body: pr.body ?? "",
      headRefName: pr.head.ref,
      headSha: pr.head.sha,
      isDraft: pr.draft,
      stateInitialized: hasAgentPrState(comments),
      createdAt: pr.created_at,
      updatedAt: pr.updated_at,
      labels: pr.labels.map((label) => label.name),
      checks,
      unresolvedThreads: fetchUnaddressedThreads(repoRoot, repo, pr.number),
      state: parseAgentPrState(comments),
      failedVerifyRun,
    };
  });
};

const fetchReadyIssues = (repoRoot: string, repo: RepoIdentity): ReadyIssueCandidate[] => {
  const items = ghApiPaginatedArray(
    repoRoot,
    `repos/${repo.owner}/${repo.name}/issues?state=open&labels=agent:ready&per_page=100`,
    restIssueItemSchema,
  );
  return items
    .filter((item) => item.pull_request === undefined)
    .map((item) => ({
      number: item.number,
      title: item.title,
      labels: item.labels.map((label) => label.name),
      comments: item.comments > 0 ? fetchIssueComments(repoRoot, repo, item.number) : [],
    }));
};

const postIssueComment = (repoRoot: string, repo: RepoIdentity, number: number, body: string) => {
  ghApiJson(repoRoot, [
    `repos/${repo.owner}/${repo.name}/issues/${number}/comments`,
    "-X",
    "POST",
    "-f",
    `body=${body}`,
  ]);
};

const addIssueLabels = (
  repoRoot: string,
  repo: RepoIdentity,
  number: number,
  labels: readonly string[],
) => {
  const labelArgs = labels.flatMap((label) => ["-f", `labels[]=${label}`]);
  ghApiJson(repoRoot, [
    `repos/${repo.owner}/${repo.name}/issues/${number}/labels`,
    "-X",
    "POST",
    ...labelArgs,
  ]);
};

const RECORD_SHEPHERD_USAGE =
  "Usage: queue.ts record-shepherd <pr-number> --round <n> [--sha <sha>] [--issue <n>] [--flake-reruns <n>] [--if-uninitialized]";

export type RecordShepherdOptions = {
  prNumber: number;
  round: number;
  sha?: string;
  issueNumber?: number;
  flakeReruns?: number;
  ifUninitialized: boolean;
};

/** Validates `record-shepherd` arguments before any GitHub call, so bad input records nothing. */
export const parseRecordShepherdArgs = (args: readonly string[]): RecordShepherdOptions => {
  const prNumber = Number(args[0]);
  const round = readIntegerFlag(args, "--round", 0);
  if (!/^[1-9]\d*$/.test(args[0] ?? "") || round === null) {
    throw new Error(RECORD_SHEPHERD_USAGE);
  }
  const sha = readFlagValue(args, "--sha");
  const issueNumber = readIntegerFlag(args, "--issue", 1);
  const flakeReruns = readIntegerFlag(args, "--flake-reruns", 0);
  return {
    prNumber,
    round,
    ...(sha !== null ? { sha } : {}),
    ...(issueNumber !== null ? { issueNumber } : {}),
    ...(flakeReruns !== null ? { flakeReruns } : {}),
    ifUninitialized: args.includes("--if-uninitialized"),
  };
};

const applyQueueOrder = (repoRoot: string, repo: RepoIdentity, order: QueueWorkOrder) => {
  if (order.kind === "escalate") {
    addIssueLabels(repoRoot, repo, order.prNumber, ["agent:needs-human"]);
    postIssueComment(repoRoot, repo, order.prNumber, `Escalating to human: ${order.reason}`);
    return;
  }
  if (order.kind === "rerun_flake") {
    ghApiJson(repoRoot, [
      `repos/${repo.owner}/${repo.name}/actions/runs/${order.runId}/rerun-failed-jobs`,
      "-X",
      "POST",
    ]);
    const nextState = mergeAgentPrState(order.state, {
      lastHeadSha: order.headSha,
      flakeReruns: order.state.flakeReruns + 1,
    });
    postIssueComment(repoRoot, repo, order.prNumber, formatAgentPrStateComment(nextState));
  }
};

const runCli = () => {
  const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
  const [command, ...rest] = process.argv.slice(2);
  const repo = getRepoIdentity(repoRoot);

  if (command === "next") {
    const apply = rest.includes("--apply");
    const order = selectNextWork({
      openAgentPrs: fetchOpenAgentPrs(repoRoot, repo),
      readyIssues: fetchReadyIssues(repoRoot, repo),
    });
    if (apply) {
      applyQueueOrder(repoRoot, repo, order);
    }
    console.log(JSON.stringify(order, null, 2));
    return;
  }

  if (command === "issue") {
    const issueNumber = Number.parseInt(rest[0] ?? "", 10);
    if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
      throw new Error("Usage: queue.ts issue <issue-number>");
    }
    const issue = restIssueItemSchema.parse(
      ghApiJson(repoRoot, [`repos/${repo.owner}/${repo.name}/issues/${issueNumber}`]),
    );
    const comments = issue.comments > 0 ? fetchIssueComments(repoRoot, repo, issueNumber) : [];
    console.log(
      JSON.stringify(
        {
          number: issue.number,
          state: issue.state.toUpperCase(),
          title: issue.title,
          body: issue.body ?? "",
          labels: issue.labels.map((label) => label.name),
          comments,
        },
        null,
        2,
      ),
    );
    return;
  }

  if (command === "claim") {
    const issueNumber = Number.parseInt(rest[0] ?? "", 10);
    const renewRunId = readFlagValue(rest, "--renew");
    if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
      throw new Error("Usage: queue.ts claim <issue-number> [--renew <runId>]");
    }
    const now = Date.now();
    const existingOwner = findEarliestActiveClaimRunId(
      fetchIssueComments(repoRoot, repo, issueNumber),
      now,
    );
    if (renewRunId !== null) {
      if (!renewRunId.trim()) {
        throw new Error("--renew requires a non-empty runId.");
      }
      if (existingOwner !== null && existingOwner !== renewRunId) {
        console.log(
          JSON.stringify({ status: "lost_race", issueNumber, winningRunId: existingOwner }),
        );
        return;
      }
    } else if (existingOwner !== null) {
      console.log(
        JSON.stringify({ status: "already_claimed", issueNumber, winningRunId: existingOwner }),
      );
      return;
    }

    const claim = claimMarkerSchema.parse({
      runId: renewRunId ?? randomUUID(),
      claimedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + CLAIM_TTL_MS).toISOString(),
    });
    postIssueComment(repoRoot, repo, issueNumber, formatClaimComment(claim));

    const winnerAfterWrite = findEarliestActiveClaimRunId(
      fetchIssueComments(repoRoot, repo, issueNumber),
      Date.now(),
    );
    if (winnerAfterWrite !== claim.runId) {
      console.log(
        JSON.stringify({ status: "lost_race", issueNumber, claim, winningRunId: winnerAfterWrite }),
      );
      return;
    }
    console.log(
      JSON.stringify({
        status: renewRunId !== null ? "renewed" : "claimed",
        issueNumber,
        claim,
      }),
    );
    return;
  }

  if (command === "open-pr") {
    const title = readFlagValue(rest, "--title");
    const head = readFlagValue(rest, "--head");
    const base = readFlagValue(rest, "--base") ?? "main";
    const bodyFile = readFlagValue(rest, "--body-file");
    const bodyInline = readFlagValue(rest, "--body");
    const body = bodyFile ? readFileSync(bodyFile, "utf8") : (bodyInline ?? "");
    if (!title || !head) {
      throw new Error(
        "Usage: queue.ts open-pr --title <title> --head <branch> [--base main] (--body-file <path> | --body <text>)",
      );
    }
    const existingPrs = z
      .array(restCreatedPrSchema)
      .parse(
        ghApiJson(repoRoot, [
          `repos/${repo.owner}/${repo.name}/pulls?state=open&head=${encodeURIComponent(`${repo.owner}:${head}`)}&base=${encodeURIComponent(base)}&per_page=10`,
        ]),
      );
    const pr =
      existingPrs[0] ??
      restCreatedPrSchema.parse(
        ghApiJson(repoRoot, [
          `repos/${repo.owner}/${repo.name}/pulls`,
          "-X",
          "POST",
          "-f",
          `title=${title}`,
          "-f",
          `head=${head}`,
          "-f",
          `base=${base}`,
          "-f",
          `body=${body}`,
        ]),
      );
    try {
      addIssueLabels(repoRoot, repo, pr.number, ["agent:pr"]);
    } catch (error) {
      console.error(
        JSON.stringify({
          status: "created_unlabeled",
          number: pr.number,
          url: pr.html_url,
          headRefName: pr.head.ref,
        }),
      );
      throw error;
    }
    console.log(
      JSON.stringify({
        status: existingPrs[0] ? "reused" : "created",
        number: pr.number,
        url: pr.html_url,
        headRefName: pr.head.ref,
      }),
    );
    return;
  }

  if (command === "escalate") {
    const targetNumber = Number.parseInt(rest[0] ?? "", 10);
    const reason = readFlagValue(rest, "--reason");
    if (!Number.isInteger(targetNumber) || targetNumber <= 0 || !reason?.trim()) {
      throw new Error("Usage: queue.ts escalate <issue-or-pr-number> --reason <text>");
    }
    addIssueLabels(repoRoot, repo, targetNumber, ["agent:needs-human"]);
    postIssueComment(repoRoot, repo, targetNumber, `Escalating to human: ${reason.trim()}`);
    console.log(JSON.stringify({ status: "escalated", number: targetNumber }));
    return;
  }

  if (command === "record-shepherd") {
    const { prNumber, ifUninitialized, ...updates } = parseRecordShepherdArgs(rest);
    const comments = fetchIssueComments(repoRoot, repo, prNumber);
    const previous = parseAgentPrState(comments);
    if (ifUninitialized && hasAgentPrState(comments)) {
      console.log(JSON.stringify({ status: "already_initialized", prNumber, state: previous }));
      return;
    }
    const state = mergeAgentPrState(previous, {
      shepherdRounds: updates.round,
      ...(updates.flakeReruns !== undefined ? { flakeReruns: updates.flakeReruns } : {}),
      ...(updates.sha ? { lastHeadSha: updates.sha } : {}),
      ...(updates.issueNumber !== undefined ? { issueNumber: updates.issueNumber } : {}),
    });
    postIssueComment(repoRoot, repo, prNumber, formatAgentPrStateComment(state));
    console.log(JSON.stringify({ status: "recorded", prNumber, state }));
    return;
  }

  if (command === "threads") {
    const prNumber = Number.parseInt(rest[0] ?? "", 10);
    if (!Number.isInteger(prNumber) || prNumber <= 0) {
      throw new Error("Usage: queue.ts threads <pr-number>");
    }
    console.log(JSON.stringify(fetchUnaddressedThreads(repoRoot, repo, prNumber), null, 2));
    return;
  }

  if (command === "reply-thread") {
    const prNumber = Number.parseInt(rest[0] ?? "", 10);
    const commentId = Number.parseInt(rest[1] ?? "", 10);
    const body = readFlagValue(rest, "--body");
    if (
      !Number.isInteger(prNumber) ||
      prNumber <= 0 ||
      !Number.isInteger(commentId) ||
      commentId <= 0 ||
      !body?.trim()
    ) {
      throw new Error("Usage: queue.ts reply-thread <pr-number> <comment-id> --body <summary>");
    }
    const replyBody = formatAddressedReplyBody(body);
    ghApiJson(repoRoot, [
      `repos/${repo.owner}/${repo.name}/pulls/${prNumber}/comments/${commentId}/replies`,
      "-X",
      "POST",
      "-f",
      `body=${replyBody}`,
    ]);
    console.log(JSON.stringify({ status: "replied", prNumber, commentId }));
    return;
  }

  throw new Error(
    `Unknown queue command "${command ?? ""}". Expected "next", "issue", "claim", "open-pr", "escalate", "record-shepherd", "threads", or "reply-thread".`,
  );
};

if (import.meta.main) {
  runCli();
}
