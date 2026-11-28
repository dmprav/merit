import { join } from "node:path";

import { expect, test, vi } from "vite-plus/test";

import { buildLocalDatabaseUrl } from "../../scripts/local-postgres.ts";
import { resetLocalDatabase } from "../../scripts/reset-db.ts";
import { writeCheckoutToken } from "./checkout-identity.ts";
import {
  readWorktreeRegistry,
  withWorktreeRegistryLock,
  writeWorktreeRegistry,
} from "./registry.ts";
import {
  createIn,
  fakeDatabase,
  git,
  initTempRepo,
  useWorktreeFixtures,
} from "./tests/fixtures.ts";

useWorktreeFixtures();

test("records a database created by reset even when migration subsequently fails", async () => {
  const repo = initTempRepo();
  const worktree = await createIn(repo, { slug: "late-db" });
  const recreate = vi.fn(async () => {});
  await expect(
    resetLocalDatabase({
      cwd: worktree.path,
      worktreeDatabaseUrl: worktree.databaseUrl,
      env: { DATABASE_URL: worktree.databaseUrl },
      recreate,
      exec: () => {
        throw new Error("migration failed");
      },
    }),
  ).rejects.toThrow("migration failed");
  expect(recreate).toHaveBeenCalledOnce();
  expect(readWorktreeRegistry(repo).worktrees["late-db"]?.databaseCreated).toBe(true);
});

test("a failed recreation releases the registry lock and leaves no proof to drop a replacement", async () => {
  const repo = initTempRepo();
  const worktree = await createIn(
    repo,
    { slug: "owned", dbMode: "required" },
    {
      database: fakeDatabase({ isReachable: async () => true }),
    },
  );
  expect(readWorktreeRegistry(repo).worktrees.owned?.databaseCreated).toBe(true);
  const recreate = vi.fn(async () => {
    expect(readWorktreeRegistry(repo).worktrees.owned?.databaseCreated).toBe(false);
    await expect(withWorktreeRegistryLock(repo, () => {}, { timeoutMs: 0 })).rejects.toThrow(
      /lock/,
    );
    throw new Error("create failed after drop");
  });
  await expect(
    resetLocalDatabase({
      cwd: worktree.path,
      worktreeDatabaseUrl: worktree.databaseUrl,
      env: { DATABASE_URL: worktree.databaseUrl },
      recreate,
      exec: vi.fn(),
    }),
  ).rejects.toThrow("create failed after drop");
  expect(recreate).toHaveBeenCalledOnce();
  await withWorktreeRegistryLock(
    repo,
    () => {
      expect(readWorktreeRegistry(repo).worktrees.owned?.databaseCreated).toBe(false);
    },
    { timeoutMs: 0 },
  );
});

test.each([
  "clean claimed the worktree",
  "a new checkout replaced it",
  "the database name changed",
])("refuses a registered reset when %s", async (change) => {
  const repo = initTempRepo();
  const worktree = await createIn(repo, { slug: "alpha" });
  const registry = readWorktreeRegistry(repo);
  const record = registry.worktrees.alpha!;
  if (change === "clean claimed the worktree") {
    record.status = "cleaning";
  } else if (change === "a new checkout replaced it") {
    writeCheckoutToken(record.gitDir!, "replacement");
  } else {
    record.databaseName = "merit_other";
  }
  writeWorktreeRegistry(repo, registry);
  const recreate = vi.fn(async () => {});
  await expect(
    resetLocalDatabase({
      cwd: worktree.path,
      worktreeDatabaseUrl: worktree.databaseUrl,
      env: { DATABASE_URL: worktree.databaseUrl },
      recreate,
      exec: vi.fn(),
    }),
  ).rejects.toThrow(/this checkout no longer matches an active registration/);
  expect(recreate).not.toHaveBeenCalled();
  expect(readWorktreeRegistry(repo).worktrees.alpha?.databaseCreated).toBe(false);
});

test("resets the configured database of an unmanaged linked checkout", async () => {
  const repo = initTempRepo();
  const linked = join(repo, "linked");
  git(repo, ["worktree", "add", "--detach", linked]);
  const recreate = vi.fn(async () => {});
  const worktreeDatabaseUrl = buildLocalDatabaseUrl("merit_alpha");
  const result = await resetLocalDatabase({
    cwd: linked,
    env: { DATABASE_URL: worktreeDatabaseUrl },
    worktreeDatabaseUrl,
    exec: vi.fn(),
    recreate,
  });
  expect(result).toMatchObject({ mode: "worktree", database: { databaseName: "merit_alpha" } });
  expect(recreate).toHaveBeenCalledOnce();
  expect(readWorktreeRegistry(repo).worktrees).toEqual({});
});
