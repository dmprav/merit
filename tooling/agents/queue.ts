import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import { z } from "zod";

import { parseCliArgs, parseWholeNumber, stripLeadingSeparator } from "../cli.ts";
import { REPO_ROOT } from "../paths.ts";
import {
  AGENT_LABELS,
  extractLinkedIssueNumbers,
  TRUSTED_AUTHOR_ASSOCIATIONS,
  type IssueCommentRecord,
} from "../verification/agent-policy.ts";
import {
  createGitHubRestClient,
  type GitHubRestClient,
  type RestCheckRun,
  type RestCommitStatus,
  type RestPullReviewComment,
} from "./github.ts";

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
  /** Whether a trusted `merit-agent` state comment has been recorded on the PR. */
  stateInitialized: boolean;
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

/**
 * Yields each valid `pattern` marker, in comment order, from comments written by trusted repository
 * authors. Markers from other commenters, or whose JSON does not satisfy `schema`, are skipped.
 */
const trustedMarkers = function* <T extends z.ZodType>(
  comments: readonly IssueCommentRecord[],
  pattern: RegExp,
  schema: T,
): Generator<z.output<T>> {
  for (const comment of comments) {
    if (!TRUSTED_AUTHOR_ASSOCIATIONS.has(comment.authorAssociation)) {
      continue;
    }
    const raw = pattern.exec(comment.body)?.[1];
    if (!raw) {
      continue;
    }
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      continue;
    }
    const parsed = schema.safeParse(json);
    if (parsed.success) {
      yield parsed.data;
    }
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
  for (const marker of trustedMarkers(comments, CLAIM_MARKER_PATTERN, claimMarkerSchema)) {
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
  const pendingInit = pr.isDraft || !pr.stateInitialized;
  if (!pendingInit || pr.labels.includes(AGENT_LABELS.needsHuman)) {
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
export const hasAgentPrState = (comments: readonly IssueCommentRecord[]): boolean =>
  !trustedMarkers(comments, AGENT_PR_MARKER_PATTERN, agentPrStateSchema).next().done;

/** Parses the latest agent state comment authored by a trusted repository writer. */
export const parseAgentPrState = (comments: readonly IssueCommentRecord[]): AgentPrState =>
  [...trustedMarkers(comments, AGENT_PR_MARKER_PATTERN, agentPrStateSchema)].at(-1) ?? {
    shepherdRounds: 0,
    flakeReruns: 0,
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

/** Groups PR review comments into threads keyed by their root comment, each in comment order. */
const groupReviewThreads = (
  comments: readonly RestPullReviewComment[],
): RestPullReviewComment[][] => {
  const threadsByRootId = new Map<number, RestPullReviewComment[]>();
  for (const comment of [...comments].sort((a, b) => a.id - b.id)) {
    const rootId = comment.in_reply_to_id ?? comment.id;
    const thread = threadsByRootId.get(rootId) ?? [];
    thread.push(comment);
    threadsByRootId.set(rootId, thread);
  }
  return [...threadsByRootId.values()];
};

const isTrustedAddressedReply = (comment: RestPullReviewComment) =>
  TRUSTED_AUTHOR_ASSOCIATIONS.has(comment.author_association) &&
  comment.body.includes(ADDRESSED_THREAD_MARKER);

const reviewAuthor = (comment: RestPullReviewComment) => comment.user?.login ?? "unknown";

/**
 * Summarizes a thread whose latest comment is not a trusted addressed reply, or returns null.
 * Comments after the last addressed reply are appended to the root as follow-ups.
 */
const summarizeUnaddressedThread = (
  thread: readonly RestPullReviewComment[],
): ReviewThreadSummary | null => {
  const root = thread[0];
  if (!root) {
    return null;
  }
  const lastAddressedIndex = thread.findLastIndex(isTrustedAddressedReply);
  if (lastAddressedIndex === thread.length - 1) {
    return null;
  }
  const followUps = lastAddressedIndex >= 0 ? thread.slice(lastAddressedIndex + 1) : [];
  return {
    id: String(root.id),
    path: root.path,
    line: root.line ?? root.original_line ?? null,
    author: reviewAuthor(root),
    body: [
      root.body,
      ...followUps.map((comment) => `Follow-up (${reviewAuthor(comment)}): ${comment.body}`),
    ].join("\n\n---\n\n"),
  };
};

/** Extracts PR inline review threads whose latest comment is not a trusted `<!-- merit-addressed -->` reply. */
export const extractUnaddressedReviewThreads = (
  comments: readonly RestPullReviewComment[],
): ReviewThreadSummary[] =>
  groupReviewThreads(comments)
    .map(summarizeUnaddressedThread)
    .filter((summary) => summary !== null);

/** The aggregate CI check that must complete before the queue acts on a pull request. */
const VERIFY_CHECK_NAME = "verify";
/** Browser test jobs, whose failures alone may be flakes worth one automatic rerun. */
const BROWSER_CHECK_PREFIX = "browser-";
const ISSUE_BRANCH_PREFIX = "claude/issue-";
/** Automatic flake reruns the queue records for one pull request before it shepherds instead. */
const MAX_FLAKE_RERUNS = 1;
/** A verify run GitHub has already re-attempted is not rerun again as a flake. */
const MAX_RERUNNABLE_RUN_ATTEMPT = 1;
const CLAIM_TTL_HOURS = CLAIM_TTL_MS / (60 * 60 * 1000);

const isPassingConclusion = (conclusion: string | null) =>
  conclusion === "SUCCESS" || conclusion === "SKIPPED" || conclusion === "NEUTRAL";

export type PrCheckInspection = {
  /** No checks reported yet, verify is missing, or any check has not completed. */
  hasPending: boolean;
  failedChecks: string[];
  /** Every failure other than the verify aggregate is a browser job, and there is at least one. */
  onlyBrowserFailures: boolean;
};

export const inspectPrChecks = (checks: readonly PrCheckStatus[]): PrCheckInspection => {
  const verifyCheck = checks.find((check) => check.name === VERIFY_CHECK_NAME);
  const hasPending =
    checks.length === 0 ||
    !verifyCheck ||
    verifyCheck.status !== "COMPLETED" ||
    checks.some((check) => check.status !== "COMPLETED");
  const failedChecks = checks
    .filter((check) => check.status === "COMPLETED" && !isPassingConclusion(check.conclusion))
    .map((check) => check.name);
  const nonAggregatorFailures = failedChecks.filter((name) => name !== VERIFY_CHECK_NAME);
  const onlyBrowserFailures =
    nonAggregatorFailures.length > 0 &&
    nonAggregatorFailures.every((name) => name.startsWith(BROWSER_CHECK_PREFIX));

  return { hasPending, failedChecks, onlyBrowserFailures };
};

/** What one open agent PR needs: a work order, a wait for running checks, or nothing from the queue. */
export type PrTriage = QueueWorkOrder | "waiting" | "skip";

const escalateStrandedPr = (pr: OpenAgentPr): QueueWorkOrder => ({
  kind: "escalate",
  prNumber: pr.number,
  headRefName: pr.headRefName,
  reason: pr.isDraft
    ? `Draft agent PR was not marked ready within ${CLAIM_TTL_HOURS} hours; needs human check or cleanup.`
    : `Agent PR was not initialized with initial state within ${CLAIM_TTL_HOURS} hours; needs human check or cleanup.`,
  failedChecks: [],
  unresolvedThreadCount: 0,
});

/** Returns the failed verify run to rerun when browser-only failures may be a first-attempt flake. */
const rerunnableFlakeRun = (pr: OpenAgentPr): FailedVerifyRun | null => {
  const run = pr.failedVerifyRun;
  const rerunnable =
    run != null &&
    run.attempt <= MAX_RERUNNABLE_RUN_ATTEMPT &&
    pr.state.flakeReruns < MAX_FLAKE_RERUNS &&
    pr.unresolvedThreads.length === 0;
  return rerunnable ? run : null;
};

const shepherdOrder = (pr: OpenAgentPr, failedChecks: string[]): QueueWorkOrder => {
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
  return {
    kind: "shepherd",
    prNumber: pr.number,
    headRefName: pr.headRefName,
    headSha: pr.headSha,
    issueNumber: pr.state.issueNumber ?? extractLinkedIssueNumbers(pr.body)[0] ?? null,
    nextRound: pr.state.shepherdRounds + 1,
    failedChecks,
    unresolvedThreads: pr.unresolvedThreads,
  };
};

/**
 * Decides what one open agent PR needs. PRs handed to a human, fresh drafts or uninitialized PRs,
 * and green PRs without open threads need nothing; stranded ones escalate. Browser-only failures
 * get one flake rerun before other failures or open threads are shepherded.
 */
export const triagePr = (pr: OpenAgentPr, nowMs: number): PrTriage => {
  if (pr.labels.includes(AGENT_LABELS.needsHuman)) {
    return "skip";
  }
  if (pr.isDraft || !pr.stateInitialized) {
    return isStaleDraftPr(pr, nowMs) ? escalateStrandedPr(pr) : "skip";
  }
  const { hasPending, failedChecks, onlyBrowserFailures } = inspectPrChecks(pr.checks);
  if (hasPending) {
    return "waiting";
  }
  const flakeRun = onlyBrowserFailures ? rerunnableFlakeRun(pr) : null;
  if (flakeRun) {
    return {
      kind: "rerun_flake",
      prNumber: pr.number,
      runId: flakeRun.databaseId,
      headRefName: pr.headRefName,
      headSha: pr.headSha,
      failedChecks,
      state: pr.state,
    };
  }
  if (failedChecks.length === 0 && pr.unresolvedThreads.length === 0) {
    return "skip";
  }
  return shepherdOrder(pr, failedChecks);
};

const linkedIssueNumbers = (prs: readonly OpenAgentPr[]): Set<number> =>
  new Set(
    prs.flatMap((pr) => [
      ...(pr.state.issueNumber ? [pr.state.issueNumber] : []),
      ...extractLinkedIssueNumbers(pr.body),
    ]),
  );

/** Picks the lowest-numbered ready issue that no open agent PR covers and no active claim holds. */
export const pickNextIssue = (
  readyIssues: readonly ReadyIssueCandidate[],
  openAgentPrs: readonly OpenAgentPr[],
  nowMs: number,
): ReadyIssueCandidate | undefined => {
  const covered = linkedIssueNumbers(openAgentPrs);
  return readyIssues
    .toSorted((a, b) => a.number - b.number)
    .find(
      (issue) =>
        !issue.labels.includes(AGENT_LABELS.needsHuman) &&
        !issue.labels.includes(AGENT_LABELS.design) &&
        !covered.has(issue.number) &&
        !hasActiveClaim(issue.comments, nowMs),
    );
};

/** Chooses the queue's next action: the first PR needing work, else a new issue within the WIP cap. */
export const selectNextWork = ({
  openAgentPrs,
  readyIssues,
  nowMs = Date.now(),
}: {
  openAgentPrs: readonly OpenAgentPr[];
  readyIssues: readonly ReadyIssueCandidate[];
  nowMs?: number;
}): QueueWorkOrder => {
  const triages = openAgentPrs
    .toSorted((a, b) => a.number - b.number)
    .map((pr) => triagePr(pr, nowMs));
  const prOrder = triages.find((triage) => typeof triage === "object");
  if (prOrder) {
    return prOrder;
  }
  const openAgentPrCount = openAgentPrs.length;
  const waitingForChecks = triages.includes("waiting");
  if (openAgentPrCount >= MAX_OPEN_AGENT_PRS) {
    return {
      kind: "idle",
      reason: waitingForChecks ? "waiting_for_checks" : "wip_limit_reached",
      openAgentPrCount,
    };
  }
  const nextIssue = pickNextIssue(readyIssues, openAgentPrs, nowMs);
  if (nextIssue) {
    return {
      kind: "implement",
      issueNumber: nextIssue.number,
      title: nextIssue.title,
      branchSuggestion: `${ISSUE_BRANCH_PREFIX}${nextIssue.number}`,
    };
  }
  return {
    kind: "idle",
    reason: waitingForChecks ? "waiting_for_checks" : "no_work",
    openAgentPrCount,
  };
};

const fetchUnaddressedThreads = (client: GitHubRestClient, prNumber: number) =>
  extractUnaddressedReviewThreads(client.listReviewComments(prNumber));

const fetchCommitChecks = (client: GitHubRestClient, headSha: string): PrCheckStatus[] =>
  normalizeRestChecks(client.listCommitChecks(headSha));

const fetchLatestFailedVerifyRun = (
  client: GitHubRestClient,
  headSha: string,
): FailedVerifyRun | null => {
  const failedRun = client
    .listWorkflowRuns("verify.yml", headSha)
    .find((run) => run.conclusion === "failure");
  return failedRun ? { databaseId: failedRun.id, attempt: failedRun.attempt } : null;
};

const fetchOpenAgentPrs = (client: GitHubRestClient): OpenAgentPr[] =>
  client
    .listOpenIssues(AGENT_LABELS.pr)
    .filter((item) => item.isPullRequest)
    .map((item) => {
      const pr = client.getPull(item.number);
      const comments = client.listIssueComments(pr.number);
      const checks = fetchCommitChecks(client, pr.headSha);
      const { hasPending, onlyBrowserFailures } = inspectPrChecks(checks);
      const failedVerifyRun =
        !hasPending && onlyBrowserFailures ? fetchLatestFailedVerifyRun(client, pr.headSha) : null;
      return {
        number: pr.number,
        title: pr.title,
        body: pr.body,
        headRefName: pr.headRefName,
        headSha: pr.headSha,
        isDraft: pr.draft,
        stateInitialized: hasAgentPrState(comments),
        createdAt: pr.createdAt,
        updatedAt: pr.updatedAt,
        labels: pr.labels,
        checks,
        unresolvedThreads: fetchUnaddressedThreads(client, pr.number),
        state: parseAgentPrState(comments),
        failedVerifyRun,
      };
    });

const fetchReadyIssues = (client: GitHubRestClient): ReadyIssueCandidate[] =>
  client
    .listOpenIssues(AGENT_LABELS.ready)
    .filter((item) => !item.isPullRequest)
    .map((item) => ({
      number: item.number,
      title: item.title,
      labels: item.labels,
      comments: item.commentCount > 0 ? client.listIssueComments(item.number) : [],
    }));

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

/** Reads the command's single positional as a whole number, so "12abc" is an error rather than #12. */
const readNumberPositional = (positionals: readonly string[], name: string, usage: string) => {
  const [raw, ...extra] = positionals;
  if (raw === undefined || extra.length > 0) {
    throw new Error(usage);
  }
  return parseWholeNumber(raw, `<${name}>`);
};

/** Validates `record-shepherd` arguments before any GitHub call, so bad input records nothing. */
export const parseRecordShepherdArgs = (args: readonly string[]): RecordShepherdOptions => {
  const { values, positionals } = parseCliArgs(args, {
    options: {
      round: { type: "string" },
      sha: { type: "string" },
      issue: { type: "string" },
      "flake-reruns": { type: "string" },
      "if-uninitialized": { type: "boolean" },
    },
    usage: RECORD_SHEPHERD_USAGE,
    allowPositionals: true,
  });
  const prNumber = readNumberPositional(positionals, "pr-number", RECORD_SHEPHERD_USAGE);
  if (values.round === undefined) {
    throw new Error(RECORD_SHEPHERD_USAGE);
  }
  return {
    prNumber,
    round: parseWholeNumber(values.round, "--round", 0),
    ...(values.sha !== undefined ? { sha: values.sha } : {}),
    ...(values.issue !== undefined
      ? { issueNumber: parseWholeNumber(values.issue, "--issue") }
      : {}),
    ...(values["flake-reruns"] !== undefined
      ? { flakeReruns: parseWholeNumber(values["flake-reruns"], "--flake-reruns", 0) }
      : {}),
    ifUninitialized: values["if-uninitialized"] ?? false,
  };
};

type QueueCommandOptions = {
  next: { apply: boolean };
  issue: { issueNumber: number };
  claim: { issueNumber: number; renewRunId?: string };
  "open-pr": { title: string; head: string; base: string; bodyFile?: string; body: string };
  escalate: { targetNumber: number; reason: string };
  "record-shepherd": RecordShepherdOptions;
  threads: { prNumber: number };
  "reply-thread": { prNumber: number; commentId: number; body: string };
};

export type QueueCommandName = keyof QueueCommandOptions;

type QueueCommandOf<C extends QueueCommandName> = { command: C } & QueueCommandOptions[C];

export type QueueCommand = { [C in QueueCommandName]: QueueCommandOf<C> }[QueueCommandName];

const ISSUE_USAGE = "Usage: queue.ts issue <issue-number>";
const CLAIM_USAGE = "Usage: queue.ts claim <issue-number> [--renew <runId>]";
const OPEN_PR_USAGE =
  "Usage: queue.ts open-pr --title <title> --head <branch> [--base main] (--body-file <path> | --body <text>)";
const ESCALATE_USAGE = "Usage: queue.ts escalate <issue-or-pr-number> --reason <text>";
const THREADS_USAGE = "Usage: queue.ts threads <pr-number>";
const REPLY_THREAD_USAGE = "Usage: queue.ts reply-thread <pr-number> <comment-id> --body <summary>";

const parseClaimArgs = (args: readonly string[]): QueueCommand => {
  const { values, positionals } = parseCliArgs(args, {
    options: { renew: { type: "string" } },
    usage: CLAIM_USAGE,
    allowPositionals: true,
  });
  const issueNumber = readNumberPositional(positionals, "issue-number", CLAIM_USAGE);
  if (values.renew !== undefined && !values.renew.trim()) {
    throw new Error("--renew requires a non-empty runId.");
  }
  return {
    command: "claim",
    issueNumber,
    ...(values.renew !== undefined ? { renewRunId: values.renew } : {}),
  };
};

const parseOpenPrArgs = (args: readonly string[]): QueueCommand => {
  const { values } = parseCliArgs(args, {
    options: {
      title: { type: "string" },
      head: { type: "string" },
      base: { type: "string" },
      "body-file": { type: "string" },
      body: { type: "string" },
    },
    usage: OPEN_PR_USAGE,
  });
  if (!values.title || !values.head) {
    throw new Error(OPEN_PR_USAGE);
  }
  return {
    command: "open-pr",
    title: values.title,
    head: values.head,
    base: values.base ?? "main",
    ...(values["body-file"] ? { bodyFile: values["body-file"] } : {}),
    body: values.body ?? "",
  };
};

const parseEscalateArgs = (args: readonly string[]): QueueCommand => {
  const { values, positionals } = parseCliArgs(args, {
    options: { reason: { type: "string" } },
    usage: ESCALATE_USAGE,
    allowPositionals: true,
  });
  const targetNumber = readNumberPositional(positionals, "issue-or-pr-number", ESCALATE_USAGE);
  const reason = values.reason?.trim();
  if (!reason) {
    throw new Error(ESCALATE_USAGE);
  }
  return { command: "escalate", targetNumber, reason };
};

const parseReplyThreadArgs = (args: readonly string[]): QueueCommand => {
  const { values, positionals } = parseCliArgs(args, {
    options: { body: { type: "string" } },
    usage: REPLY_THREAD_USAGE,
    allowPositionals: true,
  });
  const [prRaw, commentRaw, ...extra] = positionals;
  if (prRaw === undefined || commentRaw === undefined || extra.length > 0 || !values.body?.trim()) {
    throw new Error(REPLY_THREAD_USAGE);
  }
  return {
    command: "reply-thread",
    prNumber: parseWholeNumber(prRaw, "<pr-number>"),
    commentId: parseWholeNumber(commentRaw, "<comment-id>"),
    body: values.body,
  };
};

/** Validates a queue command line before any GitHub call, so a typo acts on nothing. */
export const parseQueueArgs = (args: readonly string[]): QueueCommand => {
  const [command, ...rest] = stripLeadingSeparator(args);
  switch (command) {
    case "next": {
      const { values } = parseCliArgs(rest, {
        options: { apply: { type: "boolean" } },
        usage: "Usage: queue.ts next [--apply]",
      });
      return { command, apply: values.apply ?? false };
    }
    case "issue": {
      const { positionals } = parseCliArgs(rest, {
        options: {},
        usage: ISSUE_USAGE,
        allowPositionals: true,
      });
      return {
        command,
        issueNumber: readNumberPositional(positionals, "issue-number", ISSUE_USAGE),
      };
    }
    case "claim":
      return parseClaimArgs(rest);
    case "open-pr":
      return parseOpenPrArgs(rest);
    case "escalate":
      return parseEscalateArgs(rest);
    case "record-shepherd":
      return { command, ...parseRecordShepherdArgs(rest) };
    case "threads": {
      const { positionals } = parseCliArgs(rest, {
        options: {},
        usage: THREADS_USAGE,
        allowPositionals: true,
      });
      return { command, prNumber: readNumberPositional(positionals, "pr-number", THREADS_USAGE) };
    }
    case "reply-thread":
      return parseReplyThreadArgs(rest);
    default:
      throw new Error(
        `Unknown queue command "${command ?? ""}". Expected "next", "issue", "claim", "open-pr", "escalate", "record-shepherd", "threads", or "reply-thread".`,
      );
  }
};

/** The GitHub operations and side effects a queue command may use. */
export type QueueDeps = {
  client: GitHubRestClient;
  now: () => number;
  newRunId: () => string;
  readFile: (path: string) => string;
  /** Writes a diagnostic line to standard error. */
  warn: (line: string) => void;
};

export type ClaimOutcome =
  | { status: "claimed" | "renewed"; issueNumber: number; claim: ClaimMarker }
  | { status: "already_claimed"; issueNumber: number; winningRunId: string }
  | { status: "lost_race"; issueNumber: number; winningRunId: string }
  | { status: "lost_race"; issueNumber: number; claim: ClaimMarker; winningRunId: string | null };

/**
 * Claims an issue for this run, or renews `renewRunId`'s claim. GitHub cannot write a comment
 * conditionally, so the claim is posted and the comments re-read: when another run's earlier claim
 * is active after the write, this run lost the race and must not implement the issue.
 */
export const claimIssue = (
  client: Pick<GitHubRestClient, "listIssueComments" | "postIssueComment">,
  issueNumber: number,
  { renewRunId, now, newRunId }: { renewRunId?: string; now: () => number; newRunId: () => string },
): ClaimOutcome => {
  const claimedAt = now();
  const existingOwner = findEarliestActiveClaimRunId(
    client.listIssueComments(issueNumber),
    claimedAt,
  );
  if (existingOwner !== null && renewRunId === undefined) {
    return { status: "already_claimed", issueNumber, winningRunId: existingOwner };
  }
  if (existingOwner !== null && existingOwner !== renewRunId) {
    return { status: "lost_race", issueNumber, winningRunId: existingOwner };
  }

  const claim = claimMarkerSchema.parse({
    runId: renewRunId ?? newRunId(),
    claimedAt: new Date(claimedAt).toISOString(),
    expiresAt: new Date(claimedAt + CLAIM_TTL_MS).toISOString(),
  });
  client.postIssueComment(issueNumber, formatClaimComment(claim));

  const winnerAfterWrite = findEarliestActiveClaimRunId(
    client.listIssueComments(issueNumber),
    now(),
  );
  if (winnerAfterWrite !== claim.runId) {
    return { status: "lost_race", issueNumber, claim, winningRunId: winnerAfterWrite };
  }
  return { status: renewRunId !== undefined ? "renewed" : "claimed", issueNumber, claim };
};

export type OpenPrOutcome = {
  status: "reused" | "created";
  number: number;
  url: string;
  headRefName: string;
};

/**
 * Reuses the open pull request from `head` into `base`, or creates one, then labels it `agent:pr`.
 * A pull request left unlabeled is reported through `warn` before the labeling error is rethrown,
 * because the queue would otherwise never see it.
 */
export const openAgentPr = (
  client: Pick<GitHubRestClient, "findOpenPull" | "createPull" | "addLabels">,
  pull: { title: string; head: string; base: string; body: string },
  warn: (line: string) => void,
): OpenPrOutcome => {
  const existingPr = client.findOpenPull(pull);
  const pr = existingPr ?? client.createPull(pull);
  try {
    client.addLabels(pr.number, [AGENT_LABELS.pr]);
  } catch (error) {
    warn(
      JSON.stringify({
        status: "created_unlabeled",
        number: pr.number,
        url: pr.url,
        headRefName: pr.headRefName,
      }),
    );
    throw error;
  }
  return {
    status: existingPr ? "reused" : "created",
    number: pr.number,
    url: pr.url,
    headRefName: pr.headRefName,
  };
};

const escalate = (client: GitHubRestClient, number: number, reason: string) => {
  client.addLabels(number, [AGENT_LABELS.needsHuman]);
  client.postIssueComment(number, `Escalating to human: ${reason}`);
};

const applyQueueOrder = (client: GitHubRestClient, order: QueueWorkOrder) => {
  if (order.kind === "escalate") {
    escalate(client, order.prNumber, order.reason);
    return;
  }
  if (order.kind === "rerun_flake") {
    client.rerunFailedJobs(order.runId);
    const nextState = mergeAgentPrState(order.state, {
      lastHeadSha: order.headSha,
      flakeReruns: order.state.flakeReruns + 1,
    });
    client.postIssueComment(order.prNumber, formatAgentPrStateComment(nextState));
  }
};

const readIssue = (client: GitHubRestClient, issueNumber: number) => {
  const issue = client.getIssue(issueNumber);
  return {
    number: issue.number,
    state: issue.state.toUpperCase(),
    title: issue.title,
    body: issue.body,
    labels: issue.labels,
    comments: issue.commentCount > 0 ? client.listIssueComments(issueNumber) : [],
  };
};

const recordShepherd = (
  client: GitHubRestClient,
  { prNumber, ifUninitialized, round, sha, issueNumber, flakeReruns }: RecordShepherdOptions,
) => {
  const comments = client.listIssueComments(prNumber);
  const previous = parseAgentPrState(comments);
  if (ifUninitialized && hasAgentPrState(comments)) {
    return { status: "already_initialized", prNumber, state: previous };
  }
  const state = mergeAgentPrState(previous, {
    shepherdRounds: round,
    ...(flakeReruns !== undefined ? { flakeReruns } : {}),
    ...(sha ? { lastHeadSha: sha } : {}),
    ...(issueNumber !== undefined ? { issueNumber } : {}),
  });
  client.postIssueComment(prNumber, formatAgentPrStateComment(state));
  return { status: "recorded", prNumber, state };
};

type QueueCommandHandler<C extends QueueCommandName> = {
  /** Prints the result as indented JSON for agents to read, rather than one line for logs. */
  pretty?: true;
  run: (command: QueueCommandOf<C>, deps: QueueDeps) => unknown;
};

const QUEUE_COMMANDS: { [C in QueueCommandName]: QueueCommandHandler<C> } = {
  next: {
    pretty: true,
    run: ({ apply }, { client, now }) => {
      const order = selectNextWork({
        openAgentPrs: fetchOpenAgentPrs(client),
        readyIssues: fetchReadyIssues(client),
        nowMs: now(),
      });
      if (apply) {
        applyQueueOrder(client, order);
      }
      return order;
    },
  },
  issue: { pretty: true, run: ({ issueNumber }, { client }) => readIssue(client, issueNumber) },
  claim: {
    run: ({ issueNumber, renewRunId }, { client, now, newRunId }) =>
      claimIssue(client, issueNumber, {
        ...(renewRunId !== undefined ? { renewRunId } : {}),
        now,
        newRunId,
      }),
  },
  "open-pr": {
    run: ({ title, head, base, bodyFile, body }, { client, readFile, warn }) =>
      openAgentPr(client, { title, head, base, body: bodyFile ? readFile(bodyFile) : body }, warn),
  },
  escalate: {
    run: ({ targetNumber, reason }, { client }) => {
      escalate(client, targetNumber, reason);
      return { status: "escalated", number: targetNumber };
    },
  },
  "record-shepherd": { run: (options, { client }) => recordShepherd(client, options) },
  threads: {
    pretty: true,
    run: ({ prNumber }, { client }) => fetchUnaddressedThreads(client, prNumber),
  },
  "reply-thread": {
    run: ({ prNumber, commentId, body }, { client }) => {
      client.replyToReviewComment(prNumber, commentId, formatAddressedReplyBody(body));
      return { status: "replied", prNumber, commentId };
    },
  },
};

/** Runs a parsed queue command and returns the JSON line or document it prints. */
export const runQueueCommand = <C extends QueueCommandName>(
  command: QueueCommandOf<C>,
  deps: QueueDeps,
): string => {
  const handler: QueueCommandHandler<C> = QUEUE_COMMANDS[command.command];
  const result = handler.run(command, deps);
  return handler.pretty ? JSON.stringify(result, null, 2) : JSON.stringify(result);
};

const runCli = () => {
  const command = parseQueueArgs(process.argv.slice(2));
  const output = runQueueCommand(command, {
    client: createGitHubRestClient({ repoRoot: REPO_ROOT }),
    now: Date.now,
    newRunId: randomUUID,
    readFile: (path) => readFileSync(path, "utf8"),
    warn: console.error,
  });
  console.log(output);
};

if (import.meta.main) {
  runCli();
}
