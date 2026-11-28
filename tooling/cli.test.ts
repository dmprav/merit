import { describe, expect, test } from "vite-plus/test";

import { parseCliArgs, parseWholeNumber } from "./cli.ts";

describe("parseCliArgs", () => {
  const spec = {
    options: { reason: { type: "string" }, json: { type: "boolean" } },
    usage: "Usage: tool [--reason <text>] [--json]",
  } as const;

  test("drops the forwarded separator and accepts --flag value and --flag=value", () => {
    expect(parseCliArgs(["--", "--reason", "retry", "--json"], spec).values).toEqual({
      reason: "retry",
      json: true,
    });
    expect(parseCliArgs(["--reason=--literal"], spec).values).toEqual({ reason: "--literal" });
  });

  test("keeps text that starts with a single dash or a rule as the value", () => {
    expect(parseCliArgs(["--reason", "-retry later"], spec).values.reason).toBe("-retry later");
    expect(parseCliArgs(["--reason", "---\nnotes"], spec).values.reason).toBe("---\nnotes");
  });

  test.each([
    { args: ["--reason"], error: "--reason requires a value." },
    { args: ["--reason", "--json"], error: "--reason requires a value." },
    { args: ["--reason", "--"], error: "--reason requires a value." },
    { args: ["--reasn", "x"], error: "Unknown option '--reasn'" },
    { args: ["--json=yes"], error: "Option '--json' does not take an argument" },
    { args: ["extra"], error: "Unexpected argument 'extra'" },
  ])("rejects $args with the usage", ({ args, error }) => {
    expect(() => parseCliArgs(args, spec)).toThrow(error);
    expect(() => parseCliArgs(args, spec)).toThrow(spec.usage);
  });

  test("returns positionals only when the command accepts them", () => {
    expect(
      parseCliArgs(["slug", "--json"], { ...spec, allowPositionals: true }).positionals,
    ).toEqual(["slug"]);
  });
});

describe("parseWholeNumber", () => {
  test("returns whole numbers at or above the minimum", () => {
    expect(parseWholeNumber("0", "--round", 0)).toBe(0);
    expect(parseWholeNumber("42", "<issue-number>")).toBe(42);
  });

  test.each(["", "abc", "12abc", "1.5", "-1", "+1", "1e3", "0x10", "007", "9007199254740993"])(
    "rejects %j",
    (raw) => {
      expect(() => parseWholeNumber(raw, "--round", 0)).toThrow(
        `--round must be a whole number of at least 0 (got "${raw}").`,
      );
    },
  );

  test("rejects a number below the minimum", () => {
    expect(() => parseWholeNumber("0", "<issue-number>")).toThrow(
      '<issue-number> must be a whole number of at least 1 (got "0").',
    );
  });
});
