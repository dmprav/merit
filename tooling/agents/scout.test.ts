import { describe, expect, test } from "vite-plus/test";

import { parseScoutArgs } from "./scout.ts";

describe("scout commands", () => {
  test("drops the separator that vp run forwards before the command", () => {
    expect(parseScoutArgs(["--", "context", "--lens", "auto"])).toEqual({
      command: "context",
      lens: "auto",
    });
  });

  test.each([[[]], [["prune"]]])("rejects the unknown command in %j", (args) => {
    expect(() => parseScoutArgs(args)).toThrow(/Unknown scout command ".*"\. Expected "context"/);
  });
});

describe("context arguments", () => {
  test("accepts an explicit lens or auto", () => {
    expect(parseScoutArgs(["context", "--lens", "auto"])).toEqual({
      command: "context",
      lens: "auto",
    });
    expect(parseScoutArgs(["context", "--lens", "security"])).toEqual({
      command: "context",
      lens: "security",
    });
  });

  test("requires --lens and rejects advance-only flags", () => {
    expect(() => parseScoutArgs(["context"])).toThrow("Missing required --lens flag.");
    expect(() => parseScoutArgs(["context", "--lens", "auto", "--commit", "abc123"])).toThrow(
      "Unknown option '--commit'",
    );
  });
});

describe("advance arguments", () => {
  test("reads the scan tip, rotation target, and optional pull request number", () => {
    expect(
      parseScoutArgs([
        "advance",
        "--lens",
        "security",
        "--commit",
        "abc123",
        "--target",
        " apps ",
        "--pr",
        "88",
      ]),
    ).toEqual({
      command: "advance",
      options: { lens: "security", commitSha: "abc123", target: "apps", prNumber: 88 },
    });
    expect(parseScoutArgs(["advance", "--lens", "security", "--commit", "abc123"])).toEqual({
      command: "advance",
      options: { lens: "security", commitSha: "abc123" },
    });
  });

  test.each([
    { args: ["--lens", "auto", "--commit", "abc123"], error: 'Cannot pass "--lens auto"' },
    { args: ["--lens", "security"], error: "Missing required --commit <scanTipSha> flag." },
    {
      args: ["--lens", "security", "--commit", "abc123", "--pr", "next"],
      error: '--pr must be a whole number of at least 1 (got "next").',
    },
    {
      args: ["--lens", "security", "--commit", "abc123", "--target"],
      error: "--target requires a value.",
    },
    {
      args: ["--lens", "security", "--commit", "abc123", "--pr", "88", "--dry-run"],
      error: "Unknown option '--dry-run'",
    },
  ])("rejects $args", ({ args, error }) => {
    expect(() => parseScoutArgs(["advance", ...args])).toThrow(error);
  });
});
