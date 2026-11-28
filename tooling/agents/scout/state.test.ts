import { describe, expect, test } from "vite-plus/test";

import {
  advanceScoutStateBody,
  formatScoutStateBody,
  nextRunCursor,
  parseScoutState,
  scoutStateForReading,
} from "./state.ts";

const batchCursor = { lastCommitSha: "abcdef12", lastRunAt: "2026-11-22T00:00:00Z" };
const areaCursor = { lastCommitSha: "c7e4efa123", lastRunAt: "2026-11-23T00:00:00Z" };

const bodyWith = (state: unknown) =>
  `State store.\n\n<!-- merit-scout-state: ${JSON.stringify(state)} -->`;

describe("scout state marker", () => {
  test("reads a body without a marker as absent", () => {
    expect(parseScoutState("State store.")).toEqual({ kind: "absent" });
  });

  test("round-trips run cursors keyed by run id through the marker", () => {
    const initial = "State store.\n\n<!-- merit-scout-state: {} -->";
    expect(parseScoutState(initial)).toEqual({ kind: "parsed", state: {} });

    const state = {
      "change-batch": batchCursor,
      "area:tooling/agents": {
        lastCommitSha: "c7e4efa123",
        lastCommitDate: "2026-11-22T22:26:16Z",
        lastRunAt: "2026-11-22T23:00:00Z",
      },
      "mechanism:drafts-and-recovery": areaCursor,
      records: { lastPrNumber: 240, lastRunAt: "2026-11-22T00:00:00Z" },
    };
    expect(parseScoutState(formatScoutStateBody(initial, state))).toEqual({
      kind: "parsed",
      state,
    });
  });

  test("writes the marker literally when preserved data contains replacement patterns", () => {
    const initial = "State store.\n\n<!-- merit-scout-state: {} -->";
    const entries = { future: { note: "$& and $1 and $$" } };
    expect(formatScoutStateBody(initial, entries)).toBe(
      `State store.\n\n<!-- merit-scout-state: ${JSON.stringify(entries)} -->`,
    );
  });

  test("drops one invalid cursor without wiping its siblings", () => {
    const partiallyCorrupt = bodyWith({
      "change-batch": batchCursor,
      "area:docs": { lastPrNumber: -5, lastRunAt: "2026-11-22T00:00:00Z" },
    });
    expect(parseScoutState(partiallyCorrupt)).toEqual({
      kind: "parsed",
      state: { "change-batch": batchCursor },
    });
  });

  test("ignores the old lens keys", () => {
    expect(parseScoutState(bodyWith({ docs: batchCursor, "change-batch": areaCursor }))).toEqual({
      kind: "parsed",
      state: { "change-batch": areaCursor },
    });
  });

  test("seeds a missing records cursor from the old verification-flakes cursor", () => {
    const legacy = {
      lastPrNumber: 223,
      lastRunAt: "2026-11-20T00:00:00Z",
      lastRotationTarget: "x",
    };
    expect(parseScoutState(bodyWith({ "verification-flakes": legacy }))).toEqual({
      kind: "parsed",
      state: { records: { lastPrNumber: 223, lastRunAt: "2026-11-20T00:00:00Z" } },
    });
    const own = { lastPrNumber: 240, lastRunAt: "2026-11-25T00:00:00Z" };
    expect(parseScoutState(bodyWith({ "verification-flakes": legacy, records: own }))).toEqual({
      kind: "parsed",
      state: { records: own },
    });
    expect(
      parseScoutState(bodyWith({ "verification-flakes": { lastRunAt: "2026-11-20T00:00:00Z" } })),
    ).toEqual({ kind: "parsed", state: {} });
  });

  test("reads a corrupt marker as empty for due selection but warns which issue to repair", () => {
    const warnings: string[] = [];
    const read = parseScoutState("<!-- merit-scout-state: {docs: 1} -->");
    expect(read.kind).toBe("corrupt");
    expect(read.kind === "corrupt" ? read.error : "").toMatch(/^invalid JSON/);
    expect(scoutStateForReading(read, 219, (message) => warnings.push(message))).toEqual({});
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/#219.*corrupt[\s\S]*gh issue edit 219/);
  });

  test("reads parsed and absent markers without warning", () => {
    const warnings: string[] = [];

    const warn = (message: string) => warnings.push(message);

    expect(
      scoutStateForReading({ kind: "parsed", state: { "change-batch": batchCursor } }, 219, warn),
    ).toEqual({ "change-batch": batchCursor });
    expect(scoutStateForReading({ kind: "absent" }, 219, warn)).toEqual({});
    expect(warnings).toEqual([]);
  });
});

