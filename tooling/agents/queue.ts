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
    if (pr.labels.includes(AGENT_LABELS.needsHuman)) {
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
        !issue.labels.includes(AGENT_LABELS.needsHuman) &&
        !issue.labels.includes(AGENT_LABELS.design) &&
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

export type QueueCommand =
  | { command: "next"; apply: boolean }
  | { command: "issue"; issueNumber: number }
  | { command: "claim"; issueNumber: number; renewRunId?: string }
  | {
      command: "open-pr";
      title: string;
      head: string;
      base: string;
      bodyFile?: string;
      body: string;
    }
  | { command: "escalate"; targetNumber: number; reason: string }
  | ({ command: "record-shepherd" } & RecordShepherdOptions)
  | { command: "threads"; prNumber: number }
  | { command: "reply-thread"; prNumber: number; commentId: number; body: string };

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

const applyQueueOrder = (client: GitHubRestClient, order: QueueWorkOrder) => {
  if (order.kind === "escalate") {
    client.addLabels(order.prNumber, [AGENT_LABELS.needsHuman]);
    client.postIssueComment(order.prNumber, `Escalating to human: ${order.reason}`);
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

const runCli = () => {
  const parsed = parseQueueArgs(process.argv.slice(2));
  const client = createGitHubRestClient({ repoRoot: REPO_ROOT });

  if (parsed.command === "next") {
    const order = selectNextWork({
      openAgentPrs: fetchOpenAgentPrs(client),
      readyIssues: fetchReadyIssues(client),
    });
    if (parsed.apply) {
      applyQueueOrder(client, order);
    }
    console.log(JSON.stringify(order, null, 2));
    return;
  }

  if (parsed.command === "issue") {
    const { issueNumber } = parsed;
    const issue = client.getIssue(issueNumber);
    const comments = issue.commentCount > 0 ? client.listIssueComments(issueNumber) : [];
    console.log(
      JSON.stringify(
        {
          number: issue.number,
          state: issue.state.toUpperCase(),
          title: issue.title,
          body: issue.body,
          labels: issue.labels,
          comments,
        },
        null,
        2,
      ),
    );
    return;
  }

  if (parsed.command === "claim") {
    const { issueNumber, renewRunId } = parsed;
    const now = Date.now();
    const existingOwner = findEarliestActiveClaimRunId(client.listIssueComments(issueNumber), now);
    if (renewRunId !== undefined) {
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
    client.postIssueComment(issueNumber, formatClaimComment(claim));

    const winnerAfterWrite = findEarliestActiveClaimRunId(
      client.listIssueComments(issueNumber),
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
        status: renewRunId !== undefined ? "renewed" : "claimed",
        issueNumber,
        claim,
      }),
    );
    return;
  }

  if (parsed.command === "open-pr") {
    const { title, head, base } = parsed;
    const body = parsed.bodyFile ? readFileSync(parsed.bodyFile, "utf8") : parsed.body;
    const existingPr = client.findOpenPull({ head, base });
    const pr = existingPr ?? client.createPull({ title, head, base, body });
    try {
      client.addLabels(pr.number, [AGENT_LABELS.pr]);
    } catch (error) {
      console.error(
        JSON.stringify({
          status: "created_unlabeled",
          number: pr.number,
          url: pr.url,
          headRefName: pr.headRefName,
        }),
      );
      throw error;
    }
    console.log(
      JSON.stringify({
        status: existingPr ? "reused" : "created",
        number: pr.number,
        url: pr.url,
        headRefName: pr.headRefName,
      }),
    );
    return;
  }

  if (parsed.command === "escalate") {
    const { targetNumber, reason } = parsed;
    client.addLabels(targetNumber, [AGENT_LABELS.needsHuman]);
    client.postIssueComment(targetNumber, `Escalating to human: ${reason}`);
    console.log(JSON.stringify({ status: "escalated", number: targetNumber }));
    return;
  }

  if (parsed.command === "record-shepherd") {
    const { prNumber, ifUninitialized, ...updates } = parsed;
    const comments = client.listIssueComments(prNumber);
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
    client.postIssueComment(prNumber, formatAgentPrStateComment(state));
    console.log(JSON.stringify({ status: "recorded", prNumber, state }));
    return;
  }

  if (parsed.command === "threads") {
    console.log(JSON.stringify(fetchUnaddressedThreads(client, parsed.prNumber), null, 2));
    return;
  }

  const { prNumber, commentId, body } = parsed;
  client.replyToReviewComment(prNumber, commentId, formatAddressedReplyBody(body));
  console.log(JSON.stringify({ status: "replied", prNumber, commentId }));
};

if (import.meta.main) {
  runCli();
}
