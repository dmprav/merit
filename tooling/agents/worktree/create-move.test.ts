import { existsSync, symlinkSync, unlinkSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "vite-plus/test";

import {
  readWorktreeRegistry,
  withWorktreeRegistryLock,
  writeWorktreeRegistry,
} from "./registry.ts";
import {
  cleanIn,
  createDeferred,
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
        } else if (args.includes("config")) {
          expect(cwd).toBe(moved);
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
          if (
            phase === "rollback" &&
            existsSync(original) &&
            !existsSync(moved) &&
            isGitCommand(args, "rev-parse", "--git-common-dir")
          ) {
            git(repo, ["worktree", "move", original, moved]);
            symlinkSync(moved, original, "dir");
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
    await expect(creating).rejects.toThrow("vp run worktree:clean alpha");
    expect(readWorktreeRegistry(repo).worktrees.alpha).toMatchObject({
      status: "cleaning",
      databaseCreated: true,
      path: original,
    });
    expect(readWorktreeRegistry(repo).worktrees.alpha?.ownerPid).toBeUndefined();
    await expect(cleanIn(repo, "alpha", { database })).rejects.toThrow(moved);
    expect(dropped).toEqual([]);
    if (!existsSync(original)) {
      symlinkSync(moved, original, "dir");
    }
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

test("reports the live path when the checkout moves while activation waits for the registry", async () => {
  const repo = initTempRepo();
  const original = join(repo, ".tmp/worktrees/alpha");
  const moved = join(makeTempDir("merit-activation-move-"), "moved");
  const acquired = createDeferred();
  const release = createDeferred();
  let holding: Promise<void> | undefined;
  const result = await createIn(
    repo,
    { slug: "alpha" },
    {
      execCommand: async (_command, args) => {
        if (args.includes("config")) {
          holding = withWorktreeRegistryLock(repo, () => {
            acquired.resolve();
            return release.promise;
          });
          await acquired.promise;
        }
      },
      lockOptions: {
        onLockHeld: () => {
          if (existsSync(original)) {
            try {
              git(repo, ["worktree", "move", original, moved]);
            } finally {
              release.resolve();
            }
          }
        },
      },
    },
  );
  await holding;
  expect(result.path).toBe(moved);
});

test("prevents a Git move while rollback is removing its checkout", async () => {
  const repo = initTempRepo();
  const original = join(repo, ".tmp/worktrees/alpha");
  const moved = join(makeTempDir("merit-removal-move-"), "moved");
  let moveRefused = false;
  await expect(
    createIn(
      repo,
      { slug: "alpha" },
      {
        execCommand: () => {
          throw new Error("install failed");
        },
        execGit: gitWith((args) => {
          if (isGitCommand(args, "worktree", "remove")) {
            try {
              git(repo, ["worktree", "move", original, moved]);
              symlinkSync(moved, original, "dir");
            } catch (error) {
              moveRefused = String(error).includes("locked");
            }
          }
        }),
      },
    ),
  ).rejects.toThrow("install failed");
  expect(moveRefused).toBe(true);
  expect(existsSync(original)).toBe(false);
  expect(readWorktreeRegistry(repo).worktrees.alpha).toBeUndefined();
});
