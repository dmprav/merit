import { describe, expect, test } from "vite-plus/test";

import { readFlagValue, readIntegerFlag } from "./cli.ts";

describe("readFlagValue", () => {
  test("returns null when the flag is absent", () => {
    expect(readFlagValue(["--sha", "abc"], "--round")).toBeNull();
  });

  test("returns the next token, including text that starts with a single dash or a rule", () => {
    expect(readFlagValue(["--reason", "-retry later"], "--reason")).toBe("-retry later");
    expect(readFlagValue(["--body", "---\nnotes"], "--body")).toBe("---\nnotes");
  });

  test.each([
    { args: ["--round"], case: "the flag is last" },
    { args: ["--round", "--sha", "abc"], case: "another option follows" },
  ])("rejects a flag without a value when $case", ({ args }) => {
    expect(() => readFlagValue(args, "--round")).toThrow("--round requires a value.");
  });
});

describe("readIntegerFlag", () => {
  test("returns null when the flag is absent", () => {
    expect(readIntegerFlag([], "--round", 0)).toBeNull();
  });

  test("returns whole numbers at or above the minimum", () => {
    expect(readIntegerFlag(["--round", "0"], "--round", 0)).toBe(0);
    expect(readIntegerFlag(["--issue", "42"], "--issue", 1)).toBe(42);
  });

  test.each(["abc", "3abc", "1.5", "-1", "1e3", "9007199254740993"])("rejects %j", (raw) => {
    expect(() => readIntegerFlag(["--round", raw], "--round", 0)).toThrow(
      `--round must be a whole number of at least 0 (got "${raw}").`,
    );
  });

  test("rejects a number below the minimum", () => {
    expect(() => readIntegerFlag(["--issue", "0"], "--issue", 1)).toThrow(
      '--issue must be a whole number of at least 1 (got "0").',
    );
  });
});
