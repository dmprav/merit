import { describe, expect, test } from "vite-plus/test";

import type { Mechanism } from "../../verification/architecture/mechanisms.config.ts";
import { computeDueRuns } from "./due.ts";
import type { ChurnEntry, CommitSummary, HistoryQuery } from "./git.ts";
import { SCOUT_RUN_POLICY } from "./runs.ts";
import type { ScoutState } from "./state.ts";

const NOW = new Date("2026-11-28T12:00:00.000Z");

const commit = (index: number): CommitSummary => ({
  sha: `c${index}`,
  date: "2026-11-27T00:00:00Z",
  subject: `feat: ${index}`,
});

const mechanism = (id: string, contracts: string[], adapters: string[] = []): Mechanism => ({
  id,
  summary: id,
  contracts,
  adapters,
  docs: ["docs/README.md"],
  decisions: [],
});

/** A git port over fixed history that records each query, whatever cursor it starts from. */
const fakeGit = ({
  commits = [],
  filesBySha = {},
  churn = [],
  tracked = [],
}: {
  commits?: CommitSummary[];
  filesBySha?: Record<string, string[]>;
  churn?: ChurnEntry[];
  tracked?: string[];
}) => {
  const queries: HistoryQuery[] = [];
  const filesRead: string[] = [];
  return {
    queries,
    filesRead,
    git: {
      listCommitsSince: (query: HistoryQuery) => {
        queries.push(query);
        return commits;
      },
      churnSince: (query: HistoryQuery) => {
        queries.push(query);
        return churn;
      },
      filesChangedIn: (sha: string) => {
        filesRead.push(sha);
        return filesBySha[sha] ?? [];
      },
      trackedFiles: () => tracked,
    },
  };
};

const due = (
  setup: Parameters<typeof fakeGit>[0],
  state: ScoutState = {},
  mechanisms: readonly Mechanism[] = [],
) => {
  const fake = fakeGit(setup);
  const runs = computeDueRuns({
    git: fake.git,
    state,
    scanTipSha: "tip",
    now: NOW,
    mechanisms,
  });
  return { ...fake, runs };
};

const commits = (count: number) => Array.from({ length: count }, (_, index) => commit(index));

describe("due change batch", () => {
  test("is due once enough commits have merged since its cursor", () => {
    expect(due({ commits: commits(SCOUT_RUN_POLICY.changeBatch.minCommits - 1) }).runs).toEqual([]);
    expect(due({ commits: commits(SCOUT_RUN_POLICY.changeBatch.minCommits) }).runs).toEqual([
      {
        id: "change-batch",
        kind: "change-batch",
        target: "merged commits on origin/main",
        metric: 10,
        threshold: 10,
      },
    ]);
  });

  test("measures from a week ago when never audited, and from the cursor commit otherwise", () => {
    const never = due({ commits: [] });
    expect(never.queries[0]).toEqual({
      cursor: undefined,
      tipSha: "tip",
      fallbackSinceIso: "2026-11-21T12:00:00.000Z",
    });

    const cursor = { lastCommitSha: "abcdef12", lastRunAt: "2026-11-25T00:00:00Z" };
    const resumed = due({ commits: [] }, { "change-batch": cursor });
    expect(resumed.queries[0]?.cursor).toEqual(cursor);
  });
});

describe("due areas", () => {
  const churn = (path: string, additions: number, deletions = 0): ChurnEntry => ({
    path,
    additions,
    deletions,
  });

  const tracked = ["tooling/agents/scout.ts", "docs/README.md", "capabilities/grantmaking/a.ts"];

  test("is due when an area's added plus deleted lines reach the threshold", () => {
    const { runs } = due({
      tracked,
      churn: [
        churn("tooling/agents/scout.ts", 2000, 999),
        churn("tooling/agents/proposal.ts", 1, 0),
        churn("docs/README.md", 2999),
      ],
    });
    expect(runs).toEqual([
      {
        id: "area:tooling/agents",
        kind: "area",
        target: "tooling/agents",
        metric: 3000,
        threshold: 3000,
      },
    ]);
  });

  test("leaves out lockfiles, records, snapshots, images, and migration metadata", () => {
    const { runs } = due({
      tracked,
      churn: [
        churn("docs/README.md", 1000),
        churn("docs/pnpm-lock.yaml", 5000),
        churn("docs/assets/a.png", 5000),
        churn("docs/__snapshots__/a.snap", 5000),
        churn("verifications/240.md", 5000),
        churn("foundation/db/database/migrations/meta/0001.json", 5000),
      ],
    });
    expect(runs).toEqual([]);
  });

  test("measures each area from its own cursor and a never-audited one from the lookback", () => {
    const cursor = { lastCommitSha: "abcdef12", lastRunAt: "2026-11-25T00:00:00Z" };
    const { queries } = due({ tracked, churn: [] }, { "area:docs": cursor });
    const churnCursors = queries.map((query) => query.cursor?.lastCommitSha);
    expect(new Set(churnCursors)).toEqual(new Set([undefined, "abcdef12"]));
  });
});

