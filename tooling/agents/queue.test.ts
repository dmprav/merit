import { describe, expect, test } from "vite-plus/test";

import type { IssueCommentRecord } from "../verification/agent-policy.ts";
import type { GitHubRestClient } from "./github.ts";
import {
  ADDRESSED_THREAD_MARKER,
  CLAIM_TTL_MS,
  claimIssue,
  extractUnaddressedReviewThreads,
  findEarliestActiveClaimRunId,
  formatAddressedReplyBody,
  formatAgentPrStateComment,
  formatClaimComment,
  hasActiveClaim,
  hasAgentPrState,
  mergeAgentPrState,
  normalizeRestChecks,
  normalizeStatusCheckRollup,
  openAgentPr,
  parseAgentPrState,
  parseQueueArgs,
  parseRecordShepherdArgs,
  pickNextIssue,
  runQueueCommand,
  selectNextWork,
  triagePr,
  type OpenAgentPr,
  type ReadyIssueCandidate,
} from "./queue.ts";

const basePr = (overrides: Partial<OpenAgentPr> = {}): OpenAgentPr => ({
  number: 220,
  title: "refactor(reviews): simplify eligibility",
  body: "Closes #120",
  headRefName: "claude/issue-120",
  headSha: "1234567890",
  isDraft: false,
  stateInitialized: true,
  labels: ["agent:pr"],
  checks: [
    { name: "verify", status: "COMPLETED", conclusion: "SUCCESS" },
    { name: "CodeRabbit", status: "COMPLETED", conclusion: "SUCCESS" },
  ],
  unresolvedThreads: [],
  state: { shepherdRounds: 0, flakeReruns: 0 },
  failedVerifyRun: null,
  ...overrides,
});

const baseIssue = (overrides: Partial<ReadyIssueCandidate> = {}): ReadyIssueCandidate => ({
  number: 130,
  title: "Simplify review eligibility check",
  labels: ["agent:ready"],
  comments: [],
  ...overrides,
});

