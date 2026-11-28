import { existsSync, symlinkSync, unlinkSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "vite-plus/test";

import { readWorktreeRegistry, writeWorktreeRegistry } from "./registry.ts";
import {
  cleanIn,
  createIn,
  fakeDatabase,
  git,
  gitWith,
  initTempRepo,
  isGitCommand,
  listIn,
  makeTempDir,
  useWorktreeFixtures,
} from "./tests/fixtures.ts";

useWorktreeFixtures();

test("activates and lists a checkout moved during bootstrap through a symlink", async () => {
  const repo = initTempRepo();
  const moved = join(makeTempDir("merit-bootstrap-move-"), "moved");

  const result = await createIn(
    repo,
    { slug: "alpha" },
    {
      execCommand: (_command, args, { cwd }) => {
        if (args.includes("install")) {
          git(repo, ["worktree", "move", cwd, moved]);
          symlinkSync(moved, cwd, "dir");
        }
      },
    },
  );

  expect(readWorktreeRegistry(repo).worktrees.alpha?.status).toBe("active");
  expect(result.path).toBe(moved);
  expect(listIn(repo)).toMatchObject([{ slug: "alpha", path: moved }]);
});

test.each(["doctor", "rollback"])(
  "keeps a checkout moved during %s and its database until clean can recover them",
  async (phase) => {
    const repo = initTempRepo();
    const original = join(repo, ".tmp/worktrees/alpha");
    const moved = join(makeTempDir("merit-doctor-move-"), "moved");
    const dropped: string[] = [];
    const database = fakeDatabase({
      isReachable: async () => true,
      drop: async (name) => {
        dropped.push(name);
      },
    });

    const creating = createIn(
      repo,
      { slug: "alpha", doctor: true, dbMode: "required" },
      {
        database,
        execGit: gitWith((args) => {
          if (phase === "rollback" && isGitCommand(args, "worktree", "remove")) {
            git(repo, ["worktree", "move", original, moved]);
          }
        }),
        execCommand: (_command, args, { cwd }) => {
          if (args.includes("--doctor")) {
            if (phase === "doctor") {
              git(repo, ["worktree", "move", cwd, moved]);
            }
            throw new Error("doctor failed");
          }
        },
      },
    );

    await expect(creating).rejects.toThrow("doctor failed");
    expect(dropped).toEqual([]);
    await expect(creating).rejects.toThrow(moved);
    expect(readWorktreeRegistry(repo).worktrees.alpha).toMatchObject({
      status: "cleaning",
      databaseCreated: true,
      path: original,
    });
    expect(readWorktreeRegistry(repo).worktrees.alpha?.ownerPid).toBeUndefined();
    await expect(cleanIn(repo, "alpha", { database })).rejects.toThrow(moved);
    expect(dropped).toEqual([]);
    symlinkSync(moved, original, "dir");
    await expect(cleanIn(repo, "alpha", { database })).rejects.toThrow(moved);
    unlinkSync(original);
    git(repo, ["worktree", "move", moved, original]);
    await expect(cleanIn(repo, "alpha", { database })).resolves.toMatchObject({
      worktreeRemoved: true,
      registryRemoved: true,
    });
    expect(existsSync(original)).toBe(false);
    expect(dropped).toEqual(["merit_alpha"]);
  },
);

test("rejects activation when another attempt holds the same slug and path", async () => {
  const repo = initTempRepo();
  const creating = createIn(
    repo,
    { slug: "alpha" },
    {
      execCommand: (_command, args) => {
        if (args.includes("config")) {
          const registry = readWorktreeRegistry(repo);
          registry.worktrees.alpha!.checkoutToken = "another-attempt";
          writeWorktreeRegistry(repo, registry);
        }
      },
    },
  );
  await expect(creating).rejects.toThrow("registry claim");
  expect(readWorktreeRegistry(repo).worktrees.alpha).toMatchObject({
    status: "creating",
    checkoutToken: "another-attempt",
  });
});
