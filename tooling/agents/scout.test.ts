import { describe, expect, test } from "vite-plus/test";

import { parseScoutArgs } from "./scout.ts";

describe("scout commands", () => {
  test("drops the separator that vp run forwards before the command", () => {
    expect(parseScoutArgs(["--", "context", "--run", "records"])).toEqual({
      command: "context",
      runId: "records",
    });
  });

  test.each([[[]], [["prune"]]])("rejects the unknown command in %j", (args) => {
    expect(() => parseScoutArgs(args)).toThrow(
      /Unknown scout command ".*"\. Expected "due", "context", "start", or "advance"/,
    );
  });
});

describe("due arguments", () => {
  test("takes no flags", () => {
    expect(parseScoutArgs(["due"])).toEqual({ command: "due" });
    expect(() => parseScoutArgs(["due", "--run", "records"])).toThrow("Unknown option '--run'");
  });
});

describe("context arguments", () => {
  test("reads the run id", () => {
    expect(parseScoutArgs(["context", "--run", "area:tooling/agents"])).toEqual({
      command: "context",
      runId: "area:tooling/agents",
    });
  });

  test("requires --run and rejects --lens and advance-only flags", () => {
    expect(() => parseScoutArgs(["context"])).toThrow("Missing required --run flag.");
    expect(() => parseScoutArgs(["context", "--lens", "auto"])).toThrow("Unknown option '--lens'");
    expect(() => parseScoutArgs(["context", "--run", "records", "--commit", "abc123"])).toThrow(
      "Unknown option '--commit'",
    );
  });
});

describe("start arguments", () => {
  test("reads one or more run ids", () => {
    expect(parseScoutArgs(["start", "--run", "records"])).toEqual({
      command: "start",
      runIds: ["records"],
    });
    expect(parseScoutArgs(["start", "--run", "records", "--run", "change-batch"])).toEqual({
      command: "start",
      runIds: ["records", "change-batch"],
    });
  });

  test("requires --run and rejects other flags", () => {
    expect(() => parseScoutArgs(["start"])).toThrow("Missing required --run flag.");
    expect(() => parseScoutArgs(["start", "--run", "records", "--commit", "abc123"])).toThrow(
      "Unknown option '--commit'",
    );
  });
});

describe("advance arguments", () => {
  test("reads the run, scan tip, and optional pull request number", () => {
    expect(
      parseScoutArgs(["advance", "--run", "records", "--commit", "abc123", "--pr", "88"]),
    ).toEqual({
      command: "advance",
      options: { runId: "records", commitSha: "abc123", prNumber: 88 },
    });
    expect(parseScoutArgs(["advance", "--run", "change-batch", "--commit", "abc123"])).toEqual({
      command: "advance",
      options: { runId: "change-batch", commitSha: "abc123" },
    });
  });

  test.each([
    { args: ["--commit", "abc123"], error: "Missing required --run flag." },
    { args: ["--run", "records"], error: "Missing required --commit <scanTipSha> flag." },
    {
      args: ["--run", "records", "--commit", "abc123", "--pr", "next"],
      error: '--pr must be a whole number of at least 1 (got "next").',
    },
    { args: ["--lens", "docs", "--commit", "abc123"], error: "Unknown option '--lens'" },
    {
      args: ["--run", "records", "--commit", "abc123", "--target", "x"],
      error: "Unknown option '--target'",
    },
    {
      args: ["--run", "records", "--commit", "abc123", "--pr", "88", "--dry-run"],
      error: "Unknown option '--dry-run'",
    },
  ])("rejects $args", ({ args, error }) => {
    expect(() => parseScoutArgs(["advance", ...args])).toThrow(error);
  });
});