describe("queue", () => {
  test("waits when checks are empty, verify is missing, or any check is still pending", () => {
    for (const checks of [
      [],
      [{ name: "changes", status: "COMPLETED", conclusion: "SUCCESS" }],
      [
        { name: "verify", status: "IN_PROGRESS", conclusion: null },
        { name: "CodeRabbit", status: "COMPLETED", conclusion: "SUCCESS" },
      ],
    ]) {
      const order = selectNextWork({
        openAgentPrs: [
          basePr({
            checks,
            unresolvedThreads: [
              { id: "T1", path: "a.ts", line: 10, author: "coderabbitai", body: "Fix this" },
            ],
          }),
        ],
        readyIssues: [],
      });
      expect(order).toEqual({
        kind: "idle",
        reason: "waiting_for_checks",
        openAgentPrCount: 1,
      });
    }

    expect(normalizeStatusCheckRollup(null)).toEqual([]);
    expect(
      normalizeStatusCheckRollup([
        { context: "verify", state: "EXPECTED" },
        { context: "CodeQL", state: "SUCCESS" },
      ]),
    ).toEqual([
      { name: "verify", status: "IN_PROGRESS", conclusion: null },
      { name: "CodeQL", status: "COMPLETED", conclusion: "SUCCESS" },
    ]);
  });

  test("requests a zero-LLM rerun once for attempt-1 browser failures, then falls through to shepherd", () => {
    const browserFailChecks = [
      { name: "browser-demo (2/3)", status: "COMPLETED", conclusion: "FAILURE" },
      { name: "verify", status: "COMPLETED", conclusion: "FAILURE" },
      { name: "CodeRabbit", status: "COMPLETED", conclusion: "SUCCESS" },
    ];

    const first = selectNextWork({
      openAgentPrs: [
        basePr({
          checks: browserFailChecks,
          state: { shepherdRounds: 0, flakeReruns: 0 },
          failedVerifyRun: { databaseId: 9001, attempt: 1 },
        }),
      ],
      readyIssues: [baseIssue()],
    });
    expect(first.kind).toBe("rerun_flake");
    if (first.kind === "rerun_flake") {
      expect(first.runId).toBe(9001);
    }

    // Already attempted rerun on GitHub (attempt 2), even if state comment wasn't written: advance to shepherd.
    const alreadyRetriedOnGithub = selectNextWork({
      openAgentPrs: [
        basePr({
          checks: browserFailChecks,
          state: { shepherdRounds: 0, flakeReruns: 0 },
          failedVerifyRun: { databaseId: 9001, attempt: 2 },
        }),
      ],
      readyIssues: [baseIssue()],
    });
    expect(alreadyRetriedOnGithub.kind).toBe("shepherd");

    // No matching failed verify.yml run found: do not wedge on rerun_flake, advance to shepherd.
    const noMatchingRun = selectNextWork({
      openAgentPrs: [
        basePr({
          checks: browserFailChecks,
          state: { shepherdRounds: 0, flakeReruns: 0 },
          failedVerifyRun: null,
        }),
      ],
      readyIssues: [baseIssue()],
    });
    expect(noMatchingRun.kind).toBe("shepherd");

    const afterRecordedRerun = selectNextWork({
      openAgentPrs: [
        basePr({
          checks: browserFailChecks,
          state: { shepherdRounds: 0, flakeReruns: 1 },
          failedVerifyRun: { databaseId: 9001, attempt: 1 },
        }),
      ],
      readyIssues: [baseIssue()],
    });
    expect(afterRecordedRerun.kind).toBe("shepherd");

    // Preserving flakeReruns when recording a shepherd round without --flake-reruns.
    expect(
      mergeAgentPrState(
        { issueNumber: 120, shepherdRounds: 0, flakeReruns: 1 },
        { shepherdRounds: 1, lastHeadSha: "abcdef1" },
      ),
    ).toEqual({ issueNumber: 120, shepherdRounds: 1, lastHeadSha: "abcdef1", flakeReruns: 1 });

    // Mixed browser + package-tests failure must shepherd immediately, not rerun as flake.
    const mixed = selectNextWork({
      openAgentPrs: [
        basePr({
          checks: [
            ...browserFailChecks,
            { name: "package-tests", status: "COMPLETED", conclusion: "FAILURE" },
          ],
          state: { shepherdRounds: 0, flakeReruns: 0 },
          failedVerifyRun: { databaseId: 9001, attempt: 1 },
        }),
      ],
      readyIssues: [baseIssue()],
    });
    expect(mixed.kind).toBe("shepherd");
  });

  test("skips draft and agent:needs-human PRs and escalates PRs after max shepherd rounds", () => {
    const skippedPrs = selectNextWork({
      openAgentPrs: [
        basePr({
          number: 218,
          isDraft: true,
          unresolvedThreads: [
            { id: "T0", path: "a.ts", line: 1, author: "coderabbitai", body: "Draft nit" },
          ],
        }),
        basePr({
          number: 219,
          labels: ["agent:pr", "agent:needs-human"],
          unresolvedThreads: [
            { id: "T1", path: "a.ts", line: 2, author: "coderabbitai", body: "Needs human" },
          ],
        }),
      ],
      readyIssues: [baseIssue({ number: 140 })],
    });
    expect(skippedPrs).toEqual({
      kind: "idle",
      reason: "wip_limit_reached",
      openAgentPrCount: 2,
    });

    const escalated = selectNextWork({
      openAgentPrs: [
        basePr({
          unresolvedThreads: [
            { id: "T2", path: "a.ts", line: 15, author: "coderabbitai", body: "Still broken" },
          ],
          state: { shepherdRounds: 2, flakeReruns: 0 },
        }),
      ],
      readyIssues: [baseIssue()],
    });
    expect(escalated.kind).toBe("escalate");
  });

  test("enforces WIP cap, skips needs-human/linked/claimed issues, ignores untrusted claims, and clamps far-future TTL", () => {
    const now = Date.UTC(2026, 10, 22, 12, 0, 0);
    const activeClaim = {
      authorAssociation: "OWNER",
      body: formatClaimComment({
        runId: "run-1",
        claimedAt: new Date(now - 30 * 60 * 1000).toISOString(),
        expiresAt: new Date(now + 90 * 60 * 1000).toISOString(),
      }),
    };
    const untrustedClaim = {
      authorAssociation: "NONE",
      body: activeClaim.body,
    };
    const forgedFutureClaim = {
      authorAssociation: "OWNER",
      body: formatClaimComment({
        runId: "run-bad",
        claimedAt: new Date(now - 3 * 60 * 60 * 1000).toISOString(),
        expiresAt: new Date(now + 365 * 24 * 60 * 60 * 1000).toISOString(),
      }),
    };

    expect(hasActiveClaim([activeClaim], now)).toBe(true);
    expect(hasActiveClaim([untrustedClaim], now)).toBe(false);
    expect(hasActiveClaim([forgedFutureClaim], now)).toBe(false);

    const picked = selectNextWork({
      openAgentPrs: [basePr({ number: 220, body: "Closes #120" })],
      readyIssues: [
        baseIssue({
          number: 118,
          title: "Paused issue",
          labels: ["agent:ready", "agent:needs-human"],
        }),
        baseIssue({
          number: 119,
          title: "Architecture design RFC",
          labels: ["agent:ready", "agent:design"],
        }),
        baseIssue({ number: 120, title: "Already has PR" }),
        baseIssue({ number: 125, title: "Actively claimed", comments: [activeClaim] }),
        baseIssue({ number: 127, title: "Spoofed untrusted claim", comments: [untrustedClaim] }),
        baseIssue({ number: 128, title: "Clamped expired claim", comments: [forgedFutureClaim] }),
        baseIssue({ number: 130, title: "Later issue" }),
      ],
      nowMs: now,
    });
    expect(picked).toEqual({
      kind: "implement",
      issueNumber: 127,
      title: "Spoofed untrusted claim",
      branchSuggestion: "claude/issue-127",
    });
  });

  test("parses latest trusted agent PR state marker while ignoring untrusted commenters", () => {
    const c1 = {
      authorAssociation: "OWNER",
      body: formatAgentPrStateComment({ issueNumber: 42, shepherdRounds: 1, flakeReruns: 0 }),
    };
    const spoofed = {
      authorAssociation: "NONE",
      body: formatAgentPrStateComment({ issueNumber: 42, shepherdRounds: 99, flakeReruns: 5 }),
    };
    const c2 = {
      authorAssociation: "COLLABORATOR",
      body: formatAgentPrStateComment({
        issueNumber: 42,
        shepherdRounds: 2,
        lastHeadSha: "abcdef1",
        flakeReruns: 1,
      }),
    };
    expect(
      parseAgentPrState([{ authorAssociation: "OWNER", body: "ordinary" }, c1, spoofed]),
    ).toEqual({
      issueNumber: 42,
      shepherdRounds: 1,
      flakeReruns: 0,
    });
    expect(parseAgentPrState([c1, spoofed, c2])).toEqual({
      issueNumber: 42,
      shepherdRounds: 2,
      lastHeadSha: "abcdef1",
      flakeReruns: 1,
    });
  });

  test("resolves earliest active trusted claim winner across concurrent claims and renewals", () => {
    const now = Date.UTC(2026, 10, 22, 12, 0, 0);
    const expiredFirst = {
      authorAssociation: "OWNER",
      body: formatClaimComment({
        runId: "run-expired",
        claimedAt: new Date(now - 3 * 60 * 60 * 1000).toISOString(),
        expiresAt: new Date(now - 60 * 60 * 1000).toISOString(),
      }),
    };
    const untrustedFirst = {
      authorAssociation: "NONE",
      body: formatClaimComment({
        runId: "run-untrusted",
        claimedAt: new Date(now - 10 * 60 * 1000).toISOString(),
        expiresAt: new Date(now + 110 * 60 * 1000).toISOString(),
      }),
    };
    const winnerClaim = {
      authorAssociation: "OWNER",
      body: formatClaimComment({
        runId: "run-winner",
        claimedAt: new Date(now - 5 * 60 * 1000).toISOString(),
        expiresAt: new Date(now + 115 * 60 * 1000).toISOString(),
      }),
    };
    const loserClaim = {
      authorAssociation: "COLLABORATOR",
      body: formatClaimComment({
        runId: "run-loser",
        claimedAt: new Date(now - 4 * 60 * 1000).toISOString(),
        expiresAt: new Date(now + 116 * 60 * 1000).toISOString(),
      }),
    };
    const renewedWinner = {
      authorAssociation: "OWNER",
      body: formatClaimComment({
        runId: "run-winner",
        claimedAt: new Date(now + 90 * 60 * 1000).toISOString(),
        expiresAt: new Date(now + 210 * 60 * 1000).toISOString(),
      }),
    };

    expect(
      findEarliestActiveClaimRunId([expiredFirst, untrustedFirst, winnerClaim, loserClaim], now),
    ).toBe("run-winner");
    // Between original winner expiry (+115m) and losing claim expiry (+116m), the renewed winner stays ahead.
    expect(
      findEarliestActiveClaimRunId(
        [winnerClaim, loserClaim, renewedWinner],
        now + 115.5 * 60 * 1000,
      ),
    ).toBe("run-winner");
    // After the original 2h claim expires, the same run's renewal remains active.
    expect(
      findEarliestActiveClaimRunId([winnerClaim, loserClaim, renewedWinner], now + 150 * 60 * 1000),
    ).toBe("run-winner");
    // Once every lease for the prior winner expires, a subsequent claimant takes over.
    const nextClaimant = {
      authorAssociation: "OWNER",
      body: formatClaimComment({
        runId: "run-next",
        claimedAt: new Date(now + 220 * 60 * 1000).toISOString(),
        expiresAt: new Date(now + 340 * 60 * 1000).toISOString(),
      }),
    };
    expect(
      findEarliestActiveClaimRunId(
        [winnerClaim, loserClaim, renewedWinner, nextClaimant],
        now + 225 * 60 * 1000,
      ),
    ).toBe("run-next");
  });

  test("escalates stale draft agent PRs older than 2 hours while skipping fresh or already-escalated drafts", () => {
    const now = Date.UTC(2026, 10, 22, 12, 0, 0);
    const freshDraft = basePr({
      number: 221,
      isDraft: true,
      updatedAt: new Date(now - 30 * 60 * 1000).toISOString(),
    });
    const staleDraft = basePr({
      number: 222,
      isDraft: true,
      updatedAt: new Date(now - 125 * 60 * 1000).toISOString(),
    });
    const escalatedDraft = basePr({
      number: 223,
      isDraft: true,
      labels: ["agent:pr", "agent:needs-human"],
      updatedAt: new Date(now - 240 * 60 * 1000).toISOString(),
    });

    expect(
      selectNextWork({
        openAgentPrs: [freshDraft, escalatedDraft],
        readyIssues: [],
        nowMs: now,
      }).kind,
    ).toBe("idle");

    const order = selectNextWork({
      openAgentPrs: [freshDraft, staleDraft, escalatedDraft],
      readyIssues: [],
      nowMs: now,
    });
    expect(order).toMatchObject({
      kind: "escalate",
      prNumber: 222,
    });
  });

  test("deduplicates REST check runs by latest id per name and merges commit statuses", () => {
    const normalized = normalizeRestChecks({
      checkRuns: [
        { id: 100, name: "browser-storybook (4/5)", status: "completed", conclusion: "failure" },
        { id: 200, name: "browser-storybook (4/5)", status: "completed", conclusion: "success" },
        { id: 205, name: "verify", status: "completed", conclusion: "success" },
      ],
      statuses: [{ context: "CodeRabbit", state: "pending" }],
    });

    expect(normalized).toEqual([
      { name: "browser-storybook (4/5)", status: "COMPLETED", conclusion: "SUCCESS" },
      { name: "verify", status: "COMPLETED", conclusion: "SUCCESS" },
      { name: "CodeRabbit", status: "IN_PROGRESS", conclusion: null },
    ]);
  });

  test("extracts unaddressed REST review threads, honors trusted addressed markers, and reopens on follow-ups", () => {
    const addressedReply = formatAddressedReplyBody("Fixed in abc1234.");
    expect(addressedReply).toContain(ADDRESSED_THREAD_MARKER);
    expect(formatAddressedReplyBody(addressedReply)).toBe(addressedReply);

    const threads = extractUnaddressedReviewThreads([
      // Thread 10: bot comment addressed by trusted OWNER -> excluded
      {
        id: 10,
        in_reply_to_id: null,
        path: "tooling/agents/queue.ts",
        line: 50,
        author_association: "NONE",
        user: { login: "coderabbitai[bot]" },
        body: "Fix timeout handling.",
      },
      {
        id: 11,
        in_reply_to_id: 10,
        path: "tooling/agents/queue.ts",
        line: 50,
        author_association: "OWNER",
        user: { login: "dmprav" },
        body: addressedReply,
      },
      // Thread 20: bot comment silenced by untrusted user -> STILL unaddressed
      {
        id: 20,
        in_reply_to_id: null,
        path: "tooling/agents/queue.ts",
        line: null,
        original_line: 88,
        author_association: "NONE",
        user: { login: "coderabbitai[bot]" },
        body: "Validate token.",
      },
      {
        id: 21,
        in_reply_to_id: 20,
        path: "tooling/agents/queue.ts",
        line: null,
        original_line: 88,
        author_association: "NONE",
        user: { login: "external-user" },
        body: addressedReply,
      },
      // Thread 30: addressed once, then maintainer follows up -> reopened
      {
        id: 30,
        in_reply_to_id: null,
        path: "tooling/agents/scout.ts",
        line: 12,
        author_association: "OWNER",
        user: { login: "dmprav" },
        body: "Rename helper.",
      },
      {
        id: 31,
        in_reply_to_id: 30,
        path: "tooling/agents/scout.ts",
        line: 12,
        author_association: "OWNER",
        user: { login: "dmprav" },
        body: addressedReply,
      },
      {
        id: 32,
        in_reply_to_id: 30,
        path: "tooling/agents/scout.ts",
        line: 12,
        author_association: "OWNER",
        user: { login: "dmprav" },
        body: "Actually also update the test name.",
      },
    ]);

    expect(threads).toEqual([
      {
        id: "20",
        path: "tooling/agents/queue.ts",
        line: 88,
        author: "coderabbitai[bot]",
        body: "Validate token.",
      },
      {
        id: "30",
        path: "tooling/agents/scout.ts",
        line: 12,
        author: "dmprav",
        body: "Rename helper.\n\n---\n\nFollow-up (dmprav): Actually also update the test name.",
      },
    ]);
  });

  test("keeps newly opened uninitialized non-draft PRs out of shepherd selection until state is recorded, escalating 2h after creation", () => {
    const now = Date.UTC(2026, 10, 22, 12, 0, 0);
    const freshUninitialized = basePr({
      number: 231,
      isDraft: false,
      stateInitialized: false,
      createdAt: new Date(now - 5 * 60 * 1000).toISOString(),
      updatedAt: new Date(now - 5 * 60 * 1000).toISOString(),
      checks: [
        { name: "verify", status: "COMPLETED", conclusion: "FAILURE" },
        { name: "verification-record", status: "COMPLETED", conclusion: "FAILURE" },
      ],
    });
    const staleUninitializedWithRecentComment = basePr({
      number: 232,
      isDraft: false,
      stateInitialized: false,
      createdAt: new Date(now - 125 * 60 * 1000).toISOString(),
      updatedAt: new Date(now - 5 * 60 * 1000).toISOString(),
    });

    expect(
      selectNextWork({
        openAgentPrs: [freshUninitialized],
        readyIssues: [],
        nowMs: now,
      }).kind,
    ).toBe("idle");

    expect(
      selectNextWork({
        openAgentPrs: [freshUninitialized, staleUninitializedWithRecentComment],
        readyIssues: [],
        nowMs: now,
      }),
    ).toMatchObject({
      kind: "escalate",
      prNumber: 232,
    });

    expect(
      mergeAgentPrState(
        { issueNumber: 120, shepherdRounds: 2, flakeReruns: 1 },
        { shepherdRounds: 0, lastHeadSha: "abcdef2" },
      ),
    ).toEqual({
      issueNumber: 120,
      shepherdRounds: 2,
      flakeReruns: 1,
      lastHeadSha: "abcdef2",
    });
  });
});

