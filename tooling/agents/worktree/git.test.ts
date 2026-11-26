import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test, vi } from "vite-plus/test";

import { linkedCheckoutPaths, parseGitWorktreePorcelain, resolvePrimaryRepoRoot } from "./git.ts";
import {
  git,
  initTempRepo,
  isolatedGitEnv,
  makeTempDir,
  useWorktreeFixtures,
} from "./tests/fixtures.ts";

useWorktreeFixtures();

test("fixture Git commands ignore inherited repository selectors", () => {
  const decoy = makeTempDir("merit-worktree-decoy-");
  execFileSync("git", ["init", "-q", "-b", "main", decoy], { env: isolatedGitEnv() });
  const decoyConfig = readFileSync(join(decoy, ".git/config"), "utf8");
  vi.stubEnv("GIT_DIR", join(decoy, ".git"));
  vi.stubEnv("GIT_INDEX_FILE", join(decoy, ".git/index"));

  const repo = initTempRepo();

  expect(git(repo, ["config", "user.name"])).toBe("Test");
  expect(readFileSync(join(decoy, ".git/config"), "utf8")).toBe(decoyConfig);
  expect(existsSync(join(decoy, ".git/index"))).toBe(false);
});

describe("parseGitWorktreePorcelain", () => {
  test("parses -z output, keeping trailing spaces in paths and the locked state", () => {
    const parsed = parseGitWorktreePorcelain(
      [
        "worktree /repo",
        "HEAD abcdef1234",
        "branch refs/heads/main",
        "",
        "worktree /repo/.tmp/worktrees/trailing space ",
        "HEAD 1234567890",
        "branch refs/heads/worktree/alpha",
        "locked reason here",
        "",
        "",
      ].join("\0"),
    );

    expect(parsed).toEqual([
      { path: "/repo", head: "abcdef1234", branch: "main" },
      {
        path: "/repo/.tmp/worktrees/trailing space ",
        head: "1234567890",
        branch: "worktree/alpha",
        locked: true,
      },
    ]);
  });

  test("parses newline output with detached and prunable entries", () => {
    const parsed = parseGitWorktreePorcelain(
      [
        "worktree /repo",
        "HEAD abcdef1234",
        "branch refs/heads/main",
        "",
        "worktree /repo/.tmp/worktrees/gone",
        "HEAD 1234567890",
        "detached",
        "prunable gitdir file points to non-existent location",
        "",
      ].join("\n"),
    );

    expect(parsed).toEqual([
      { path: "/repo", head: "abcdef1234", branch: "main" },
      { path: "/repo/.tmp/worktrees/gone", head: "1234567890", prunable: true },
    ]);
  });
});

test("lists linked checkouts that still exist, excluding the primary checkout", () => {
  expect(
    linkedCheckoutPaths(
      [
        { path: "/repo" },
        { path: "/repo/.tmp/worktrees/alpha" },
        { path: "/repo/.tmp/worktrees/gone", prunable: true },
      ],
      "/repo",
    ),
  ).toEqual(["/repo/.tmp/worktrees/alpha"]);
});

test("resolves the primary repository root from inside a linked worktree", () => {
  const repo = initTempRepo();
  const linked = join(makeTempDir("merit-linked-"), "linked");
  git(repo, ["worktree", "add", "-b", "feat/linked", linked, "main"]);

  expect(resolvePrimaryRepoRoot(linked)).toBe(repo);
  expect(resolvePrimaryRepoRoot(repo)).toBe(repo);
});
