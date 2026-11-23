import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vite-plus/test";

import {
  ADDRESSED_THREAD_MARKER,
  extractUnaddressedReviewThreads,
  findEarliestActiveClaimRunId,
  formatAddressedReplyBody,
  formatAgentPrStateComment,
  formatClaimComment,
  hasActiveClaim,
  mergeAgentPrState,
  normalizeRestChecks,
  normalizeStatusCheckRollup,
  parseAgentPrState,
  parseGitHubRemote,
  selectNextWork,
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

  test("parses GitHub owner/repo from SSH, HTTPS, and cloud proxy remote URLs", () => {
    expect(parseGitHubRemote("git@github.com:dmprav/merit.git")).toEqual({
      owner: "dmprav",
      name: "merit",
    });
    expect(parseGitHubRemote("https://github.com/dmprav/merit.git")).toEqual({
      owner: "dmprav",
      name: "merit",
    });
    expect(parseGitHubRemote("http://local_proxy@127.0.0.1:41234/git/dmprav/merit")).toEqual({
      owner: "dmprav",
      name: "merit",
    });
    expect(parseGitHubRemote("https://example.com/not-a-repo")).toBeNull();
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

  test("uses only GitHub REST endpoints so Claude Code cloud proxy never rejects GraphQL calls", () => {
    const source = readFileSync(fileURLToPath(new URL("./queue.ts", import.meta.url)), "utf8");
    expect(source).not.toMatch(/execFileSync\("gh",\s*\[\s*"(?:pr|issue|repo)"/);
    expect(source).not.toContain('"graphql"');
  });
});