describe("triagePr", () => {
  const now = Date.UTC(2026, 10, 22, 12, 0, 0);

  const hoursAgo = (hours: number) => new Date(now - hours * 60 * 60 * 1000).toISOString();

  const failing = [
    { name: "verify", status: "COMPLETED", conclusion: "FAILURE" },
    { name: "package-tests", status: "COMPLETED", conclusion: "FAILURE" },
  ];
  const thread = { id: "T1", path: "a.ts", line: 3, author: "coderabbitai", body: "Fix" };

  test("needs nothing from a green PR, a fresh draft, or a PR handed to a human", () => {
    expect(triagePr(basePr(), now)).toBe("skip");
    expect(triagePr(basePr({ isDraft: true, updatedAt: hoursAgo(1) }), now)).toBe("skip");
    expect(
      triagePr(basePr({ labels: ["agent:pr", "agent:needs-human"], checks: failing }), now),
    ).toBe("skip");
  });

  test("waits while checks run even when threads are open", () => {
    expect(
      triagePr(
        basePr({
          checks: [{ name: "verify", status: "QUEUED", conclusion: null }],
          unresolvedThreads: [thread],
        }),
        now,
      ),
    ).toBe("waiting");
  });

  test("escalates stranded drafts and uninitialized PRs with the claim TTL in the reason", () => {
    expect(triagePr(basePr({ isDraft: true, updatedAt: hoursAgo(3) }), now)).toMatchObject({
      kind: "escalate",
      reason: "Draft agent PR was not marked ready within 2 hours; needs human check or cleanup.",
      failedChecks: [],
      unresolvedThreadCount: 0,
    });
    expect(
      triagePr(basePr({ stateInitialized: false, createdAt: hoursAgo(3), checks: failing }), now),
    ).toMatchObject({
      kind: "escalate",
      reason:
        "Agent PR was not initialized with initial state within 2 hours; needs human check or cleanup.",
    });
  });

  test("does not rerun browser failures as flakes while review threads are open", () => {
    expect(
      triagePr(
        basePr({
          checks: [
            { name: "verify", status: "COMPLETED", conclusion: "FAILURE" },
            { name: "browser-demo (1/3)", status: "COMPLETED", conclusion: "FAILURE" },
          ],
          unresolvedThreads: [thread],
          failedVerifyRun: { databaseId: 9001, attempt: 1 },
        }),
        now,
      ),
    ).toMatchObject({ kind: "shepherd", failedChecks: ["verify", "browser-demo (1/3)"] });
  });

  test("shepherds the recorded issue, else the first linked issue, else none", () => {
    const shepherd = (overrides: Partial<OpenAgentPr>) =>
      triagePr(basePr({ checks: failing, ...overrides }), now);

    expect(
      shepherd({ state: { issueNumber: 7, shepherdRounds: 1, flakeReruns: 0 } }),
    ).toMatchObject({ kind: "shepherd", issueNumber: 7, nextRound: 2 });
    expect(shepherd({ body: "Closes #120" })).toMatchObject({ issueNumber: 120, nextRound: 1 });
    expect(shepherd({ body: "No linked issue" })).toMatchObject({ issueNumber: null });
    expect(
      shepherd({
        unresolvedThreads: [thread],
        state: { shepherdRounds: 2, flakeReruns: 0 },
      }),
    ).toEqual({
      kind: "escalate",
      prNumber: 220,
      headRefName: "claude/issue-120",
      reason: "Reached max 2 shepherd rounds.",
      failedChecks: ["verify", "package-tests"],
      unresolvedThreadCount: 1,
    });
  });
});