describe("advancing scout state", () => {
  const nextCursor = () => areaCursor;

  test("records the next cursor while keeping sibling run cursors", () => {
    expect(
      parseScoutState(
        advanceScoutStateBody({
          issueNumber: 219,
          issueBody: bodyWith({ "change-batch": batchCursor }),
          runId: "area:tooling/agents",
          nextCursor,
        }).body,
      ),
    ).toEqual({
      kind: "parsed",
      state: { "change-batch": batchCursor, "area:tooling/agents": areaCursor },
    });
  });

  test("keeps run-id entries it cannot validate and drops the old lens keys", () => {
    const shortSha = { lastCommitSha: "abc", lastRunAt: "2026-11-22T00:00:00Z" };
    const issueBody = bodyWith({
      "change-batch": shortSha,
      docs: batchCursor,
      "verification-flakes": { lastRunAt: "2026-11-21T00:00:00Z" },
    });

    const { body } = advanceScoutStateBody({
      issueNumber: 219,
      issueBody,
      runId: "area:docs",
      nextCursor,
    });

    expect(body).toBe(bodyWith({ "change-batch": shortSha, "area:docs": areaCursor }));
  });

  test("seeds a missing records cursor from verification-flakes when another run advances", () => {
    const { body } = advanceScoutStateBody({
      issueNumber: 219,
      issueBody: bodyWith({
        "verification-flakes": { lastPrNumber: 223, lastRunAt: "2026-11-20T00:00:00Z" },
        docs: batchCursor,
      }),
      runId: "change-batch",
      nextCursor,
    });

    expect(parseScoutState(body)).toEqual({
      kind: "parsed",
      state: {
        records: { lastPrNumber: 223, lastRunAt: "2026-11-20T00:00:00Z" },
        "change-batch": areaCursor,
      },
    });
    expect(body).not.toContain("verification-flakes");
  });

  test("hands the seeded records cursor to the records run as its previous cursor", () => {
    const previous: unknown[] = [];
    advanceScoutStateBody({
      issueNumber: 219,
      issueBody: bodyWith({
        "verification-flakes": { lastPrNumber: 223, lastRunAt: "2026-11-20T00:00:00Z" },
      }),
      runId: "records",
      nextCursor: (cursor) => {
        previous.push(cursor);
        return areaCursor;
      },
    });
    expect(previous).toEqual([{ lastPrNumber: 223, lastRunAt: "2026-11-20T00:00:00Z" }]);
  });

  test("replaces the advanced run's own invalid cursor and passes it on as no previous cursor", () => {
    const previous: unknown[] = [];
    const { body } = advanceScoutStateBody({
      issueNumber: 219,
      issueBody: bodyWith({ "change-batch": { lastCommitSha: "abc" } }),
      runId: "change-batch",
      nextCursor: (cursor) => {
        previous.push(cursor);
        return areaCursor;
      },
    });

    expect(previous).toEqual([undefined]);
    expect(body).toBe(bodyWith({ "change-batch": areaCursor }));
  });

  test.each([
    {
      name: "a trailing comma inside the marker JSON",
      issueBody: `State store.\n\n<!-- merit-scout-state: {"change-batch":${JSON.stringify(batchCursor)},} -->`,
    },
    {
      name: "a truncated marker",
      issueBody: `State store.\n\n<!-- merit-scout-state: {"change-batch":${JSON.stringify(batchCursor)}`,
    },
  ])("refuses to overwrite $name instead of erasing sibling cursors", ({ issueBody }) => {
    expect(() =>
      advanceScoutStateBody({ issueNumber: 219, issueBody, runId: "records", nextCursor }),
    ).toThrow(/#219.*corrupt[\s\S]*gh issue edit 219/);
  });
});

describe("next run cursor", () => {
  const run = {
    commitSha: "c7e4efa123",
    commitDate: "2026-11-23T00:00:00Z",
    runAt: new Date("2026-11-23T01:00:00Z"),
  };
  const previous = {
    lastCommitSha: "abcdef12",
    lastPrNumber: 210,
    lastRunAt: "2026-11-22T00:00:00Z",
  };

  test("carries the previous pull request forward", () => {
    expect(nextRunCursor({ ...run, previous, prNumber: undefined })).toEqual({
      lastCommitSha: "c7e4efa123",
      lastCommitDate: "2026-11-23T00:00:00Z",
      lastPrNumber: 210,
      lastRunAt: "2026-11-23T01:00:00.000Z",
    });
  });

  test("replaces the pull request the run passes", () => {
    expect(nextRunCursor({ ...run, previous, prNumber: 230 })).toMatchObject({
      lastPrNumber: 230,
    });
  });

  test("omits a pull request no run has recorded", () => {
    expect(nextRunCursor({ ...run, previous: undefined, prNumber: undefined })).toEqual({
      lastCommitSha: "c7e4efa123",
      lastCommitDate: "2026-11-23T00:00:00Z",
      lastRunAt: "2026-11-23T01:00:00.000Z",
    });
  });
});
