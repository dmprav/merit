import { describe, expect, test } from "vite-plus/test";

import {
  advanceScoutStateBody,
  formatScoutStateBody,
  nextLensCursor,
  parseScoutState,
  scoutStateForReading,
} from "./state.ts";

const docsCursor = { lastCommitSha: "abcdef12", lastRunAt: "2026-11-22T00:00:00Z" };
const testsCursor = { lastCommitSha: "c7e4efa123", lastRunAt: "2026-11-23T00:00:00Z" };

describe("scout state marker", () => {
  test("reads a body without a marker as absent", () => {
    expect(parseScoutState("State store.")).toEqual({ kind: "absent" });
  });

  test("round-trips lens cursors through the marker", () => {
    const initial = "State store.\n\n<!-- merit-scout-state: {} -->";
    expect(parseScoutState(initial)).toEqual({ kind: "parsed", state: {} });

    const tests = {
      lastCommitSha: "c7e4efa123",
      lastCommitDate: "2026-11-22T22:26:16Z",
      lastRotationTarget: "capabilities/reviews",
      lastRunAt: "2026-11-22T23:00:00Z",
    };
    expect(parseScoutState(formatScoutStateBody(initial, { tests }))).toEqual({
      kind: "parsed",
      state: { tests },
    });
  });

  test("drops one invalid lens cursor without wiping its siblings", () => {
    const partiallyCorrupt =
      '<!-- merit-scout-state: {"docs":{"lastCommitSha":"abcdef12","lastRunAt":"2026-11-22T00:00:00Z"},"tests":{"lastPrNumber":-5,"lastRunAt":"2026-11-22T00:00:00Z"}} -->';
    expect(parseScoutState(partiallyCorrupt)).toEqual({
      kind: "parsed",
      state: { docs: docsCursor },
    });
  });

  test("reads a corrupt marker as empty for lens selection but warns which issue to repair", () => {
    const warnings: string[] = [];

    const warn = (message: string) => warnings.push(message);

    const read = parseScoutState("<!-- merit-scout-state: {docs: 1} -->");
    expect(read.kind).toBe("corrupt");
    expect(read.kind === "corrupt" ? read.error : "").toMatch(/^invalid JSON/);
    expect(scoutStateForReading(read, 219, warn)).toEqual({});
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/#219.*corrupt[\s\S]*gh issue edit 219/);
  });

  test("reads parsed and absent markers without warning", () => {
    const warnings: string[] = [];

    const warn = (message: string) => warnings.push(message);

    expect(
      scoutStateForReading({ kind: "parsed", state: { docs: docsCursor } }, 219, warn),
    ).toEqual({ docs: docsCursor });
    expect(scoutStateForReading({ kind: "absent" }, 219, warn)).toEqual({});
    expect(warnings).toEqual([]);
  });
});

describe("advancing scout state", () => {
  const nextCursor = () => testsCursor;

  test("records the next cursor while keeping sibling lens cursors", () => {
    const healthy = `State store.\n\n<!-- merit-scout-state: ${JSON.stringify({ docs: docsCursor })} -->`;
    expect(
      parseScoutState(
        advanceScoutStateBody({ issueNumber: 219, issueBody: healthy, lens: "tests", nextCursor })
          .body,
      ),
    ).toEqual({ kind: "parsed", state: { docs: docsCursor, tests: testsCursor } });
  });

  test.each([
    {
      name: "a trailing comma inside the marker JSON",
      issueBody: `State store.\n\n<!-- merit-scout-state: {"docs":${JSON.stringify(docsCursor)},} -->`,
    },
    {
      name: "a truncated marker",
      issueBody: `State store.\n\n<!-- merit-scout-state: {"docs":${JSON.stringify(docsCursor)}`,
    },
  ])("refuses to overwrite $name instead of erasing sibling cursors", ({ issueBody }) => {
    expect(() =>
      advanceScoutStateBody({ issueNumber: 219, issueBody, lens: "tests", nextCursor }),
    ).toThrow(/#219.*corrupt[\s\S]*gh issue edit 219/);
  });
});

describe("next lens cursor", () => {
  const run = {
    commitSha: "c7e4efa123",
    commitDate: "2026-11-23T00:00:00Z",
    runAt: new Date("2026-11-23T01:00:00Z"),
  };
  const previous = {
    lastCommitSha: "abcdef12",
    lastPrNumber: 210,
    lastRotationTarget: "capabilities/reviews",
    lastRunAt: "2026-11-22T00:00:00Z",
  };

  test("carries the previous pull request and rotation target forward", () => {
    expect(nextLensCursor({ ...run, previous, target: undefined, prNumber: undefined })).toEqual({
      lastCommitSha: "c7e4efa123",
      lastCommitDate: "2026-11-23T00:00:00Z",
      lastPrNumber: 210,
      lastRotationTarget: "capabilities/reviews",
      lastRunAt: "2026-11-23T01:00:00.000Z",
    });
  });

  test("replaces the pull request and rotation target the run passes", () => {
    expect(
      nextLensCursor({ ...run, previous, target: "capabilities/rounds", prNumber: 230 }),
    ).toMatchObject({ lastPrNumber: 230, lastRotationTarget: "capabilities/rounds" });
  });

  test("omits a pull request and rotation target no run has recorded", () => {
    expect(
      nextLensCursor({ ...run, previous: undefined, target: undefined, prNumber: undefined }),
    ).toEqual({
      lastCommitSha: "c7e4efa123",
      lastCommitDate: "2026-11-23T00:00:00Z",
      lastRunAt: "2026-11-23T01:00:00.000Z",
    });
  });
});