describe("pickNextIssue", () => {
  test("skips issues whose number an open PR records in its state", () => {
    expect(
      pickNextIssue(
        [baseIssue({ number: 131 }), baseIssue({ number: 130 })],
        [basePr({ body: "", state: { issueNumber: 130, shepherdRounds: 0, flakeReruns: 0 } })],
        Date.now(),
      )?.number,
    ).toBe(131);
    expect(pickNextIssue([], [], Date.now())).toBeUndefined();
  });
});

describe("record-shepherd arguments", () => {
  test("parses every option the queue worker and implement-proposal pass", () => {
    expect(
      parseRecordShepherdArgs([
        "221",
        "--round",
        "0",
        "--sha",
        "abc123",
        "--issue",
        "120",
        "--flake-reruns",
        "1",
        "--if-uninitialized",
      ]),
    ).toEqual({
      prNumber: 221,
      round: 0,
      sha: "abc123",
      issueNumber: 120,
      flakeReruns: 1,
      ifUninitialized: true,
    });
    expect(parseRecordShepherdArgs(["221", "--round", "2"])).toEqual({
      prNumber: 221,
      round: 2,
      ifUninitialized: false,
    });
  });

  test("requires --round, so a missing round never reaches the recorded state", () => {
    expect(() => parseRecordShepherdArgs(["221", "--sha", "abc123"])).toThrow(
      /Usage: queue\.ts record-shepherd <pr-number> --round <n>/,
    );
  });

  test.each([
    {
      args: ["221", "--round", "two"],
      error: '--round must be a whole number of at least 0 (got "two").',
    },
    {
      args: ["221", "--round", "1", "--issue", "0"],
      error: '--issue must be a whole number of at least 1 (got "0").',
    },
    { args: ["221", "--round", "1", "--flake-reruns"], error: "--flake-reruns requires a value." },
    { args: ["221", "--round", "--sha", "abc123"], error: "--round requires a value." },
    {
      args: ["221", "--round", "0", "--if-uninitialised"],
      error: "Unknown option '--if-uninitialised'",
    },
    {
      args: ["221abc", "--round", "0"],
      error: '<pr-number> must be a whole number of at least 1 (got "221abc").',
    },
    { args: ["--round", "0"], error: /Usage: queue\.ts record-shepherd/ },
  ])("rejects $args", ({ args, error }) => {
    expect(() => parseRecordShepherdArgs(args)).toThrow(error);
  });
});

