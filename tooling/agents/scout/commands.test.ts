import { describe, expect, test } from "vite-plus/test";

import type { IssueListItem, IssueListQuery } from "../github.ts";
import { advanceRun, buildContext, buildDue } from "./commands.ts";
import type { CheckoutState } from "./git.ts";
import type { ScoutPorts } from "./ports.ts";
import { parseScoutState, SCOUT_STATE_ISSUE_TITLE } from "./state.ts";

const NOW = "2026-11-28T12:00:00.000Z";

const batchCursor = { lastCommitSha: "abcdef12", lastRunAt: "2026-11-22T00:00:00Z" };

const stateBody = (state: unknown) =>
  `State store.\n\n<!-- merit-scout-state: ${JSON.stringify(state)} -->`;

const CORRUPT_STATE_BODY = 'State store.\n\n<!-- merit-scout-state: {"change-batch":1,} -->';

const describeQuery = ({ state, label }: IssueListQuery) => `${state}${label ? ` ${label}` : ""}`;

const TRACKED = [
  "docs/guides/testing.md",
  "foundation/ui/src/button.tsx",
  "tooling/agents/scout.ts",
  "verifications/250.md",
];

const FILES_BY_SHA: Record<string, string[]> = {
  c1: ["foundation/ui/src/button.tsx", "docs/README.md"],
  c2: ["tooling/agents/scout.ts"],
  c3: ["docs/README.md"],
};

/** Fake ports that record each outside call in order. */
const createFakePorts = ({
  body = stateBody({}),
  checkout = { headSha: "tip1234567", changedPaths: [], hiddenPaths: [] },
  issues = [],
}: {
  body?: string;
  checkout?: CheckoutState;
  issues?: IssueListItem[];
} = {}) => {
  const calls: string[] = [];
  const edits: string[] = [];
  const warnings: string[] = [];

  const record = <T>(call: string, value: T): T => {
    calls.push(call);
    return value;
  };

  const ports: ScoutPorts = {
    git: {
      revParse: (ref) => record(`git.revParse ${ref}`, "tip1234567"),
      verifyCommit: (revision) => record(`git.verifyCommit ${revision}`, "resolved1234567"),
      commitDate: (sha) => record(`git.commitDate ${sha}`, "2026-11-25T10:00:00Z"),
      listCommitsSince: ({ fallbackSinceIso }) =>
        record(`git.listCommitsSince ${fallbackSinceIso}`, [
          { sha: "c1", date: "2026-11-25T09:00:00Z", subject: "feat: one" },
          { sha: "c2", date: "2026-11-25T10:00:00Z", subject: "feat: two" },
          { sha: "c3", date: "2026-11-25T11:00:00Z", subject: "docs: three" },
        ]),
      churnSince: () =>
        record("git.churnSince", [
          { path: "tooling/agents/scout.ts", additions: 2500, deletions: 600 },
          { path: "docs/README.md", additions: 10, deletions: 0 },
        ]),
      filesChangedIn: (sha) => record(`git.filesChangedIn ${sha}`, FILES_BY_SHA[sha] ?? []),
      trackedFiles: (sha) => record(`git.trackedFiles ${sha}`, TRACKED),
      isShallow: () => record("git.isShallow", false),
      checkoutState: () => record("git.checkoutState", checkout),
    },
    issues: {
      viewIssue: (number) =>
        record("issues.viewIssue", { number, state: "OPEN", title: SCOUT_STATE_ISSUE_TITLE, body }),
      listIssues: (query) => record(`issues.listIssues ${describeQuery(query)}`, issues),
      editIssueBody: (_number, nextBody) => {
        calls.push("issues.editIssueBody");
        edits.push(nextBody);
      },
    },
    fallow: {
      health: () =>
        record("fallow.health", {
          file_scores: [
            {
              path: "tooling/agents/scout.ts",
              fan_in: 1,
              fan_out: 2,
              lines: 100,
              function_count: 3,
              total_cyclomatic: 4,
              total_cognitive: 5,
            },
            {
              path: "foundation/ui/src/button.tsx",
              fan_in: 1,
              fan_out: 2,
              lines: 100,
              function_count: 3,
              total_cyclomatic: 4,
              total_cognitive: 5,
            },
          ],
        }),
      dupes: () => record("fallow.dupes", {}),
      entryWeight: () => record("fallow.entryWeight", { entry_weight: { entries: [] } }),
    },
    readFile: (repoPath) => record(`readFile ${repoPath}`, ""),
    now: () => new Date(NOW),
    warn: (message) => {
      warnings.push(message);
    },
  };
  return { ports, calls, edits, warnings };
};

