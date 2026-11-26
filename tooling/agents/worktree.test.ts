import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { expect, test } from "vite-plus/test";

import {
  createIn,
  initTempRepo,
  isolatedGitEnv,
  useWorktreeFixtures,
} from "./worktree/tests/fixtures.ts";

useWorktreeFixtures();

const ENTRY_POINT = fileURLToPath(new URL("./worktree.ts", import.meta.url));

const runCli = (cwd: string, args: readonly string[]) =>
  spawnSync(process.execPath, [ENTRY_POINT, ...args], {
    cwd,
    encoding: "utf8",
    env: isolatedGitEnv(),
  });

test("lists worktrees as JSON from the command line", async () => {
  const repo = initTempRepo();
  const alpha = await createIn(repo, { slug: "alpha" });

  const { status, stdout } = runCli(alpha.path, ["list", "--json"]);

  expect(status).toBe(0);
  expect(JSON.parse(stdout)).toEqual({
    worktrees: [expect.objectContaining({ slug: "alpha", path: alpha.path })],
  });
});

test("prints a summary when no worktrees are active", () => {
  const { status, stdout } = runCli(initTempRepo(), ["list"]);

  expect(status).toBe(0);
  expect(stdout).toBe("No active worktrees.\n");
});

test("exits with an error for an unknown command", () => {
  const { status, stderr } = runCli(initTempRepo(), ["prune"]);

  expect(status).not.toBe(0);
  expect(stderr).toContain(
    'Unknown worktree command "prune". Expected "create", "list", or "clean".',
  );
});