describe("queue arguments", () => {
  test("parses each command's positionals and options", () => {
    expect(parseQueueArgs(["next"])).toEqual({ command: "next", apply: false });
    expect(parseQueueArgs(["next", "--apply"])).toEqual({ command: "next", apply: true });
    expect(parseQueueArgs(["issue", "130"])).toEqual({ command: "issue", issueNumber: 130 });
    expect(parseQueueArgs(["claim", "130"])).toEqual({ command: "claim", issueNumber: 130 });
    expect(parseQueueArgs(["claim", "130", "--renew", "run-1"])).toEqual({
      command: "claim",
      issueNumber: 130,
      renewRunId: "run-1",
    });
    expect(parseQueueArgs(["escalate", "221", "--reason", " CI is red "])).toEqual({
      command: "escalate",
      targetNumber: 221,
      reason: "CI is red",
    });
    expect(parseQueueArgs(["threads", "221"])).toEqual({ command: "threads", prNumber: 221 });
    expect(parseQueueArgs(["reply-thread", "221", "9001", "--body", "- fixed the guard"])).toEqual({
      command: "reply-thread",
      prNumber: 221,
      commentId: 9001,
      body: "- fixed the guard",
    });
  });

  // Number.parseInt("12abc") is 12, so a typo would claim or escalate a different issue.
  test.each([
    {
      args: ["issue", "12abc"],
      error: '<issue-number> must be a whole number of at least 1 (got "12abc").',
    },
    {
      args: ["claim", "12abc"],
      error: '<issue-number> must be a whole number of at least 1 (got "12abc").',
    },
    {
      args: ["claim", "1e3"],
      error: '<issue-number> must be a whole number of at least 1 (got "1e3").',
    },
    {
      args: ["escalate", "12.5", "--reason", "stuck"],
      error: '<issue-or-pr-number> must be a whole number of at least 1 (got "12.5").',
    },
    {
      args: ["threads", "0x10"],
      error: '<pr-number> must be a whole number of at least 1 (got "0x10").',
    },
    {
      args: ["reply-thread", "221", "9001abc", "--body", "done"],
      error: '<comment-id> must be a whole number of at least 1 (got "9001abc").',
    },
  ])("rejects a malformed number in $args", ({ args, error }) => {
    expect(() => parseQueueArgs(args)).toThrow(error);
  });

  // An ignored typo would apply work orders, or re-record shepherd state, the caller did not ask for.
  test.each([
    { args: ["next", "--aply"], error: /Unknown option '--aply'/ },
    { args: ["claim", "130", "--renwe", "run-1"], error: /Unknown option '--renwe'/ },
    { args: ["claim", "130", "131"], error: /Usage: queue\.ts claim/ },
    { args: ["claim"], error: /Usage: queue\.ts claim/ },
    { args: ["escalate", "221"], error: /Usage: queue\.ts escalate/ },
    { args: ["open-pr", "--title", "T", "--head", "b"], error: /Usage: queue\.ts open-pr/ },
    {
      args: ["open-pr", "--title", "T", "--head", "b", "--body-file", "pr.md", "--body", "x"],
      error: /Usage: queue\.ts open-pr/,
    },
    { args: ["unknown"], error: /Unknown queue command "unknown"/ },
  ])("rejects $args", ({ args, error }) => {
    expect(() => parseQueueArgs(args)).toThrow(error);
  });

  test("accepts an explicitly empty inline pull request body", () => {
    expect(parseQueueArgs(["open-pr", "--title", "T", "--head", "b", "--body="])).toEqual({
      command: "open-pr",
      title: "T",
      head: "b",
      base: "main",
      body: "",
    });
  });
});