describe("listing due runs", () => {
  test("lists the runs whose activity reached a threshold, without needing the scan tip checked out", () => {
    const { ports, calls } = createFakePorts({
      checkout: { headSha: "other7654321", changedPaths: ["scratch.ts"], hiddenPaths: [] },
    });
    expect(buildDue(ports)).toEqual({
      status: "due",
      scanTipSha: "tip1234567",
      runs: [
        {
          id: "area:tooling/agents",
          kind: "area",
          target: "tooling/agents",
          metric: 3100,
          threshold: 3000,
        },
      ],
    });
    expect(calls).not.toContain("git.checkoutState");
    expect(calls[0]).toBe("issues.viewIssue");
  });

  test("is idle when nothing reached a threshold", () => {
    const { ports } = createFakePorts();
    ports.git.churnSince = () => [];
    expect(buildDue(ports)).toEqual({ status: "idle", scanTipSha: "tip1234567" });
  });

  test("reads a corrupt state marker as no cursors and warns which issue to repair", () => {
    const { ports, warnings } = createFakePorts({ body: CORRUPT_STATE_BODY });
    expect(buildDue(ports)).toMatchObject({ status: "due" });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/#219.*corrupt/);
  });

  test("refuses a state issue that is not the open pinned scout state issue", () => {
    const { ports } = createFakePorts();
    ports.issues.viewIssue = (number) => ({ number, state: "CLOSED", title: "other", body: "" });
    expect(() => buildDue(ports)).toThrow(/#219 must be OPEN/);
  });
});

describe("building scout context", () => {
  test.each(["docs", "verification-flakes", "mechanism:nope", "area:"])(
    "refuses the unknown run id %j before any call",
    (runId) => {
      const { ports, calls } = createFakePorts();
      expect(() => buildContext(ports, runId)).toThrow(
        /Unknown run id.*"change-batch", "area:<area>", "mechanism:<mechanism id>", or "records"/,
      );
      expect(calls).toEqual([]);
    },
  );

  test("refuses an area the scan tip has no files in", () => {
    const { ports } = createFakePorts();
    expect(() => buildContext(ports, "area:capabilities/nowhere")).toThrow(
      /Unknown area run "area:capabilities\/nowhere"\. Valid areas: docs, foundation\/ui, tooling\/agents/,
    );
  });

  test.each(["change-batch", "area:docs"])(
    "refuses to scan %s from a checkout at another commit before reading history",
    (runId) => {
      const { ports, calls } = createFakePorts({
        checkout: { headSha: "other7654321", changedPaths: [], hiddenPaths: [] },
      });
      expect(() => buildContext(ports, runId)).toThrow(
        'but the checkout is at other7654321. Run "git switch --detach tip1234567" and retry.',
      );
      expect(calls).toEqual([
        "issues.viewIssue",
        "git.revParse origin/main",
        "git.trackedFiles tip1234567",
        "git.checkoutState",
      ]);
    },
  );

  test("refuses a run from a checkout with changed or untracked paths", () => {
    const changedPaths = ["a.ts", "b.ts", "c.ts", "d.ts", "e.ts", "f.ts", "g.ts"];
    const { ports } = createFakePorts({
      checkout: { headSha: "tip1234567", changedPaths, hiddenPaths: [] },
    });
    expect(() => buildContext(ports, "change-batch")).toThrow(
      "but the checkout has 7 changed or untracked paths (a.ts, b.ts, c.ts, d.ts, e.ts, and 2 more). " +
        "Commit, stash, or remove the changed paths and retry.",
    );
  });

  test("refuses a run from a checkout that hides tracked paths from git status", () => {
    const { ports } = createFakePorts({
      checkout: { headSha: "tip1234567", changedPaths: [], hiddenPaths: ["tooling/x.ts"] },
    });
    expect(() => buildContext(ports, "records")).toThrow(
      "but the checkout hides 1 tracked paths from git status (tooling/x.ts). " +
        'Run "git sparse-checkout disable" or clear',
    );
  });

  test("names both fixes for a dirty checkout at another commit", () => {
    const { ports } = createFakePorts({
      checkout: { headSha: "other7654321", changedPaths: ["a.ts"], hiddenPaths: [] },
    });
    expect(() => buildContext(ports, "change-batch")).toThrow(
      "is at other7654321 and has 1 changed or untracked paths (a.ts). " +
        'Commit, stash, or remove the changed paths, then run "git switch --detach tip1234567" and retry.',
    );
  });

  test("reads a change batch from the lookback date and keeps every commit and file", () => {
    const { ports, calls } = createFakePorts();
    const context = buildContext(ports, "change-batch");
    expect(calls).toContain("git.listCommitsSince 2026-11-21T12:00:00.000Z");
    expect(context).toMatchObject({
      status: "ready",
      run: { id: "change-batch", kind: "change-batch" },
      cursor: null,
      changedFiles: ["docs/README.md", "foundation/ui/src/button.tsx", "tooling/agents/scout.ts"],
    });
    expect(context.commits.map((commit) => commit.sha)).toEqual(["c1", "c2", "c3"]);
    expect(context).not.toHaveProperty("telemetry");
    expect(context).not.toHaveProperty("unreadVerifications");
  });

  test("resumes a run from the cursor on the state issue", () => {
    const { ports } = createFakePorts({ body: stateBody({ "change-batch": batchCursor }) });
    expect(buildContext(ports, "change-batch")).toMatchObject({ cursor: batchCursor });
  });

  test("reads a corrupt state marker as no cursor and warns which issue to repair", () => {
    const { ports, warnings } = createFakePorts({ body: CORRUPT_STATE_BODY });
    expect(buildContext(ports, "change-batch")).toMatchObject({ status: "ready", cursor: null });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/#219.*corrupt/);
  });

  test("limits an area run's commits, files, and mechanisms to the area's paths", () => {
    const { ports } = createFakePorts();
    const context = buildContext(ports, "area:tooling/agents");
    expect(context.run).toEqual({
      id: "area:tooling/agents",
      kind: "area",
      target: "tooling/agents",
    });
    expect(context.commits.map((commit) => commit.sha)).toEqual(["c2"]);
    expect(context.changedFiles).toEqual(["tooling/agents/scout.ts"]);
    expect(context.concerns[0]).toBe("bugs-security");
  });

  test("limits a mechanism run's commits and files to its contract and adapter paths", () => {
    const { ports } = createFakePorts();
    ports.git.filesChangedIn = (sha) =>
      sha === "c1"
        ? ["capabilities/audit/business/src/events.ts", "docs/README.md"]
        : ["docs/b.md"];
    const context = buildContext(ports, "mechanism:audit-trail");
    expect(context.commits.map((commit) => commit.sha)).toEqual(["c1"]);
    expect(context.changedFiles).toEqual(["capabilities/audit/business/src/events.ts"]);
    expect(context.matchedMechanisms.matched.map((entry) => entry.mechanism.id)).toEqual([
      "audit-trail",
    ]);
    expect(context.concerns[0]).toBe("architecture");
  });

  test("lists unread verification records only for the records run", () => {
    const records = buildContext(createFakePorts().ports, "records");
    const batch = buildContext(createFakePorts().ports, "change-batch");
    expect(records).toMatchObject({
      unreadVerifications: [{ prNumber: 250, path: "verifications/250.md" }],
      concerns: ["verification"],
    });
    expect(batch).not.toHaveProperty("unreadVerifications");
  });

  test.each([
    { runId: "change-batch", telemetry: false },
    { runId: "records", telemetry: false },
    { runId: "area:tooling/agents", telemetry: true },
    { runId: "mechanism:audit-trail", telemetry: true },
  ])("collects structural telemetry for $runId: $telemetry", ({ runId, telemetry }) => {
    const { ports, calls } = createFakePorts();
    const context = buildContext(ports, runId);
    expect(calls.includes("fallow.health")).toBe(telemetry);
    expect("telemetry" in context).toBe(telemetry);
  });

  test("filters telemetry to the area and adds capability symmetry only for mechanisms", () => {
    const area = buildContext(createFakePorts().ports, "area:tooling/agents");
    expect(area.telemetry?.topFiles.map((file) => file.path)).toEqual(["tooling/agents/scout.ts"]);
    expect(area.telemetry).not.toHaveProperty("capabilitySymmetry");
    expect(area.telemetry).not.toHaveProperty("entryWeights");
    expect(area.telemetry?.suppressions).toHaveProperty("topFiles");

    const mechanism = buildContext(createFakePorts().ports, "mechanism:audit-trail");
    expect(mechanism.telemetry).toHaveProperty("capabilitySymmetry");
  });

  test("measures entry weights for app and interfaces areas only", () => {
    const interfaces = createFakePorts();
    interfaces.ports.git.trackedFiles = () => ["interfaces/product/src/a.ts", "foundation/ui/a.ts"];
    expect(buildContext(interfaces.ports, "area:interfaces/product").telemetry).toHaveProperty(
      "entryWeights",
    );
    expect(interfaces.calls).toContain("fallow.entryWeight");

    const foundation = createFakePorts();
    foundation.ports.git.trackedFiles = () => ["interfaces/product/src/a.ts", "foundation/ui/a.ts"];
    expect(buildContext(foundation.ports, "area:foundation/ui").telemetry).not.toHaveProperty(
      "entryWeights",
    );
    expect(foundation.calls).not.toContain("fallow.entryWeight");
  });

  test("lists open and maintainer-rejected issues for every run", () => {
    const { ports, calls } = createFakePorts({
      issues: [
        { number: 7, title: "Open one", state: "OPEN", body: "", labels: ["a"], comments: [] },
      ],
    });
    const context = buildContext(ports, "change-batch");
    expect(context.openIssues).toEqual([{ number: 7, title: "Open one", labels: ["a"] }]);
    expect(calls).toContain("issues.listIssues open");
    expect(calls).toContain("issues.listIssues closed wontfix");
  });

  test("refuses a state issue that is not the open pinned scout state issue", () => {
    const { ports } = createFakePorts();
    ports.issues.viewIssue = (number) => ({ number, state: "CLOSED", title: "other", body: "" });
    expect(() => buildContext(ports, "records")).toThrow(/#219 must be OPEN/);
  });
});

describe("advancing a run", () => {
  const options = { runId: "area:tooling/agents", commitSha: "HEAD" };

  test("records the resolved commit and keeps sibling run cursors", () => {
    const { ports, edits } = createFakePorts({
      body: stateBody({ "change-batch": batchCursor }),
    });
    const areaCursor = {
      lastCommitSha: "resolved1234567",
      lastCommitDate: "2026-11-25T10:00:00Z",
      lastRunAt: NOW,
    };
    expect(advanceRun(ports, options)).toEqual({
      status: "advanced",
      run: "area:tooling/agents",
      cursor: areaCursor,
    });
    expect(edits.map(parseScoutState)).toEqual([
      {
        kind: "parsed",
        state: { "change-batch": batchCursor, "area:tooling/agents": areaCursor },
      },
    ]);
  });

  test("records the pull request for the records run and carries it forward", () => {
    const { ports, edits } = createFakePorts();
    advanceRun(ports, { runId: "records", commitSha: "HEAD", prNumber: 250 });
    expect(parseScoutState(edits[0] ?? "")).toMatchObject({
      state: { records: { lastPrNumber: 250 } },
    });

    const again = createFakePorts({ body: edits[0] ?? "" });
    advanceRun(again.ports, { runId: "records", commitSha: "HEAD" });
    expect(parseScoutState(again.edits[0] ?? "")).toMatchObject({
      state: { records: { lastPrNumber: 250 } },
    });
  });

  test("refuses --pr for any run but records before touching the state issue", () => {
    const { ports, calls } = createFakePorts();
    expect(() => advanceRun(ports, { ...options, prNumber: 5 })).toThrow(
      '--pr applies only to the "records" run (got "area:tooling/agents").',
    );
    expect(calls).toEqual([]);
  });

  test("refuses an area with no tracked files at the scan tip before editing the issue", () => {
    const { ports, edits } = createFakePorts();
    expect(() =>
      advanceRun(ports, { runId: "area:capabilities/removed", commitSha: "HEAD" }),
    ).toThrow(/Unknown area run "area:capabilities\/removed"\. Valid areas: .*tooling\/agents/);
    expect(edits).toEqual([]);
  });

  test("refuses an unknown run id before touching the state issue", () => {
    const { ports, calls } = createFakePorts();
    expect(() => advanceRun(ports, { runId: "docs", commitSha: "HEAD" })).toThrow(
      /Unknown run id "docs"/,
    );
    expect(calls).toEqual([]);
  });

  test("drops the old lens cursors it rewrites past", () => {
    const { ports, edits } = createFakePorts({
      body: stateBody({
        docs: batchCursor,
        "verification-flakes": { lastPrNumber: 223, lastRunAt: "2026-11-20T00:00:00Z" },
      }),
    });
    advanceRun(ports, { runId: "change-batch", commitSha: "HEAD" });
    expect(edits[0]).not.toContain('"docs"');
    expect(edits[0]).not.toContain("verification-flakes");
    expect(parseScoutState(edits[0] ?? "")).toMatchObject({
      state: { records: { lastPrNumber: 223 } },
    });
  });

  test("refuses a corrupt state marker before resolving the commit or editing the issue", () => {
    const { ports, calls } = createFakePorts({ body: CORRUPT_STATE_BODY });
    expect(() => advanceRun(ports, options)).toThrow(/Refusing to advance.*#219.*corrupt/);
    expect(calls).toEqual([
      "git.revParse origin/main",
      "git.trackedFiles tip1234567",
      "issues.viewIssue",
    ]);
  });
});
