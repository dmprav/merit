import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, vi } from "vite-plus/test";

import { buildLocalDatabaseUrl } from "../../../scripts/local-postgres.ts";
import { cleanWorktree, type CleanWorktreeRequest } from "../clean.ts";
import { createWorktree, type CreateWorktreeRequest } from "../create.ts";
import { type WorktreeDatabase } from "../database.ts";
import { type WorktreeDeps } from "../deps.ts";
import { defaultExecGit, type ExecGit } from "../git.ts";
import { listWorktrees } from "../list.ts";
import { WORKTREE_PORT_BASES } from "../ports.ts";
import { readWorktreeRegistry, type WorktreeRecord, writeWorktreeRegistry } from "../registry.ts";

// Variables that make Git ignore `cwd` and use another repository, index, or object store, such as
// the `GIT_DIR` and `GIT_INDEX_FILE` a Git hook exports.
const GIT_REPOSITORY_ENV_VARS = execFileSync("git", ["rev-parse", "--local-env-vars"], {
  encoding: "utf8",
})
  .split("\n")
  .filter(Boolean);

export const isolatedGitEnv = (): NodeJS.ProcessEnv => {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
  };
  for (const name of GIT_REPOSITORY_ENV_VARS) {
    delete env[name];
  }
  return env;
};

/** Runs Git for fixture setup and assertions, isolated from the developer's config and hooks' env. */
export const git = (cwd: string, args: readonly string[]): string =>
  execFileSync("git", ["-c", "commit.gpgsign=false", ...args], {
    cwd,
    encoding: "utf8",
    env: isolatedGitEnv(),
  }).trim();

/** Lists `branch` if it exists, so assertions read `toBe("")` or `toContain(branch)`. */
export const listBranch = (repo: string, branch: string): string =>
  git(repo, ["branch", "--list", branch]);

const tempDirs: string[] = [];

export const makeTempDir = (prefix: string): string => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  tempDirs.push(dir);
  return dir;
};

/**
 * Isolates the Git that worktree operations run from inherited repository selectors and user
 * config, and removes each test's temporary directories.
 */
export const useWorktreeFixtures = (): void => {
  beforeEach(() => {
    vi.stubEnv("GIT_CONFIG_GLOBAL", "/dev/null");
    vi.stubEnv("GIT_CONFIG_NOSYSTEM", "1");
    for (const name of GIT_REPOSITORY_ENV_VARS) {
      vi.stubEnv(name, undefined);
    }
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });
};

const commitInitialFiles = (dir: string): void => {
  git(dir, ["config", "user.name", "Test"]);
  git(dir, ["config", "user.email", "test@example.test"]);
  mkdirSync(join(dir, ".agents"), { recursive: true });
  writeFileSync(join(dir, "README.md"), "# Temp\n");
  writeFileSync(
    join(dir, ".agents/install-environment.sh"),
    "#!/usr/bin/env bash\necho doctor-ok\n",
  );
  git(dir, ["add", "."]);
  git(dir, ["commit", "-m", "chore: init"]);
};

/** Creates a repository on `main` with one commit, at `dir` or in a new temporary directory. */
export const initTempRepo = ({
  withOriginMain = false,
  dir = makeTempDir("merit-worktree-test-"),
}: { withOriginMain?: boolean; dir?: string } = {}): string => {
  mkdirSync(dir, { recursive: true });
  git(dir, ["init", "-b", "main"]);
  commitInitialFiles(dir);
  if (withOriginMain) {
    const bare = makeTempDir("merit-worktree-origin-");
    git(bare, ["init", "--bare", "-b", "main"]);
    git(dir, ["remote", "add", "origin", bare]);
    git(dir, ["push", "-u", "origin", "main"]);
  }
  return dir;
};

export const createDeferred = <T = void>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
};

/** A process ID that no running process holds. */
const exitedPid = (): number => spawnSync(process.execPath, ["-e", ""]).pid ?? 0;

/** Leaves `slug`'s record as a create whose process exited before it finished. */
export const interruptCreate = (repo: string, slug: string): void => {
  const registry = readWorktreeRegistry(repo);
  const record = registry.worktrees[slug];
  if (!record) {
    throw new Error(`Worktree "${slug}" is not registered.`);
  }
  registry.worktrees[slug] = { ...record, status: "creating", ownerPid: exitedPid() };
  writeWorktreeRegistry(repo, registry);
};

export const worktreeRecord = (
  record: Pick<WorktreeRecord, "slug" | "path"> & Partial<WorktreeRecord>,
): WorktreeRecord => {
  const databaseName = `merit_${record.slug.replaceAll("-", "_")}`;
  return {
    branch: `worktree/${record.slug}`,
    baseRef: "main",
    databaseName,
    databaseUrl: buildLocalDatabaseUrl(databaseName),
    databaseCreated: false,
    ports: WORKTREE_PORT_BASES,
    createdAt: "2026-11-24T00:00:00.000Z",
    ...record,
  };
};

/** A database that is unreachable unless overridden, so no test touches a real server. */
export const fakeDatabase = (overrides: Partial<WorktreeDatabase> = {}): WorktreeDatabase => ({
  isReachable: async () => false,
  ensure: async () => ({ created: true }),
  drop: async () => {},
  ...overrides,
});

/** Real Git with no-op bootstrap commands, free ports, and an unreachable database. */
export const testDeps = (overrides: Partial<WorktreeDeps> = {}): WorktreeDeps => ({
  execGit: defaultExecGit,
  execCommand: () => {},
  checkPortAvailable: async () => true,
  database: fakeDatabase(),
  now: () => new Date(),
  ...overrides,
});

/** Runs `before` ahead of each real Git command; it may change the repository or throw to fail it. */
export const gitWith =
  (before: (args: readonly string[]) => void): ExecGit =>
  (dir, args) => {
    before(args);
    return defaultExecGit(dir, args);
  };

/** Reports whether a Git argument list starts with `command`, such as `["worktree", "remove"]`. */
export const isGitCommand = (args: readonly string[], ...command: string[]): boolean =>
  command.every((part, index) => args[index] === part);

export const createIn = async (
  repo: string,
  request: Pick<CreateWorktreeRequest, "slug"> & Partial<CreateWorktreeRequest>,
  deps: Partial<WorktreeDeps> = {},
) =>
  (
    await createWorktree(
      { primaryRepoRoot: repo, dbMode: "skip", doctor: false, quiet: true, ...request },
      testDeps(deps),
    )
  ).result;

export const cleanIn = async (
  repo: string,
  slug: string,
  deps: Partial<WorktreeDeps> = {},
  request: Partial<CleanWorktreeRequest> = {},
) =>
  (
    await cleanWorktree(
      { primaryRepoRoot: repo, slug, keepBranch: false, ...request },
      testDeps(deps),
    )
  ).result;

export const listIn = (repo: string) =>
  listWorktrees({ primaryRepoRoot: repo }, { execGit: defaultExecGit });
