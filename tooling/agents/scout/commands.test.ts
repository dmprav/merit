import { describe, expect, test } from "vite-plus/test";

import { AGENT_LABELS } from "../../verification/agent-policy.ts";
import type { IssueListItem, IssueListQuery } from "../github.ts";
import type { ScoutLens } from "../proposal.ts";
import { advanceLens, buildContext } from "./commands.ts";
import type { CheckoutState } from "./git.ts";
import type { ScoutPorts } from "./ports.ts";
import { parseScoutState, SCOUT_STATE_ISSUE_TITLE } from "./state.ts";

const NOW = "2026-11-26T12:00:00.000Z";

const docsCursor = { lastCommitSha: "abcdef12", lastRunAt: "2026-11-22T00:00:00Z" };

const stateBody = (state: unknown) =>
  `State store.\n\n<!-- merit-scout-state: ${JSON.stringify(state)} -->`;

const CORRUPT_STATE_BODY = 'State store.\n\n<!-- merit-scout-state: {"docs":1,} -->';

const issue = (number: number, labels: string[]): IssueListItem => ({
  number,
  title: `Issue ${number}`,
  state: "OPEN",
  body: "",
  labels,
  comments: [],
});

const describeQuery = ({ state, label }: IssueListQuery) => `${state}${label ? ` ${label}` : ""}`;

