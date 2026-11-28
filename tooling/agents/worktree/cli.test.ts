import { describe, expect, test } from "vite-plus/test";

import { parseCleanArgs, parseCreateArgs, parseListArgs } from "./cli.ts";

describe("parseCreateArgs", () => {
  test("reads every option", () => {
    expect(
      parseCreateArgs([
        "--",
        "feat-one",
        "--base",
        "main",
        "--branch",
        "feat/custom",
        "--dir",
        "/tmp/custom",
        "--with-db",
        "--doctor",
        "--json",
      ]),
    ).toEqual({
      slug: "feat-one",
      base: "main",
      branch: "feat/custom",
      dir: "/tmp/custom",
      dbMode: "required",
      doctor: true,
      json: true,
    });
  });

  test.each([
    { args: ["feat-two"], dbMode: "auto" },
    { args: ["feat-two", "--no-db"], dbMode: "skip" },
  ])("reads the database mode from $args", ({ args, dbMode }) => {
    expect(parseCreateArgs(args)).toMatchObject({
      slug: "feat-two",
      dbMode,
      doctor: false,
      json: false,
    });
  });

  test.each([
    { args: ["feat-two", "--with-db", "--no-db"], error: /Cannot combine --with-db and --no-db/ },
    { args: [], error: /Missing <slug>/ },
    { args: ["feat-two", "--unknown"], error: /Unknown option/ },
    { args: ["feat-two", "--base"], error: "--base requires a value." },
    {
      args: ["feat-two", "--branch", "-x"],
      error: '--branch requires a value that does not start with "-" (got "-x").',
    },
    {
      args: ["feat-two", "feat-three"],
      error: 'Unexpected extra positional argument "feat-three".',
    },
    { args: ["Bad"], error: /Invalid worktree slug "Bad"/ },
  ])("rejects $args", ({ args, error }) => {
    expect(() => parseCreateArgs(args)).toThrow(error);
  });
});

describe("parseListArgs", () => {
  test("reads --json", () => {
    expect(parseListArgs(["--json"])).toEqual({ json: true });
  });

  test("rejects unknown options", () => {
    expect(() => parseListArgs(["--bad"])).toThrow(/Unknown option/);
  });
});

describe("parseCleanArgs", () => {
  test("reads every option", () => {
    expect(parseCleanArgs(["feat-one", "--keep-branch", "--json"])).toEqual({
      slug: "feat-one",
      keepBranch: true,
      json: true,
    });
  });

  test("requires a slug", () => {
    expect(() => parseCleanArgs([])).toThrow(/Missing <slug>/);
  });
});