describe("trusted state markers", () => {
  test("skips markers with malformed JSON or invalid state, and markers from untrusted authors", () => {
    const valid = formatAgentPrStateComment({ shepherdRounds: 1, flakeReruns: 0 });
    const comments = [
      { authorAssociation: "OWNER", body: "<!-- merit-agent: {not json} -->" },
      { authorAssociation: "OWNER", body: '<!-- merit-agent: {"shepherdRounds":-1} -->' },
      { authorAssociation: "CONTRIBUTOR", body: valid },
    ];
    expect(hasAgentPrState(comments)).toBe(false);
    expect(parseAgentPrState(comments)).toEqual({ shepherdRounds: 0, flakeReruns: 0 });

    const withValid = [...comments, { authorAssociation: "MEMBER", body: valid }];
    expect(hasAgentPrState(withValid)).toBe(true);
    expect(parseAgentPrState(withValid)).toEqual({ shepherdRounds: 1, flakeReruns: 0 });
  });
});

const NOW = Date.UTC(2026, 10, 22, 12, 0, 0);

const claimComment = (runId: string, claimedAtMs: number): IssueCommentRecord => ({
  authorAssociation: "MEMBER",
  body: formatClaimComment({
    runId,
    claimedAt: new Date(claimedAtMs).toISOString(),
    expiresAt: new Date(claimedAtMs + CLAIM_TTL_MS).toISOString(),
  }),
});

/** An issue's comment thread where `onPost` can add a rival run's comment as this run writes. */
const fakeIssueThread = (
  initial: IssueCommentRecord[] = [],
  onPost: (comments: IssueCommentRecord[]) => void = () => {},
) => {
  const comments = [...initial];
  const posted: string[] = [];
  const client = {
    listIssueComments: () => [...comments],
    postIssueComment: (_number: number, body: string) => {
      posted.push(body);
      onPost(comments);
      comments.push({ authorAssociation: "MEMBER", body });
    },
  };
  return { client, posted };
};

const claimOptions = { now: () => NOW, newRunId: () => "run-new" };