/** Fake ports that record each outside call in order. */
const createFakePorts = ({
  body = stateBody({}),
  openProposedCount = 0,
  checkout = { headSha: "tip1234567", changedPaths: [], hiddenPaths: [] },
}: {
  body?: string;
  openProposedCount?: number;
  checkout?: CheckoutState;
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
        ]),
      filesChangedIn: (sha) =>
        record(`git.filesChangedIn ${sha}`, [`foundation/ui/src/${sha}.ts`, "docs/README.md"]),
      trackedFiles: (sha) =>
        record(`git.trackedFiles ${sha}`, [
          "docs/guides/testing.md",
          "foundation/ui/src/button.tsx",
          "verifications/250.md",
        ]),
      isShallow: () => record("git.isShallow", false),
      checkoutState: () => record("git.checkoutState", checkout),
    },
    issues: {
      viewIssue: (number) =>
        record("issues.viewIssue", { number, state: "OPEN", title: SCOUT_STATE_ISSUE_TITLE, body }),
      listIssues: (query) =>
        record(
          `issues.listIssues ${describeQuery(query)}`,
          query.label === AGENT_LABELS.proposed
            ? Array.from({ length: openProposedCount }, (_, index) =>
                issue(300 + index, [AGENT_LABELS.proposed]),
              )
            : [],
        ),
      editIssueBody: (_number, nextBody) => {
        calls.push("issues.editIssueBody");
        edits.push(nextBody);
      },
    },
    fallow: {
      health: () => record("fallow.health", {}),
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

describe("building scout context", () => {
  test("stops at the proposal cap before reading history, issues, or telemetry", () => {
    const { ports, calls } = createFakePorts({ openProposedCount: 5 });
    expect(buildContext(ports, "architecture")).toEqual({
      status: "cap_reached",
      lens: "architecture",
      scanTipSha: "tip1234567",
      openProposedCount: 5,
      maxOpenProposals: 5,
    });
    expect(calls).toEqual([
      "issues.viewIssue",
      "git.revParse origin/main",
      `issues.listIssues open ${AGENT_LABELS.proposed}`,
    ]);
  });

  test.each<ScoutLens>(["architecture", "docs"])(
    "refuses to scan for the %s lens from a checkout at another commit",
    (lens) => {
      const { ports, calls } = createFakePorts({
        checkout: { headSha: "other7654321", changedPaths: [], hiddenPaths: [] },
      });
      expect(() => buildContext(ports, lens)).toThrow(
        'but the checkout is at other7654321. Run "git switch --detach tip1234567" and retry.',
      );
      expect(calls).toEqual([
        "issues.viewIssue",
        "git.revParse origin/main",
        `issues.listIssues open ${AGENT_LABELS.proposed}`,
        "git.checkoutState",
      ]);
    },
  );

  test("refuses a ready run from a checkout with changed or untracked paths", () => {
    const changedPaths = ["a.ts", "b.ts", "c.ts", "d.ts", "e.ts", "f.ts", "g.ts"];
    const { ports } = createFakePorts({
      checkout: { headSha: "tip1234567", changedPaths, hiddenPaths: [] },
    });
    expect(() => buildContext(ports, "tests")).toThrow(
      "but the checkout has 7 changed or untracked paths (a.ts, b.ts, c.ts, d.ts, e.ts, and 2 more). " +
        "Commit, stash, or remove the changed paths and retry.",
    );
  });

  test("refuses a ready run from a checkout that hides tracked paths from git status", () => {
    const { ports } = createFakePorts({
      checkout: { headSha: "tip1234567", changedPaths: [], hiddenPaths: ["tooling/x.ts"] },
    });
    expect(() => buildContext(ports, "simplification")).toThrow(
      "but the checkout hides 1 tracked paths from git status (tooling/x.ts). " +
        'Run "git sparse-checkout disable" or clear',
    );
  });

  test("names both fixes for a dirty checkout at another commit", () => {
    const { ports } = createFakePorts({
      checkout: { headSha: "other7654321", changedPaths: ["a.ts"], hiddenPaths: [] },
    });
    expect(() => buildContext(ports, "docs")).toThrow(
      "is at other7654321 and has 1 changed or untracked paths (a.ts). " +
        'Commit, stash, or remove the changed paths, then run "git switch --detach tip1234567" and retry.',
    );
  });

  test("goes idle without reading the repository when every lens is fresh", () => {
    const fresh = { lastRunAt: NOW };
    const { ports, calls } = createFakePorts({
      body: stateBody({
        architecture: fresh,
        simplification: fresh,
        security: fresh,
        "mcp-db": fresh,
        tests: fresh,
        docs: fresh,
        "verification-flakes": fresh,
      }),
    });
    expect(buildContext(ports, "auto")).toEqual({
      status: "idle",
      reason: "all_lenses_fresh",
      nextLens: "architecture",
      nextDueInHours: 48,
    });
    expect(calls).toEqual(["issues.viewIssue"]);
  });

  test("reads a corrupt state marker as empty and warns which issue to repair", () => {
    const { ports, warnings } = createFakePorts({ body: CORRUPT_STATE_BODY });
    const context = buildContext(ports, "auto");
    expect(context).toMatchObject({ status: "ready", lens: "architecture", cursor: null });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/#219.*corrupt/);
  });

  test("reads history from the lookback date and merges changed files across commits", () => {
    const { ports, calls } = createFakePorts();
    const context = buildContext(ports, "docs");
    expect(calls).toContain("git.listCommitsSince 2026-11-19T12:00:00.000Z");
    expect(context).toMatchObject({
      status: "ready",
      changedFiles: ["docs/README.md", "foundation/ui/src/c1.ts", "foundation/ui/src/c2.ts"],
      rotationTarget: "docs/guides",
    });
  });

  test("lists unread verification records only for the verification-flakes lens", () => {
    const flakes = buildContext(createFakePorts().ports, "verification-flakes");
    const docs = buildContext(createFakePorts().ports, "docs");
    expect(flakes).toMatchObject({
      unreadVerifications: [{ prNumber: 250, path: "verifications/250.md" }],
    });
    expect(docs).toMatchObject({ unreadVerifications: [] });
  });

  test.each<{ lens: ScoutLens; telemetry: boolean; capabilitySymmetry: boolean }>([
    { lens: "architecture", telemetry: true, capabilitySymmetry: true },
    { lens: "simplification", telemetry: true, capabilitySymmetry: false },
    { lens: "security", telemetry: false, capabilitySymmetry: false },
    { lens: "mcp-db", telemetry: false, capabilitySymmetry: false },
    { lens: "tests", telemetry: false, capabilitySymmetry: false },
    { lens: "docs", telemetry: false, capabilitySymmetry: false },
    { lens: "verification-flakes", telemetry: false, capabilitySymmetry: false },
  ])(
    "collects structural telemetry for $lens only when its policy asks",
    ({ lens, telemetry, capabilitySymmetry }) => {
      const { ports, calls } = createFakePorts();
      const context = buildContext(ports, lens);
      expect(calls.includes("fallow.health")).toBe(telemetry);
      expect("telemetry" in context).toBe(telemetry);
      expect(
        "telemetry" in context && context.telemetry !== undefined
          ? "capabilitySymmetry" in context.telemetry
          : false,
      ).toBe(capabilitySymmetry);
    },
  );

  test("refuses a state issue that is not the open pinned scout state issue", () => {
    const { ports } = createFakePorts();
    ports.issues.viewIssue = (number) => ({ number, state: "CLOSED", title: "other", body: "" });
    expect(() => buildContext(ports, "docs")).toThrow(/#219 must be OPEN/);
  });
});

describe("advancing a lens", () => {
  const options = { lens: "tests" as const, commitSha: "HEAD", target: "foundation/ui" };

  test("records the resolved commit and keeps sibling lens cursors", () => {
    const { ports, edits } = createFakePorts({ body: stateBody({ docs: docsCursor }) });
    const testsCursor = {
      lastCommitSha: "resolved1234567",
      lastCommitDate: "2026-11-25T10:00:00Z",
      lastRotationTarget: "foundation/ui",
      lastRunAt: NOW,
    };
    expect(advanceLens(ports, options)).toEqual({
      status: "advanced",
      lens: "tests",
      cursor: testsCursor,
    });
    expect(edits.map(parseScoutState)).toEqual([
      { kind: "parsed", state: { docs: docsCursor, tests: testsCursor } },
    ]);
  });

  test("refuses a corrupt state marker before resolving the commit or editing the issue", () => {
    const { ports, calls } = createFakePorts({ body: CORRUPT_STATE_BODY });
    expect(() => advanceLens(ports, options)).toThrow(/Refusing to advance.*#219.*corrupt/);
    expect(calls).toEqual(["issues.viewIssue"]);
  });
});
