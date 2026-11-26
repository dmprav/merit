import { describe, expect, test } from "vite-plus/test";

import { parseAdvanceArgs, parseContextArgs } from "./scout.ts";

describe("context arguments", () => {
  test("accepts an explicit lens or auto", () => {
    expect(parseContextArgs(["--lens", "auto"])).toBe("auto");
    expect(parseContextArgs(["--lens", "security"])).toBe("security");
  });

  test("requires --lens and rejects advance-only flags", () => {
    expect(() => parseContextArgs([])).toThrow("Missing required --lens flag.");
    expect(() => parseContextArgs(["--lens", "auto", "--commit", "abc123"])).toThrow(
      "Unknown option '--commit'",
    );
  });
});

describe("advance arguments", () => {
  test("reads the scan tip, rotation target, and optional pull request number", () => {
    expect(
      parseAdvanceArgs([
        "--lens",
        "security",
        "--commit",
        "abc123",
        "--target",
        " apps ",
        "--pr",
        "88",
      ]),
    ).toEqual({ lens: "security", commitSha: "abc123", target: "apps", prNumber: 88 });
    expect(parseAdvanceArgs(["--lens", "security", "--commit", "abc123"])).toEqual({
      lens: "security",
      commitSha: "abc123",
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
    expect(() => parseAdvanceArgs(args)).toThrow(error);
  });
});