describe("due mechanisms", () => {
  const auditTrail = mechanism("audit-trail", ["capabilities/audit/**"]);
  const money = mechanism("exact-money", ["foundation/money/**"], ["capabilities/*/money.ts"]);

  const touching = (count: number, file: string) => ({
    commits: commits(count),
    filesBySha: Object.fromEntries(commits(count).map((entry) => [entry.sha, [file]])),
  });

  test("counts commits that touched a contract or adapter path of the mechanism", () => {
    const { runs } = due(touching(5, "capabilities/audit/events.ts"), {}, [auditTrail, money]);
    expect(runs).toEqual([
      {
        id: "mechanism:audit-trail",
        kind: "mechanism",
        target: "audit-trail",
        metric: 5,
        threshold: 5,
      },
    ]);
    expect(due(touching(4, "capabilities/audit/events.ts"), {}, [auditTrail]).runs).toEqual([]);
    expect(
      due(touching(5, "capabilities/grants/money.ts"), {}, [auditTrail, money]).runs.map(
        (run) => run.id,
      ),
    ).toEqual(["mechanism:exact-money"]);
  });

  test("counts a commit once however many of its files match", () => {
    const history = commits(1);
    const { runs } = due(
      {
        commits: history,
        filesBySha: { c0: ["capabilities/audit/a.ts", "capabilities/audit/b.ts"] },
      },
      {},
      [auditTrail],
    );
    expect(runs).toEqual([]);
  });

  test("reads each commit's files once however many mechanisms share the history", () => {
    const { filesRead } = due(touching(3, "docs/a.md"), {}, [auditTrail, money]);
    expect(filesRead).toEqual(["c0", "c1", "c2"]);
  });
});

describe("due records", () => {
  const records = (from: number, count: number) =>
    Array.from({ length: count }, (_, index) => `verifications/${from + index}.md`);

  test("is due at the threshold of records newer than the cursor's pull request", () => {
    const state: ScoutState = { records: { lastPrNumber: 100, lastRunAt: "2026-11-20T00:00:00Z" } };
    expect(due({ tracked: [...records(95, 5), ...records(101, 7)] }, state).runs).toEqual([]);
    expect(due({ tracked: [...records(95, 5), ...records(101, 8)] }, state).runs).toEqual([
      {
        id: "records",
        kind: "records",
        target: "verification records",
        metric: 8,
        threshold: 8,
      },
    ]);
  });

  test("counts every record when it was never audited", () => {
    expect(due({ tracked: records(1, 8) }).runs.map((run) => run.id)).toEqual(["records"]);
  });
});

describe("due ordering", () => {
  test("lists runs by how far past their threshold they are, most first", () => {
    const history = commits(20);
    const { runs } = due(
      {
        commits: history,
        filesBySha: Object.fromEntries(
          history.map((entry) => [entry.sha, ["capabilities/audit/a.ts"]]),
        ),
        tracked: Array.from({ length: 8 }, (_, index) => `verifications/${index + 1}.md`),
      },
      {},
      [mechanism("audit-trail", ["capabilities/audit/**"])],
    );
    expect(runs.map((run) => [run.id, run.metric / run.threshold])).toEqual([
      ["mechanism:audit-trail", 4],
      ["change-batch", 2],
      ["records", 1],
    ]);
  });
});