describe("claimIssue", () => {
  test("claims an unclaimed issue for a new run for the claim TTL", () => {
    const { client, posted } = fakeIssueThread([claimComment("run-expired", NOW - CLAIM_TTL_MS)]);

    const outcome = claimIssue(client, 130, claimOptions);

    expect(outcome).toEqual({
      status: "claimed",
      issueNumber: 130,
      claim: {
        runId: "run-new",
        claimedAt: new Date(NOW).toISOString(),
        expiresAt: new Date(NOW + CLAIM_TTL_MS).toISOString(),
      },
    });
    expect(posted).toEqual([outcome.status === "claimed" ? formatClaimComment(outcome.claim) : ""]);
  });

  test("leaves an issue another run holds without writing a claim", () => {
    const { client, posted } = fakeIssueThread([claimComment("run-other", NOW - 60_000)]);

    expect(claimIssue(client, 130, claimOptions)).toEqual({
      status: "already_claimed",
      issueNumber: 130,
      winningRunId: "run-other",
    });
    expect(posted).toEqual([]);
  });

  test("renews this run's own claim, but reports a lost race when another run holds the issue", () => {
    const own = fakeIssueThread([claimComment("run-mine", NOW - 60_000)]);
    expect(claimIssue(own.client, 130, { ...claimOptions, renewRunId: "run-mine" })).toMatchObject({
      status: "renewed",
      claim: { runId: "run-mine", claimedAt: new Date(NOW).toISOString() },
    });

    const taken = fakeIssueThread([claimComment("run-other", NOW - 60_000)]);
    expect(claimIssue(taken.client, 130, { ...claimOptions, renewRunId: "run-mine" })).toEqual({
      status: "lost_race",
      issueNumber: 130,
      winningRunId: "run-other",
    });
    expect(taken.posted).toEqual([]);
  });

  test("reports a lost race when a rival's earlier claim lands while this run writes its own", () => {
    const { client, posted } = fakeIssueThread([], (comments) => {
      comments.push(claimComment("run-rival", NOW - 1000));
    });

    const outcome = claimIssue(client, 130, claimOptions);

    expect(outcome).toMatchObject({
      status: "lost_race",
      issueNumber: 130,
      claim: { runId: "run-new" },
      winningRunId: "run-rival",
    });
    expect(posted).toHaveLength(1);
  });
});

const fakePullClient = ({
  existing = null,
  failLabel = false,
}: {
  existing?: { number: number; url: string; headRefName: string } | null;
  failLabel?: boolean;
} = {}) => {
  const created: Array<{ title: string; head: string; base: string; body: string }> = [];
  const labeled: Array<{ number: number; labels: readonly string[] }> = [];
  const client = {
    findOpenPull: () => existing,
    createPull: (pull: { title: string; head: string; base: string; body: string }) => {
      created.push(pull);
      return { number: 301, url: "https://github.com/pr/301", headRefName: pull.head };
    },
    addLabels: (number: number, labels: readonly string[]) => {
      if (failLabel) {
        throw new Error("label failed");
      }
      labeled.push({ number, labels });
    },
  };
  return { client, created, labeled };
};

const pullRequest = { title: "fix: guard", head: "claude/issue-130", base: "main", body: "B" };

describe("openAgentPr", () => {
  test("creates and labels a pull request when none is open for the branch", () => {
    const { client, created, labeled } = fakePullClient();

    expect(openAgentPr(client, pullRequest, () => {})).toEqual({
      status: "created",
      number: 301,
      url: "https://github.com/pr/301",
      headRefName: "claude/issue-130",
    });
    expect(created).toEqual([pullRequest]);
    expect(labeled).toEqual([{ number: 301, labels: ["agent:pr"] }]);
  });

  test("reuses and labels the open pull request for the branch instead of opening another", () => {
    const existing = { number: 299, url: "https://github.com/pr/299", headRefName: "b" };
    const { client, created, labeled } = fakePullClient({ existing });

    expect(openAgentPr(client, pullRequest, () => {})).toEqual({ status: "reused", ...existing });
    expect(created).toEqual([]);
    expect(labeled).toEqual([{ number: 299, labels: ["agent:pr"] }]);
  });

  test("reports an unlabeled pull request before rethrowing the labeling failure", () => {
    const warnings: string[] = [];
    const { client } = fakePullClient({ failLabel: true });

    expect(() => openAgentPr(client, pullRequest, (line) => warnings.push(line))).toThrow(
      "label failed",
    );
    expect(warnings.map((line): unknown => JSON.parse(line))).toEqual([
      {
        status: "created_unlabeled",
        number: 301,
        url: "https://github.com/pr/301",
        headRefName: "claude/issue-130",
      },
    ]);
  });
});

