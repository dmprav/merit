import path from "node:path";

import { describe, expect, test } from "vite-plus/test";

import { parseBuildArgs } from "./build.ts";

describe("design-system build arguments", () => {
  test("writes beside the script by default and drops the separator vp run forwards", () => {
    const defaultOutput = path.join(import.meta.dirname, "dist");

    expect(parseBuildArgs([])).toBe(defaultOutput);
    expect(parseBuildArgs(["--"])).toBe(defaultOutput);
    expect(parseBuildArgs(["--", "out/ds"])).toBe(path.resolve("out/ds"));
  });

  test.each([
    { args: ["--ouput", "out/ds"], error: "Unknown option '--ouput'" },
    { args: ["-o"], error: "Unknown option '-o'" },
    { args: ["out/ds", "extra"], error: "Expected at most one output directory, got 2." },
  ])("rejects $args before anything is deleted", ({ args, error }) => {
    expect(() => parseBuildArgs(args)).toThrow(error);
    expect(() => parseBuildArgs(args)).toThrow("Usage: build.ts [output-dir]");
  });
});
