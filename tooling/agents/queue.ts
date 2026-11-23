import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import {
  extractLinkedIssueNumbers,
  TRUSTED_AUTHOR_ASSOCIATIONS,
  type IssueCommentRecord,
} from "../verification/agent-policy.ts";

export const MAX_OPEN_AGENT_PRS = 2;
export const MAX_SHEPHERD_ROUNDS = 2;
export const CLAIM_TTL_MS = 2 * 60 * 60 * 1000;

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

/** Returns true when a draft `agent:pr` has been stranded longer than `CLAIM_TTL_MS`. */
export const isStaleDraftPr = (pr: OpenAgentPr, nowMs: number): boolean => {
  if (!pr.isDraft || pr.labels.includes("agent:needs-human") || !pr.updatedAt) {
    return false;
  }
  const updatedMs = Date.parse(pr.updatedAt);
  return Number.isFinite(updatedMs) && nowMs - updatedMs >= CLAIM_TTL_MS;
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
  });

export const formatAgentPrStateComment = (state: AgentPrState): string =>
  `Agent status: shepherd rounds ${state.shepherdRounds}/${MAX_SHEPHERD_ROUNDS}.\n\n<!-- merit-agent: ${JSON.stringify(state)} -->`;

export const normalizeStatusCheckRollup = (
  rollup: readonly RawStatusCheckEntry[] | null | undefined,
): PrCheckStatus[] =>
  (rollup ?? []).map((check) => {
    const name = check.name ?? check.context ?? "unknown";
    if (check.status) {
      return { name, status: check.status, conclusion: check.conclusion ?? null };
    }
    const isPendingContext = check.state === "PENDING" || check.state === "EXPECTED";
    return {
      name,
      status: isPendingContext ? "IN_PROGRESS" : "COMPLETED",
      conclusion: isPendingContext ? null : (check.conclusion ?? check.state ?? null),
    };
  });

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
    if (pr.isDraft) {
      if (isStaleDraftPr(pr, nowMs)) {
        return {
          kind: "escalate",
          prNumber: pr.number,
          headRefName: pr.headRefName,
          reason:
            "Draft agent PR was not marked ready within 2 hours; needs human check or cleanup.",
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

const ghRepoSchema = z.object({
  owner: z.object({ login: z.string() }),
  name: z.string(),
});

const ghCommentSchema = z.object({
  body: z.string(),
  authorAssociation: z.string().default(""),
});

const ghPrListSchema = z.array(
  z.object({
    number: z.number(),
    title: z.string(),
    body: z.string(),
    headRefName: z.string(),
    headRefOid: z.string(),
    isDraft: z.boolean(),
    updatedAt: z.string(),
    labels: z.array(z.object({ name: z.string() })),
    comments: z.array(ghCommentSchema),
    statusCheckRollup: z
      .array(
        z.object({
          name: z.string().optional(),
          context: z.string().optional(),
          status: z.string().optional(),
          state: z.string().optional(),
          conclusion: z.string().nullable().optional(),
        }),
      )
      .nullable()
      .optional(),
  }),
);

const ghReadyIssuesSchema = z.array(
  z.object({
    number: z.number(),
    title: z.string(),
    labels: z.array(z.object({ name: z.string() })),
    comments: z.array(ghCommentSchema),
  }),
);

const ghRunsSchema = z.array(
  z.object({
    databaseId: z.number(),
    attempt: z.number().int().positive(),
    conclusion: z.string().nullable(),
  }),
);

const ghThreadsResponseSchema = z.object({
  data: z.object({
    repository: z.object({
      pullRequest: z.object({
        reviewThreads: z.object({
          pageInfo: z.object({
            hasNextPage: z.boolean(),
            endCursor: z.string().nullable(),
          }),
          nodes: z.array(
            z.object({
              id: z.string(),
              isResolved: z.boolean(),
              path: z.string(),
              line: z.number().nullable(),
              comments: z.object({
                nodes: z.array(
                  z.object({
                    author: z.object({ login: z.string() }).nullable(),
                    body: z.string(),
                  }),
                ),
              }),
            }),
          ),
        }),
      }),
    }),
  }),
});

type RepoIdentity = { owner: string; name: string };

const getRepoIdentity = (repoRoot: string): RepoIdentity => {
  const raw = execFileSync("gh", ["repo", "view", "--json", "owner,name"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  const parsed = ghRepoSchema.parse(JSON.parse(raw));
  return { owner: parsed.owner.login, name: parsed.name };
};

const fetchUnresolvedThreads = (
  repoRoot: string,
  repo: RepoIdentity,
  prNumber: number,
): ReviewThreadSummary[] => {
  const query = `query($owner: String!, $name: String!, $number: Int!, $after: String) {
    repository(owner: $owner, name: $name) {
      pullRequest(number: $number) {
        reviewThreads(first: 100, after: $after) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            id
            isResolved
            path
            line
            comments(first: 10) {
              nodes {
                author { login }
                body
              }
            }
          }
        }
      }
    }
  }`;

  const unresolved: ReviewThreadSummary[] = [];
  let cursor: string | null = null;

  for (;;) {
    const args = [
      "api",
      "graphql",
      "-f",
      `query=${query}`,
      "-F",
      `owner=${repo.owner}`,
      "-F",
      `name=${repo.name}`,
      "-F",
      `number=${prNumber}`,
    ];
    if (cursor) {
      args.push("-F", `after=${cursor}`);
    }
    const raw = execFileSync("gh", args, { cwd: repoRoot, encoding: "utf8" });
    const connection = ghThreadsResponseSchema.parse(JSON.parse(raw)).data.repository.pullRequest
      .reviewThreads;

    for (const thread of connection.nodes) {
      if (thread.isResolved) {
        continue;
      }
      const first = thread.comments.nodes[0];
      unresolved.push({
        id: thread.id,
        path: thread.path,
        line: thread.line,
        author: first?.author?.login ?? "unknown",
        body: first?.body ?? "",
      });
    }

    if (!connection.pageInfo.hasNextPage || !connection.pageInfo.endCursor) {
      break;
    }
    cursor = connection.pageInfo.endCursor;
  }

  return unresolved;
};

const resolveReviewThread = (repoRoot: string, threadId: string) => {
  const mutation = `mutation($threadId: ID!) {
    resolveReviewThread(input: { threadId: $threadId }) {
      thread { id isResolved }
    }
  }`;
  return execFileSync(
    "gh",
    ["api", "graphql", "-f", `query=${mutation}`, "-F", `threadId=${threadId}`],
    { cwd: repoRoot, encoding: "utf8" },
  ).trim();
};

const fetchLatestFailedVerifyRun = (repoRoot: string, headSha: string): FailedVerifyRun | null => {
  const raw = execFileSync(
    "gh",
    [
      "run",
      "list",
      "--workflow",
      "verify.yml",
      "--commit",
      headSha,
      "--limit",
      "5",
      "--json",
      "databaseId,attempt,conclusion",
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );
  const failedRun = ghRunsSchema.parse(JSON.parse(raw)).find((run) => run.conclusion === "failure");
  return failedRun ? { databaseId: failedRun.databaseId, attempt: failedRun.attempt } : null;
};

const fetchOpenAgentPrs = (repoRoot: string, repo: RepoIdentity): OpenAgentPr[] => {
  const raw = execFileSync(
    "gh",
    [
      "pr",
      "list",
      "--state",
      "open",
      "--label",
      "agent:pr",
      "--limit",
      "50",
      "--json",
      "number,title,body,headRefName,headRefOid,isDraft,updatedAt,labels,comments,statusCheckRollup",
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );
  const prs = ghPrListSchema.parse(JSON.parse(raw));
  return prs.map((pr) => {
    const checks = normalizeStatusCheckRollup(pr.statusCheckRollup);
    const { hasPending, onlyBrowserFailures } = inspectPrChecks(checks);
    const failedVerifyRun =
      !hasPending && onlyBrowserFailures
        ? fetchLatestFailedVerifyRun(repoRoot, pr.headRefOid)
        : null;
    return {
      number: pr.number,
      title: pr.title,
      body: pr.body,
      headRefName: pr.headRefName,
      headSha: pr.headRefOid,
      isDraft: pr.isDraft,
      updatedAt: pr.updatedAt,
      labels: pr.labels.map((label) => label.name),
      checks,
      unresolvedThreads: fetchUnresolvedThreads(repoRoot, repo, pr.number),
      state: parseAgentPrState(pr.comments),
      failedVerifyRun,
    };
  });
};

const fetchReadyIssues = (repoRoot: string): ReadyIssueCandidate[] => {
  const raw = execFileSync(
    "gh",
    [
      "issue",
      "list",
      "--state",
      "open",
      "--label",
      "agent:ready",
      "--limit",
      "200",
      "--json",
      "number,title,labels,comments",
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );
  return ghReadyIssuesSchema.parse(JSON.parse(raw)).map((issue) => ({
    number: issue.number,
    title: issue.title,
    labels: issue.labels.map((label) => label.name),
    comments: issue.comments,
  }));
};

const fetchIssueComments = (repoRoot: string, issueNumber: number): IssueCommentRecord[] => {
  const raw = execFileSync("gh", ["issue", "view", String(issueNumber), "--json", "comments"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  const parsed = z.object({ comments: z.array(ghCommentSchema) }).parse(JSON.parse(raw));
  return parsed.comments;
};

const fetchCurrentAgentPrState = (repoRoot: string, prNumber: number): AgentPrState => {
  const raw = execFileSync("gh", ["pr", "view", String(prNumber), "--json", "comments"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  const parsed = z.object({ comments: z.array(ghCommentSchema) }).parse(JSON.parse(raw));
  return parseAgentPrState(parsed.comments);
};

const readFlagValue = (args: readonly string[], flag: string): string | null => {
  const index = args.indexOf(flag);
  if (index === -1) {
    return null;
  }
  return args[index + 1] ?? null;
};

const applyQueueOrder = (repoRoot: string, order: QueueWorkOrder) => {
  if (order.kind === "escalate") {
    execFileSync("gh", ["pr", "edit", String(order.prNumber), "--add-label", "agent:needs-human"], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    execFileSync(
      "gh",
      ["pr", "comment", String(order.prNumber), "--body", `Escalating to human: ${order.reason}`],
      { cwd: repoRoot, encoding: "utf8" },
    );
    return;
  }
  if (order.kind === "rerun_flake") {
    execFileSync("gh", ["run", "rerun", String(order.runId), "--failed"], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    const nextState = mergeAgentPrState(order.state, {
      lastHeadSha: order.headSha,
      flakeReruns: order.state.flakeReruns + 1,
    });
    execFileSync(
      "gh",
      ["pr", "comment", String(order.prNumber), "--body", formatAgentPrStateComment(nextState)],
      { cwd: repoRoot, encoding: "utf8" },
    );
  }
};

const runCli = () => {
  const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
  const [command, ...rest] = process.argv.slice(2);

  if (command === "next") {
    const apply = rest.includes("--apply");
    const repo = getRepoIdentity(repoRoot);
    const order = selectNextWork({
      openAgentPrs: fetchOpenAgentPrs(repoRoot, repo),
      readyIssues: fetchReadyIssues(repoRoot),
    });
    if (apply) {
      applyQueueOrder(repoRoot, order);
    }
    console.log(JSON.stringify(order, null, 2));
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
      fetchIssueComments(repoRoot, issueNumber),
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
    execFileSync(
      "gh",
      ["issue", "comment", String(issueNumber), "--body", formatClaimComment(claim)],
      { cwd: repoRoot, encoding: "utf8" },
    );

    const winnerAfterWrite = findEarliestActiveClaimRunId(
      fetchIssueComments(repoRoot, issueNumber),
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

  if (command === "record-shepherd") {
    const prNumber = Number.parseInt(rest[0] ?? "", 10);
    const round = Number.parseInt(readFlagValue(rest, "--round") ?? "", 10);
    const sha = readFlagValue(rest, "--sha") ?? undefined;
    const issueRaw = readFlagValue(rest, "--issue");
    const flakeRaw = readFlagValue(rest, "--flake-reruns");
    if (!Number.isInteger(prNumber) || prNumber <= 0) {
      throw new Error(
        "Usage: queue.ts record-shepherd <pr-number> --round <n> [--sha <sha>] [--issue <n>] [--flake-reruns <n>]",
      );
    }
    const previous = fetchCurrentAgentPrState(repoRoot, prNumber);
    const state = mergeAgentPrState(previous, {
      shepherdRounds: round,
      ...(flakeRaw !== null ? { flakeReruns: Number.parseInt(flakeRaw, 10) } : {}),
      ...(sha ? { lastHeadSha: sha } : {}),
      ...(issueRaw !== null ? { issueNumber: Number.parseInt(issueRaw, 10) } : {}),
    });
    execFileSync(
      "gh",
      ["pr", "comment", String(prNumber), "--body", formatAgentPrStateComment(state)],
      { cwd: repoRoot, encoding: "utf8" },
    );
    console.log(JSON.stringify({ status: "recorded", prNumber, state }));
    return;
  }

  if (command === "threads") {
    const prNumber = Number.parseInt(rest[0] ?? "", 10);
    if (!Number.isInteger(prNumber) || prNumber <= 0) {
      throw new Error("Usage: queue.ts threads <pr-number>");
    }
    const repo = getRepoIdentity(repoRoot);
    console.log(JSON.stringify(fetchUnresolvedThreads(repoRoot, repo, prNumber), null, 2));
    return;
  }

  if (command === "resolve-thread") {
    const threadId = rest[0];
    if (!threadId) {
      throw new Error("Usage: queue.ts resolve-thread <thread-id>");
    }
    console.log(resolveReviewThread(repoRoot, threadId));
    return;
  }

  throw new Error(
    `Unknown queue command "${command ?? ""}". Expected "next", "claim", "record-shepherd", "threads", or "resolve-thread".`,
  );
};

const entryPath = process.argv[1];
if (entryPath && resolve(entryPath) === fileURLToPath(import.meta.url)) {
  runCli();
}