describe("runQueueCommand", () => {
  const deps = (client: Partial<GitHubRestClient>) => ({
    // Each test supplies only the operations its command uses; any other call fails the test.
    client: new Proxy(client, {
      get: (target, name) => {
        const operation: unknown = Reflect.get(target, name);
        if (typeof operation !== "function") {
          throw new Error(`unexpected GitHub call: ${String(name)}`);
        }
        return operation;
      },
    }) as GitHubRestClient,
    now: () => NOW,
    newRunId: () => "run-new",
    readFile: (path: string) => `contents of ${path}`,
    warn: () => {},
  });

  test("escalates by labeling and commenting, printing one JSON line", () => {
    const calls: string[] = [];
    const output = runQueueCommand(
      parseQueueArgs(["escalate", "221", "--reason", "CI is red"]),
      deps({
        addLabels: (number, labels) => {
          calls.push(`label ${number} ${labels.join(",")}`);
        },
        postIssueComment: (number, body) => {
          calls.push(`comment ${number} ${body}`);
        },
      }),
    );

    expect(output).toBe('{"status":"escalated","number":221}');
    expect(calls).toEqual([
      "label 221 agent:needs-human",
      "comment 221 Escalating to human: CI is red",
    ]);
  });

  test("opens a pull request with the body read from --body-file", () => {
    const { client, created } = fakePullClient();
    expect(
      runQueueCommand(
        parseQueueArgs(["open-pr", "--title", "T", "--head", "b", "--body-file", "pr.md"]),
        deps(client),
      ),
    ).toBe('{"status":"created","number":301,"url":"https://github.com/pr/301","headRefName":"b"}');
    expect(created).toEqual([{ title: "T", head: "b", base: "main", body: "contents of pr.md" }]);
  });

  test("prints a pull request without unaddressed threads as an empty list", () => {
    expect(
      runQueueCommand(parseQueueArgs(["threads", "221"]), deps({ listReviewComments: () => [] })),
    ).toBe("[]");
  });

  test("leaves already initialized shepherd state alone with --if-uninitialized", () => {
    expect(
      runQueueCommand(
        parseQueueArgs(["record-shepherd", "221", "--round", "1", "--if-uninitialized"]),
        deps({
          listIssueComments: () => [
            {
              authorAssociation: "OWNER",
              body: formatAgentPrStateComment({ shepherdRounds: 0, flakeReruns: 0 }),
            },
          ],
        }),
      ),
    ).toBe(
      '{"status":"already_initialized","prNumber":221,"state":{"shepherdRounds":0,"flakeReruns":0}}',
    );
  });

  /** One open agent PR, #221, as GitHub's REST API reports it, recording every write `next --apply` makes. */
  const fakeAgentPrRepository = ({
    draft = false,
    updatedAt = new Date(NOW - 60_000).toISOString(),
    stateComments = [] as IssueCommentRecord[],
    checkRuns = [] as Array<{
      id: number;
      name: string;
      status: string;
      conclusion: string | null;
    }>,
  }) => {
    const writes: string[] = [];
    const client: Partial<GitHubRestClient> = {
      listOpenIssues: (label) =>
        label === "agent:pr"
          ? [
              {
                number: 221,
                state: "open",
                title: "fix: guard",
                body: "Closes #130",
                labels: ["agent:pr"],
                commentCount: stateComments.length,
                isPullRequest: true,
              },
            ]
          : [],
      getPull: (number) => ({
        number,
        title: "fix: guard",
        body: "Closes #130",
        draft,
        createdAt: new Date(NOW - 2 * CLAIM_TTL_MS).toISOString(),
        updatedAt,
        labels: ["agent:pr"],
        headRefName: "claude/issue-130",
        headSha: "abcdef1234",
      }),
      listIssueComments: () => stateComments,
      listCommitChecks: () => ({ checkRuns, statuses: [] }),
      listWorkflowRuns: () => [{ id: 77, attempt: 1, conclusion: "failure" }],
      listReviewComments: () => [],
      rerunFailedJobs: (runId) => {
        writes.push(`rerun ${runId}`);
      },
      addLabels: (number, labels) => {
        writes.push(`label ${number} ${labels.join(",")}`);
      },
      postIssueComment: (number, body) => {
        writes.push(`comment ${number} ${body}`);
      },
    };
    return { client, writes };
  };

  test("next --apply reruns a browser-only failure once and records the rerun in the PR state", () => {
    const { client, writes } = fakeAgentPrRepository({
      stateComments: [
        {
          authorAssociation: "OWNER",
          body: formatAgentPrStateComment({ issueNumber: 130, shepherdRounds: 1, flakeReruns: 0 }),
        },
      ],
      checkRuns: [
        { id: 1, name: "verify", status: "completed", conclusion: "failure" },
        { id: 2, name: "browser-desktop", status: "completed", conclusion: "failure" },
        { id: 3, name: "unit", status: "completed", conclusion: "success" },
      ],
    });

    const order: unknown = JSON.parse(
      runQueueCommand(parseQueueArgs(["next", "--apply"]), deps(client)),
    );

    expect(order).toMatchObject({ kind: "rerun_flake", prNumber: 221, runId: 77 });
    expect(writes).toEqual([
      "rerun 77",
      `comment 221 ${formatAgentPrStateComment({
        issueNumber: 130,
        shepherdRounds: 1,
        lastHeadSha: "abcdef1234",
        flakeReruns: 1,
      })}`,
    ]);
  });

  test("next --apply hands a stale draft to a human with a label and an explanation", () => {
    const { client, writes } = fakeAgentPrRepository({
      draft: true,
      updatedAt: new Date(NOW - CLAIM_TTL_MS).toISOString(),
    });

    const order: unknown = JSON.parse(
      runQueueCommand(parseQueueArgs(["next", "--apply"]), deps(client)),
    );

    expect(order).toMatchObject({ kind: "escalate", prNumber: 221 });
    expect(writes).toEqual([
      "label 221 agent:needs-human",
      "comment 221 Escalating to human: Draft agent PR was not marked ready within 2 hours; needs human check or cleanup.",
    ]);
  });

  test("next without --apply reports the order without writing", () => {
    const { client, writes } = fakeAgentPrRepository({
      draft: true,
      updatedAt: new Date(NOW - CLAIM_TTL_MS).toISOString(),
    });

    const order: unknown = JSON.parse(runQueueCommand(parseQueueArgs(["next"]), deps(client)));

    expect(order).toMatchObject({ kind: "escalate", prNumber: 221 });
    expect(writes).toEqual([]);
  });

  test("prints the issue command's document indented for agents to read", () => {
    const output = runQueueCommand(
      parseQueueArgs(["issue", "130"]),
      deps({
        getIssue: () => ({
          number: 130,
          state: "open",
          title: "T",
          body: "B",
          labels: ["agent:ready"],
          commentCount: 0,
          isPullRequest: false,
        }),
      }),
    );
    expect(output).toBe(
      JSON.stringify(
        {
          number: 130,
          state: "OPEN",
          title: "T",
          body: "B",
          labels: ["agent:ready"],
          comments: [],
        },
        null,
        2,
      ),
    );
  });
});
