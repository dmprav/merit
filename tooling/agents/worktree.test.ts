import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";

import { buildLocalDatabaseUrl, DEFAULT_COMPOSE_DATABASE_URL } from "../scripts/local-postgres.ts";
import {
  allocateWorktreePorts,
  cleanWorktree,
  collectReservedPorts,
  createWorktree,
  databaseNameForSlug,
  DEFAULT_PORTS,
  formatWorktreeEnvFile,
  isPortAvailable,
  listWorktrees,
  parseCleanArgs,
  parseCreateArgs,
  parseGitWorktreePorcelain,
  parseListArgs,
  readWorktreeRegistry,
  registryLockPathForRepo,
  registryPathForRepo,
  resolvePrimaryRepoRoot,
  validateWorktreeSlug,
  withWorktreeRegistryLock,
  WORKTREE_PORT_BASES,
  writeWorktreeRegistry,
} from "./worktree.ts";

const tempDirs: string[] = [];

// Variables that make Git ignore `cwd` and use another repository, index, or object store, such as
// the `GIT_DIR` and `GIT_INDEX_FILE` a Git hook exports.
const GIT_REPOSITORY_ENV_VARS = execFileSync("git", ["rev-parse", "--local-env-vars"], {
  encoding: "utf8",
})
  .split("\n")
  .filter(Boolean);

const isolatedGitEnv = (): NodeJS.ProcessEnv => {
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

const git = (cwd: string, args: readonly string[]) =>
  execFileSync("git", ["-c", "commit.gpgsign=false", ...args], {
    cwd,
    encoding: "utf8",
    env: isolatedGitEnv(),
  }).trim();

const createDeferred = <T = void>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const initTempRepo = (withOriginMain = false) => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "merit-worktree-test-")));
  tempDirs.push(dir);
  git(dir, ["init", "-b", "main"]);
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

  if (withOriginMain) {
    const bare = realpathSync(mkdtempSync(join(tmpdir(), "merit-worktree-origin-")));
    tempDirs.push(bare);
    git(bare, ["init", "--bare", "-b", "main"]);
    git(dir, ["remote", "add", "origin", bare]);
    git(dir, ["push", "-u", "origin", "main"]);
  }
  return dir;
};

beforeEach(() => {
  vi.stubEnv("GIT_CONFIG_GLOBAL", "/dev/null");
  vi.stubEnv("GIT_CONFIG_NOSYSTEM", "1");
  // createWorktree and cleanWorktree run Git with the inherited environment.
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

describe("worktree helpers", () => {
  test("fixture Git commands ignore inherited repository selectors", async () => {
    const decoy = realpathSync(mkdtempSync(join(tmpdir(), "merit-worktree-decoy-")));
    tempDirs.push(decoy);
    execFileSync("git", ["init", "-q", "-b", "main", decoy], { env: isolatedGitEnv() });
    const decoyConfig = readFileSync(join(decoy, ".git/config"), "utf8");
    vi.stubEnv("GIT_DIR", join(decoy, ".git"));
    vi.stubEnv("GIT_INDEX_FILE", join(decoy, ".git/index"));

    const repo = initTempRepo(false);

    expect(git(repo, ["config", "user.name"])).toBe("Test");
    expect(readFileSync(join(decoy, ".git/config"), "utf8")).toBe(decoyConfig);
    expect(existsSync(join(decoy, ".git/index"))).toBe(false);
  });

  test("validates slugs and builds safe Postgres database names", () => {
    expect(validateWorktreeSlug("a")).toBe("a");
    expect(validateWorktreeSlug("feat-auth-2")).toBe("feat-auth-2");
    expect(databaseNameForSlug("feat-auth-2")).toBe("merit_feat_auth_2");

    for (const invalid of [
      "",
      "Upper",
      "-leading",
      "trailing-",
      "double--hyphen",
      "has_underscore",
      "../escape",
      "a/b",
      "a".repeat(49),
    ]) {
      expect(() => validateWorktreeSlug(invalid), invalid).toThrow(/Invalid worktree slug/);
    }
  });

  test("parses create, list, and clean CLI arguments strictly", () => {
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

    expect(parseCreateArgs(["feat-two", "--no-db"])).toMatchObject({
      slug: "feat-two",
      dbMode: "skip",
      doctor: false,
      json: false,
    });

    expect(() => parseCreateArgs(["feat-two", "--with-db", "--no-db"])).toThrow(
      /Cannot combine --with-db and --no-db/,
    );
    expect(() => parseCreateArgs([])).toThrow(/Missing <slug>/);
    expect(() => parseCreateArgs(["feat-two", "--unknown"])).toThrow(/Unknown option/);

    expect(parseListArgs(["--json"])).toEqual({ json: true });
    expect(() => parseListArgs(["--bad"])).toThrow(/Unknown option/);

    expect(parseCleanArgs(["feat-one", "--keep-branch", "--json"])).toEqual({
      slug: "feat-one",
      keepBranch: true,
      json: true,
    });
    expect(() => parseCleanArgs([])).toThrow(/Missing <slug>/);
  });

  test("allocates collision-free ports avoiding defaults, active registry entries, and live bound ports", async () => {
    const first = await allocateWorktreePorts({
      reservedPorts: new Set(Object.values(DEFAULT_PORTS)),
      checkPortAvailable: async () => true,
    });
    expect(first).toEqual(WORKTREE_PORT_BASES);

    const second = await allocateWorktreePorts({
      reservedPorts: new Set([...Object.values(DEFAULT_PORTS), ...Object.values(first)]),
      checkPortAvailable: async () => true,
    });
    expect(second).toEqual({
      MERIT_DEV_PORT: 3110,
      MERIT_APP_PORT: 3111,
      MERIT_WORKSPACE_PORT: 3112,
      MERIT_STORYBOOK_DEV_PORT: 6116,
      MERIT_STORYBOOK_PORT: 6117,
    });

    // Bind a real TCP port on 127.0.0.1 and verify live-port detection skips it.
    const blocker = createServer();
    await new Promise<void>((resolveListen) => {
      blocker.listen(0, "127.0.0.1", () => resolveListen());
    });
    try {
      const address = blocker.address();
      if (!address || typeof address === "string") {
        throw new Error("Expected TCP address");
      }
      expect(await isPortAvailable(address.port)).toBe(false);

      const skippedBusy = await allocateWorktreePorts({
        reservedPorts: new Set(Object.values(DEFAULT_PORTS)),
        checkPortAvailable: async (port) => port !== WORKTREE_PORT_BASES.MERIT_APP_PORT,
      });
      expect(skippedBusy.MERIT_DEV_PORT).toBe(3110);
      expect(skippedBusy.MERIT_APP_PORT).toBe(3111);
    } finally {
      await new Promise<void>((resolveClose) => blocker.close(() => resolveClose()));
    }
  });

  test("formats .env.local with DATABASE_URL, TEST_DATABASE_URL, and all allocated ports", () => {
    const dbUrl = buildLocalDatabaseUrl("merit_alpha");
    const envText = formatWorktreeEnvFile({
      slug: "alpha",
      databaseUrl: dbUrl,
      ports: WORKTREE_PORT_BASES,
    });
    expect(envText).toContain(`DATABASE_URL=${dbUrl}`);
    expect(envText).toContain(`TEST_DATABASE_URL=${DEFAULT_COMPOSE_DATABASE_URL}`);
    expect(envText).toContain("MERIT_DEV_PORT=3100");
    expect(envText).toContain("MERIT_APP_PORT=3101");
    expect(envText).toContain("MERIT_WORKSPACE_PORT=3102");
    expect(envText).toContain("MERIT_STORYBOOK_DEV_PORT=6106");
    expect(envText).toContain("MERIT_STORYBOOK_PORT=6107");
  });

  test("parses git worktree porcelain -z output preserving trailing spaces and locked state, and collects reserved ports", () => {
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

    const reserved = collectReservedPorts(
      {
        version: 1,
        worktrees: {
          alpha: {
            slug: "alpha",
            path: "/repo/.tmp/worktrees/alpha",
            branch: "worktree/alpha",
            baseRef: "main",
            databaseName: "merit_alpha",
            databaseUrl: buildLocalDatabaseUrl("merit_alpha"),
            databaseCreated: true,
            ports: WORKTREE_PORT_BASES,
            createdAt: "2026-11-24T00:00:00.000Z",
          },
        },
      },
      new Set(["/repo/.tmp/worktrees/alpha"]),
    );
    expect(reserved.has(3000)).toBe(true);
    expect(reserved.has(3100)).toBe(true);
  });
});

describe("worktree lifecycle in temp git repos", () => {
  test("creates concurrent worktrees with distinct ports/DBs, supports --dir/--branch/--doctor, lists, and cleans idempotently", async () => {
    const repo = initTempRepo(true);
    const customParent = realpathSync(mkdtempSync(join(tmpdir(), "merit-custom-wt-")));
    tempDirs.push(customParent);
    const customDir = join(customParent, "beta-dir");

    const commandsRun: Array<{ command: string; args: readonly string[]; cwd: string }> = [];
    const createdDbs: string[] = [];
    const droppedDbs: string[] = [];

    const deps = {
      execCommand: (
        command: string,
        args: readonly string[],
        options: { cwd: string; quiet: boolean },
      ) => {
        commandsRun.push({ command, args, cwd: options.cwd });
      },
      checkPortAvailable: async () => true,
      isPostgresReachable: async () => true,
      ensureDatabase: async (name: string) => {
        createdDbs.push(name);
        return { created: true };
      },
      dropDatabase: async (name: string) => {
        droppedDbs.push(name);
      },
    };

    const alpha = await createWorktree(
      {
        slug: "alpha",
        dbMode: "auto",
        doctor: true,
        json: false,
        primaryRepoRoot: repo,
      },
      deps,
    );

    expect(alpha.baseRef).toBe("origin/main");
    expect(alpha.branch).toBe("worktree/alpha");
    expect(alpha.databaseName).toBe("merit_alpha");
    expect(alpha.databaseCreated).toBe(true);
    expect(alpha.path).toBe(join(repo, ".tmp/worktrees/alpha"));
    expect(existsSync(join(alpha.path, ".env.local"))).toBe(true);
    expect(readFileSync(join(alpha.path, ".env.local"), "utf8")).toContain(
      `DATABASE_URL=${alpha.databaseUrl}`,
    );

    // Invoking resolvePrimaryRepoRoot from inside the linked worktree finds the main repo root.
    expect(resolvePrimaryRepoRoot(alpha.path)).toBe(repo);

    // Verify bootstrap commands ran in the worktree (pnpm install, vp config --no-agent, doctor).
    expect(commandsRun.map((entry) => [entry.command, entry.args, entry.cwd])).toEqual([
      ["pnpm", ["install", "--frozen-lockfile", "--prefer-offline"], alpha.path],
      ["vp", ["config", "--no-agent"], alpha.path],
      ["bash", [join(alpha.path, ".agents/install-environment.sh"), "--doctor"], alpha.path],
    ]);

    const beta = await createWorktree(
      {
        slug: "beta",
        branch: "feat/beta-work",
        dir: customDir,
        dbMode: "skip",
        doctor: false,
        json: true,
        primaryRepoRoot: repo,
      },
      deps,
    );

    expect(beta.path).toBe(customDir);
    expect(beta.branch).toBe("feat/beta-work");
    expect(beta.databaseName).toBe("merit_beta");
    expect(beta.databaseCreated).toBe(false);
    expect(createdDbs).toEqual(["merit_alpha"]);

    // Ports must be completely disjoint between alpha and beta.
    const alphaPorts = new Set(Object.values(alpha.ports));
    for (const port of Object.values(beta.ports)) {
      expect(alphaPorts.has(port)).toBe(false);
    }

    const listed = listWorktrees({ primaryRepoRoot: repo });
    expect(listed.map((entry) => entry.slug)).toEqual(["alpha", "beta"]);
    expect(listed[1]?.path).toBe(customDir);

    // Clean beta with --keep-branch, verify branch remains while worktree & DB are cleaned.
    const cleanBeta = await cleanWorktree(
      { slug: "beta", keepBranch: true, json: true, primaryRepoRoot: repo },
      deps,
    );
    expect(cleanBeta).toMatchObject({
      slug: "beta",
      worktreeRemoved: true,
      databaseName: "merit_beta",
      databaseDropped: true,
      branchDeleted: false,
      registryRemoved: true,
    });
    expect(existsSync(customDir)).toBe(false);
    expect(git(repo, ["branch", "--list", "feat/beta-work"])).toContain("feat/beta-work");

    // Clean alpha completely and verify idempotency on second clean call.
    const cleanAlpha = await cleanWorktree(
      { slug: "alpha", keepBranch: false, json: true, primaryRepoRoot: repo },
      deps,
    );
    expect(cleanAlpha).toMatchObject({
      slug: "alpha",
      worktreeRemoved: true,
      databaseName: "merit_alpha",
      databaseDropped: true,
      branchDeleted: true,
      registryRemoved: true,
    });
    expect(existsSync(alpha.path)).toBe(false);
    expect(git(repo, ["branch", "--list", "worktree/alpha"])).toBe("");
    expect(droppedDbs).toEqual(["merit_beta", "merit_alpha"]);

    const cleanAlphaAgain = await cleanWorktree(
      { slug: "alpha", keepBranch: false, json: true, primaryRepoRoot: repo },
      deps,
    );
    expect(cleanAlphaAgain.worktreeRemoved).toBe(false);
    expect(cleanAlphaAgain.branchDeleted).toBe(false);
    expect(listWorktrees({ primaryRepoRoot: repo })).toEqual([]);
  });

  test("falls back to main when origin/main is absent, fails fast on --with-db without Postgres, and rolls back on bootstrap failure", async () => {
    const repo = initTempRepo(false);
    const execCommand = vi.fn();

    await expect(
      createWorktree(
        {
          slug: "needs-db",
          dbMode: "required",
          doctor: false,
          json: true,
          primaryRepoRoot: repo,
        },
        {
          execCommand,
          checkPortAvailable: async () => true,
          isPostgresReachable: async () => false,
        },
      ),
    ).rejects.toThrow(/PostgreSQL is not reachable/);

    expect(execCommand).not.toHaveBeenCalled();
    expect(existsSync(join(repo, ".tmp/worktrees/needs-db"))).toBe(false);
    expect(git(repo, ["branch", "--list", "worktree/needs-db"])).toBe("");

    // Bootstrap failure rolls back git worktree and branch cleanly.
    await expect(
      createWorktree(
        {
          slug: "broken-install",
          dbMode: "skip",
          doctor: false,
          json: true,
          primaryRepoRoot: repo,
        },
        {
          execCommand: () => {
            throw new Error("pnpm install failed");
          },
          checkPortAvailable: async () => true,
        },
      ),
    ).rejects.toThrow(/pnpm install failed/);
    expect(existsSync(join(repo, ".tmp/worktrees/broken-install"))).toBe(false);
    expect(git(repo, ["branch", "--list", "worktree/broken-install"])).toBe("");
    expect(readWorktreeRegistry(repo).worktrees["broken-install"]).toBeUndefined();

    // Succeeds against local `main` when origin/main does not exist.
    const created = await createWorktree(
      {
        slug: "local-only",
        dbMode: "skip",
        doctor: false,
        json: true,
        primaryRepoRoot: repo,
      },
      {
        execCommand: () => {},
        checkPortAvailable: async () => true,
      },
    );
    expect(created.baseRef).toBe("main");
  });

  test("refuses to drop a protected database during clean even if metadata is tampered with", async () => {
    const repo = initTempRepo(false);
    const dropDatabase = vi.fn();

    writeWorktreeRegistry(repo, {
      version: 1,
      worktrees: {
        tampered: {
          slug: "tampered",
          path: join(repo, ".tmp/worktrees/tampered"),
          branch: "main",
          baseRef: "main",
          databaseName: "merit",
          databaseUrl: DEFAULT_COMPOSE_DATABASE_URL,
          databaseCreated: false,
          ports: WORKTREE_PORT_BASES,
          createdAt: "2026-11-24T00:00:00.000Z",
        },
      },
    });

    await expect(
      cleanWorktree(
        { slug: "tampered", keepBranch: false, json: true, primaryRepoRoot: repo },
        { isPostgresReachable: async () => true, dropDatabase },
      ),
    ).rejects.toThrow(/protected database "merit"/);
    expect(dropDatabase).not.toHaveBeenCalled();
  });

  test("never deletes a protected branch name during clean, even when no checkout uses it", async () => {
    const repo = initTempRepo(false);
    // `master` is neither the primary branch nor checked out anywhere, so only the protected-name
    // rule keeps it.
    git(repo, ["branch", "master", "main"]);

    writeWorktreeRegistry(repo, {
      version: 1,
      worktrees: {
        tampered: {
          slug: "tampered",
          path: join(repo, ".tmp/worktrees/tampered"),
          branch: "master",
          baseRef: "main",
          databaseName: "merit_tampered",
          databaseUrl: buildLocalDatabaseUrl("merit_tampered"),
          databaseCreated: false,
          ports: WORKTREE_PORT_BASES,
          createdAt: "2026-11-24T00:00:00.000Z",
        },
      },
    });

    const cleaned = await cleanWorktree(
      { slug: "tampered", keepBranch: false, json: true, primaryRepoRoot: repo },
      { isPostgresReachable: async () => false },
    );
    expect(cleaned).toMatchObject({
      branch: "master",
      branchDeleted: false,
      registryRemoved: true,
    });
    expect(git(repo, ["branch", "--list", "master"])).toContain("master");
  });

  test("serializes concurrent createWorktree calls via deterministic lock contention barrier", async () => {
    const repo = initTempRepo(false);
    const createdDbs: string[] = [];

    const alphaEnteredLock = createDeferred<void>();
    const releaseAlphaLock = createDeferred<void>();
    const betaReadyForLock = createDeferred<void>();
    let alphaFirstProbe = true;
    let betaEnteredCriticalSection = false;

    const lockOptions = { initialDelayMs: 5, maxDelayMs: 15, timeoutMs: 5_000 };

    const alphaPromise = createWorktree(
      {
        slug: "alpha",
        dbMode: "required",
        doctor: false,
        json: true,
        primaryRepoRoot: repo,
      },
      {
        execCommand: () => {},
        checkPortAvailable: async () => {
          if (alphaFirstProbe) {
            alphaFirstProbe = false;
            alphaEnteredLock.resolve();
            await releaseAlphaLock.promise;
          }
          return true;
        },
        isPostgresReachable: async () => true,
        ensureDatabase: async (name: string) => {
          createdDbs.push(name);
          return { created: true };
        },
        lockOptions,
      },
    );

    await alphaEnteredLock.promise;
    expect(existsSync(registryLockPathForRepo(repo))).toBe(true);

    const betaPromise = createWorktree(
      {
        slug: "beta",
        dbMode: "required",
        doctor: false,
        json: true,
        primaryRepoRoot: repo,
      },
      {
        execCommand: () => {},
        checkPortAvailable: async () => {
          betaEnteredCriticalSection = true;
          return true;
        },
        isPostgresReachable: async () => {
          betaReadyForLock.resolve();
          return true;
        },
        ensureDatabase: async (name: string) => {
          createdDbs.push(name);
          return { created: true };
        },
        lockOptions,
      },
    );

    await betaReadyForLock.promise;
    // Allow beta to reach withWorktreeRegistryLock and hit EEXIST while alpha holds the lock.
    await Promise.resolve();
    await Promise.resolve();
    expect(betaEnteredCriticalSection).toBe(false);

    releaseAlphaLock.resolve();
    const [alpha, beta] = await Promise.all([alphaPromise, betaPromise]);

    expect(betaEnteredCriticalSection).toBe(true);
    const alphaPorts = new Set(Object.values(alpha.ports));
    for (const port of Object.values(beta.ports)) {
      expect(alphaPorts.has(port)).toBe(false);
    }

    const registry = readWorktreeRegistry(repo);
    expect(Object.keys(registry.worktrees).sort()).toEqual(["alpha", "beta"]);
    expect(registry.worktrees.alpha?.ports).toEqual(alpha.ports);
    expect(registry.worktrees.beta?.ports).toEqual(beta.ports);
    expect(registry.worktrees.alpha?.databaseCreated).toBe(true);
    expect(registry.worktrees.beta?.databaseCreated).toBe(true);
    expect(createdDbs.sort()).toEqual(["merit_alpha", "merit_beta"]);
    expect(existsSync(registryLockPathForRepo(repo))).toBe(false);
  });

  test("cleanWorktree re-reads .registry.json under lock and preserves a sibling registered mid-clean", async () => {
    const repo = initTempRepo(false);
    const baseDeps = {
      execCommand: () => {},
      checkPortAvailable: async () => true,
      isPostgresReachable: async () => true,
      ensureDatabase: async () => ({ created: true }),
    };

    await createWorktree(
      {
        slug: "alpha",
        dbMode: "auto",
        doctor: false,
        json: true,
        primaryRepoRoot: repo,
      },
      baseDeps,
    );

    const cleaned = await cleanWorktree(
      { slug: "alpha", keepBranch: false, json: true, primaryRepoRoot: repo },
      {
        isPostgresReachable: async () => true,
        dropDatabase: async () => {
          // Register sibling worktree while alpha is mid-clean.
          await createWorktree(
            {
              slug: "beta",
              dbMode: "skip",
              doctor: false,
              json: true,
              primaryRepoRoot: repo,
            },
            baseDeps,
          );
        },
      },
    );

    expect(cleaned.registryRemoved).toBe(true);
    const registry = readWorktreeRegistry(repo);
    expect(registry.worktrees.alpha).toBeUndefined();
    expect(registry.worktrees.beta).toBeDefined();
    expect(listWorktrees({ primaryRepoRoot: repo }).map((entry) => entry.slug)).toEqual(["beta"]);
  });

  test("preserves valid lock files held by a live PID regardless of age, and recovers dead-PID or corrupt locks", async () => {
    const repo = initTempRepo(false);
    const lockPath = registryLockPathForRepo(repo);
    mkdirSync(join(repo, ".tmp/worktrees"), { recursive: true });

    // A valid lock owned by a live PID must never be expired solely by age.
    const livePayload = `${JSON.stringify({ pid: process.pid, token: "live-token", createdAt: 0 })}\n`;
    writeFileSync(lockPath, livePayload, "utf8");
    const expired = new Date(Date.now() - 60_000);
    utimesSync(lockPath, expired, expired);

    await expect(
      withWorktreeRegistryLock(repo, () => "should-not-acquire", {
        staleMs: 5_000,
        timeoutMs: 60,
        initialDelayMs: 10,
        maxDelayMs: 20,
      }),
    ).rejects.toThrow(/Timed out waiting for worktree registry lock/);
    expect(readFileSync(lockPath, "utf8")).toBe(livePayload);

    // A valid lock owned by a dead PID is recovered immediately even with a fresh mtime.
    const exited = spawnSync(process.execPath, ["-e", ""]);
    expect(exited.pid).toBeGreaterThan(0);
    writeFileSync(
      lockPath,
      `${JSON.stringify({ pid: exited.pid, token: "dead-token", createdAt: Date.now() })}\n`,
      "utf8",
    );
    const fromDeadPid = await withWorktreeRegistryLock(repo, () => "acquired-dead", {
      staleMs: 30_000,
      timeoutMs: 2_000,
    });
    expect(fromDeadPid).toBe("acquired-dead");
    expect(existsSync(lockPath)).toBe(false);

    // An unreadable/corrupt lock file is recovered once past the write-grace period.
    writeFileSync(lockPath, "{truncated", "utf8");
    utimesSync(lockPath, expired, expired);
    const fromCorrupt = await withWorktreeRegistryLock(repo, () => "acquired-corrupt", {
      staleMs: 5_000,
      timeoutMs: 2_000,
    });
    expect(fromCorrupt).toBe("acquired-corrupt");
    expect(existsSync(lockPath)).toBe(false);
  });

  test("cleanWorktree prunes stale git metadata and cleans DB, registry, and branch when the directory was already removed", async () => {
    const repo = initTempRepo(false);
    const droppedDbs: string[] = [];

    const created = await createWorktree(
      {
        slug: "gone-dir",
        dbMode: "auto",
        doctor: false,
        json: true,
        primaryRepoRoot: repo,
      },
      {
        execCommand: () => {},
        checkPortAvailable: async () => true,
        isPostgresReachable: async () => true,
        ensureDatabase: async () => ({ created: true }),
      },
    );

    // Manually delete the worktree directory so git marks it prunable.
    rmSync(created.path, { recursive: true, force: true });
    expect(existsSync(created.path)).toBe(false);
    expect(git(repo, ["worktree", "list", "--porcelain"])).toContain(created.path);

    const cleaned = await cleanWorktree(
      { slug: "gone-dir", keepBranch: false, json: true, primaryRepoRoot: repo },
      {
        isPostgresReachable: async () => true,
        dropDatabase: async (name) => {
          droppedDbs.push(name);
        },
      },
    );

    expect(cleaned).toMatchObject({
      slug: "gone-dir",
      worktreeRemoved: true,
      databaseName: "merit_gone_dir",
      databaseDropped: true,
      branchDeleted: true,
      registryRemoved: true,
    });
    expect(droppedDbs).toEqual(["merit_gone_dir"]);
    expect(git(repo, ["worktree", "list", "--porcelain"])).not.toContain(created.path);
    expect(git(repo, ["branch", "--list", "worktree/gone-dir"])).toBe("");
    expect(readWorktreeRegistry(repo).worktrees["gone-dir"]).toBeUndefined();
  });

  test("rolls back database, worktree, branch, and .registry.json when --doctor fails after DB creation", async () => {
    const repo = initTempRepo(false);
    const droppedDbs: string[] = [];

    // Seed an unrelated sibling worktree to ensure rollback only removes the failed slug.
    await createWorktree(
      {
        slug: "sibling",
        dbMode: "skip",
        doctor: false,
        json: true,
        primaryRepoRoot: repo,
      },
      {
        execCommand: () => {},
        checkPortAvailable: async () => true,
      },
    );

    await expect(
      createWorktree(
        {
          slug: "doctor-fail",
          dbMode: "required",
          doctor: true,
          json: true,
          primaryRepoRoot: repo,
        },
        {
          execCommand: (_command, args) => {
            if (args.includes("--doctor")) {
              throw new Error("doctor check failed");
            }
          },
          checkPortAvailable: async () => true,
          isPostgresReachable: async () => true,
          ensureDatabase: async () => ({ created: true }),
          dropDatabase: async (name) => {
            droppedDbs.push(name);
          },
        },
      ),
    ).rejects.toThrow(/doctor check failed/);

    expect(droppedDbs).toEqual(["merit_doctor_fail"]);
    expect(existsSync(join(repo, ".tmp/worktrees/doctor-fail"))).toBe(false);
    expect(git(repo, ["worktree", "list", "--porcelain"])).not.toContain("doctor-fail");
    expect(git(repo, ["branch", "--list", "worktree/doctor-fail"])).toBe("");
    const registry = readWorktreeRegistry(repo);
    expect(registry.worktrees["doctor-fail"]).toBeUndefined();
    expect(registry.worktrees.sibling).toBeDefined();
  });

  test("cleanWorktree refuses to delete an ancestor directory of the primary repository root", async () => {
    const outerDir = realpathSync(mkdtempSync(join(tmpdir(), "merit-worktree-outer-")));
    tempDirs.push(outerDir);
    const repo = join(outerDir, "repo");
    mkdirSync(repo, { recursive: true });
    git(repo, ["init", "-b", "main"]);
    git(repo, ["config", "user.name", "Test"]);
    git(repo, ["config", "user.email", "test@example.test"]);
    writeFileSync(join(repo, "README.md"), "# Temp\n");
    git(repo, ["add", "."]);
    git(repo, ["commit", "-m", "chore: init"]);

    const dropDatabase = vi.fn();
    writeWorktreeRegistry(repo, {
      version: 1,
      worktrees: {
        ancestor: {
          slug: "ancestor",
          path: dirname(repo),
          branch: "worktree/ancestor",
          baseRef: "main",
          databaseName: "merit_ancestor",
          databaseUrl: buildLocalDatabaseUrl("merit_ancestor"),
          databaseCreated: false,
          ports: WORKTREE_PORT_BASES,
          createdAt: "2026-11-24T00:00:00.000Z",
        },
      },
    });

    await expect(
      cleanWorktree(
        { slug: "ancestor", keepBranch: false, json: true, primaryRepoRoot: repo },
        { isPostgresReachable: async () => true, dropDatabase },
      ),
    ).rejects.toThrow(/primary repository root or ancestor directory/);

    expect(dropDatabase).not.toHaveBeenCalled();
    expect(existsSync(outerDir)).toBe(true);
    expect(existsSync(repo)).toBe(true);
  });

  test("cleanWorktree skips deleting a branch that is checked out in another active worktree", async () => {
    const repo = initTempRepo(false);
    const active = await createWorktree(
      {
        slug: "active-peer",
        branch: "feat/shared-branch",
        dbMode: "skip",
        doctor: false,
        json: true,
        primaryRepoRoot: repo,
      },
      {
        execCommand: () => {},
        checkPortAvailable: async () => true,
      },
    );

    const registry = readWorktreeRegistry(repo);
    registry.worktrees.stale = {
      slug: "stale",
      path: join(repo, ".tmp/worktrees/stale"),
      branch: active.branch,
      baseRef: "main",
      databaseName: "merit_stale",
      databaseUrl: buildLocalDatabaseUrl("merit_stale"),
      databaseCreated: false,
      ports: WORKTREE_PORT_BASES,
      createdAt: "2026-11-24T00:00:00.000Z",
    };
    writeWorktreeRegistry(repo, registry);

    const cleaned = await cleanWorktree(
      { slug: "stale", keepBranch: false, json: true, primaryRepoRoot: repo },
      { isPostgresReachable: async () => false },
    );

    expect(cleaned.branchDeleted).toBe(false);
    expect(cleaned.registryRemoved).toBe(true);
    expect(git(repo, ["branch", "--list", "feat/shared-branch"])).toContain("feat/shared-branch");
    expect(existsSync(active.path)).toBe(true);
  });

  test("throws a clear error on corrupt .registry.json instead of treating it as empty", async () => {
    const repo = initTempRepo(false);
    const regPath = registryPathForRepo(repo);
    mkdirSync(dirname(regPath), { recursive: true });
    writeFileSync(regPath, "{not valid json", "utf8");

    expect(() => readWorktreeRegistry(repo)).toThrow(
      new RegExp(
        `Corrupt or invalid worktree registry at "${regPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`,
      ),
    );

    await expect(
      createWorktree(
        {
          slug: "fresh",
          dbMode: "skip",
          doctor: false,
          json: true,
          primaryRepoRoot: repo,
        },
        {
          execCommand: () => {},
          checkPortAvailable: async () => true,
        },
      ),
    ).rejects.toThrow(/Corrupt or invalid worktree registry/);
    // Ensure the corrupt file was NOT silently overwritten.
    expect(readFileSync(regPath, "utf8")).toBe("{not valid json");
  });

  test("cleans up partial checkout and newly created branch when git worktree add fails in a hook", async () => {
    const repo = initTempRepo(false);
    const markerDir = realpathSync(mkdtempSync(join(tmpdir(), "merit-hook-marker-")));
    tempDirs.push(markerDir);
    const markerFile = join(markerDir, "post-checkout-ran.txt");
    const hooksDir = join(repo, ".git", "hooks");
    mkdirSync(hooksDir, { recursive: true });
    git(repo, ["config", "core.hooksPath", hooksDir]);
    const hookPath = join(hooksDir, "post-checkout");
    writeFileSync(
      hookPath,
      `#!/usr/bin/env sh\nprintf 'hook-ran\\n' > '${markerFile.replaceAll("'", "'\\''")}'\nexit 1\n`,
      "utf8",
    );
    chmodSync(hookPath, 0o755);

    await expect(
      createWorktree(
        {
          slug: "hook-fail",
          dbMode: "skip",
          doctor: false,
          json: true,
          primaryRepoRoot: repo,
        },
        {
          execCommand: () => {},
          checkPortAvailable: async () => true,
        },
      ),
    ).rejects.toThrow();

    expect(existsSync(markerFile)).toBe(true);
    expect(readFileSync(markerFile, "utf8").trim()).toBe("hook-ran");
    expect(existsSync(join(repo, ".tmp/worktrees/hook-fail"))).toBe(false);
    expect(git(repo, ["worktree", "list", "--porcelain", "-z"])).not.toContain("hook-fail");
    expect(git(repo, ["branch", "--list", "worktree/hook-fail"])).toBe("");
    expect(readWorktreeRegistry(repo).worktrees["hook-fail"]).toBeUndefined();
  });

  test("cleanWorktree blocks concurrent create for the same slug while cleaning and keeps registry entry on branch-delete failure for retry", async () => {
    const repo = initTempRepo(false);
    const baseDeps = {
      execCommand: () => {},
      checkPortAvailable: async () => true,
      isPostgresReachable: async () => true,
      ensureDatabase: async () => ({ created: true }),
    };

    await createWorktree(
      {
        slug: "gamma",
        branch: "feat/custom-gamma",
        dbMode: "auto",
        doctor: false,
        json: true,
        primaryRepoRoot: repo,
      },
      baseDeps,
    );

    let failBranchDelete = true;
    let createDuringCleanError: Error | undefined;

    const realGit = (dir: string, args: readonly string[]) =>
      execFileSync("git", ["-c", "commit.gpgsign=false", ...args], {
        cwd: dir,
        encoding: "utf8",
        env: isolatedGitEnv(),
      });

    await expect(
      cleanWorktree(
        { slug: "gamma", keepBranch: false, json: true, primaryRepoRoot: repo },
        {
          execGit: (dir, args) => {
            if (failBranchDelete && args[0] === "branch" && args[1] === "-D") {
              throw new Error("simulated branch delete failure");
            }
            return realGit(dir, args);
          },
          isPostgresReachable: async () => true,
          dropDatabase: async () => {
            // While gamma is marked "cleaning", creating the same slug must be refused.
            try {
              await createWorktree(
                {
                  slug: "gamma",
                  dbMode: "skip",
                  doctor: false,
                  json: true,
                  primaryRepoRoot: repo,
                },
                baseDeps,
              );
            } catch (error) {
              createDuringCleanError = error as Error;
            }
          },
        },
      ),
    ).rejects.toThrow(/simulated branch delete failure/);

    expect(createDuringCleanError?.message).toMatch(/currently being cleaned/);

    // Registry record must still exist with status "cleaning" and custom branch preserved.
    const pendingRegistry = readWorktreeRegistry(repo);
    expect(pendingRegistry.worktrees.gamma).toMatchObject({
      slug: "gamma",
      branch: "feat/custom-gamma",
      status: "cleaning",
    });
    expect(git(repo, ["branch", "--list", "feat/custom-gamma"])).toContain("feat/custom-gamma");

    // Retrying clean succeeds, deletes the custom branch, and removes the registry entry.
    failBranchDelete = false;
    const retried = await cleanWorktree(
      { slug: "gamma", keepBranch: false, json: true, primaryRepoRoot: repo },
      {
        isPostgresReachable: async () => true,
        dropDatabase: async () => {},
      },
    );
    expect(retried).toMatchObject({
      slug: "gamma",
      branch: "feat/custom-gamma",
      branchDeleted: true,
      registryRemoved: true,
    });
    expect(git(repo, ["branch", "--list", "feat/custom-gamma"])).toBe("");
    expect(readWorktreeRegistry(repo).worktrees.gamma).toBeUndefined();
  });

  test("cleanWorktree refuses to rmSync an unowned custom directory or a locked Git worktree", async () => {
    const repo = initTempRepo(false);
    const unownedDir = realpathSync(mkdtempSync(join(tmpdir(), "merit-unowned-dir-")));
    tempDirs.push(unownedDir);
    writeFileSync(join(unownedDir, "important.txt"), "do not delete\n", "utf8");

    const dropDatabase = vi.fn();
    writeWorktreeRegistry(repo, {
      version: 1,
      worktrees: {
        unowned: {
          slug: "unowned",
          path: unownedDir,
          branch: "worktree/unowned",
          baseRef: "main",
          databaseName: "merit_unowned",
          databaseUrl: buildLocalDatabaseUrl("merit_unowned"),
          databaseCreated: false,
          ports: WORKTREE_PORT_BASES,
          createdAt: "2026-11-24T00:00:00.000Z",
        },
      },
    });

    await expect(
      cleanWorktree(
        { slug: "unowned", keepBranch: false, json: true, primaryRepoRoot: repo },
        { isPostgresReachable: async () => true, dropDatabase },
      ),
    ).rejects.toThrow(/not a recognized Git worktree/);
    expect(existsSync(join(unownedDir, "important.txt"))).toBe(true);
    expect(dropDatabase).not.toHaveBeenCalled();

    // A locked Git worktree must surface Git's error and never be rmSync'd.
    const lockedParent = realpathSync(mkdtempSync(join(tmpdir(), "merit-locked-wt-")));
    tempDirs.push(lockedParent);
    const lockedDir = join(lockedParent, "locked-wt");
    const created = await createWorktree(
      {
        slug: "locked-slug",
        dir: lockedDir,
        dbMode: "skip",
        doctor: false,
        json: true,
        primaryRepoRoot: repo,
      },
      {
        execCommand: () => {},
        checkPortAvailable: async () => true,
      },
    );
    git(repo, ["worktree", "lock", created.path]);

    await expect(
      cleanWorktree(
        { slug: "locked-slug", keepBranch: false, json: true, primaryRepoRoot: repo },
        { isPostgresReachable: async () => true, dropDatabase },
      ),
    ).rejects.toThrow();
    expect(existsSync(created.path)).toBe(true);
    expect(dropDatabase).not.toHaveBeenCalled();
  });

  test("createWorktree rejects custom --dir nested inside or containing another active or registered linked worktree", async () => {
    const repo = initTempRepo(false);
    const customRoot = realpathSync(mkdtempSync(join(tmpdir(), "merit-overlap-wt-")));
    tempDirs.push(customRoot);

    const activeDir = join(customRoot, "group", "base-wt");
    const active = await createWorktree(
      {
        slug: "base-wt",
        dir: activeDir,
        dbMode: "skip",
        doctor: false,
        json: true,
        primaryRepoRoot: repo,
      },
      {
        execCommand: () => {},
        checkPortAvailable: async () => true,
      },
    );

    // Reject a --dir nested inside an active linked worktree (directory does not exist yet).
    await expect(
      createWorktree(
        {
          slug: "nested-child",
          dir: join(active.path, "sub", "child"),
          dbMode: "skip",
          doctor: false,
          json: true,
          primaryRepoRoot: repo,
        },
        {
          execCommand: () => {},
          checkPortAvailable: async () => true,
        },
      ),
    ).rejects.toThrow(/overlaps existing worktree/);

    // Reject a --dir containing an active linked worktree.
    await expect(
      createWorktree(
        {
          slug: "parent-container",
          dir: join(customRoot, "group"),
          dbMode: "skip",
          doctor: false,
          json: true,
          primaryRepoRoot: repo,
        },
        {
          execCommand: () => {},
          checkPortAvailable: async () => true,
        },
      ),
    ).rejects.toThrow(/overlaps existing worktree/);

    // Seed a registered-only linked worktree path that does not exist on disk yet.
    const ghostParent = join(customRoot, "ghost");
    const ghostWorktreePath = join(ghostParent, "sub", "ghost-wt");
    const registry = readWorktreeRegistry(repo);
    registry.worktrees["ghost-wt"] = {
      slug: "ghost-wt",
      path: ghostWorktreePath,
      branch: "worktree/ghost-wt",
      baseRef: "main",
      databaseName: "merit_ghost_wt",
      databaseUrl: buildLocalDatabaseUrl("merit_ghost_wt"),
      databaseCreated: false,
      ports: {
        MERIT_DEV_PORT: 3120,
        MERIT_APP_PORT: 3121,
        MERIT_WORKSPACE_PORT: 3122,
        MERIT_STORYBOOK_DEV_PORT: 6126,
        MERIT_STORYBOOK_PORT: 6127,
      },
      createdAt: "2026-11-24T00:00:00.000Z",
      status: "active",
    };
    writeWorktreeRegistry(repo, registry);

    // Reject a non-existent --dir that would contain the registered linked worktree path.
    await expect(
      createWorktree(
        {
          slug: "contains-ghost",
          dir: ghostParent,
          dbMode: "skip",
          doctor: false,
          json: true,
          primaryRepoRoot: repo,
        },
        {
          execCommand: () => {},
          checkPortAvailable: async () => true,
        },
      ),
    ).rejects.toThrow(/overlaps existing worktree/);

    // Reject a --dir nested inside the registered linked worktree path.
    await expect(
      createWorktree(
        {
          slug: "inside-ghost",
          dir: join(ghostWorktreePath, "nested"),
          dbMode: "skip",
          doctor: false,
          json: true,
          primaryRepoRoot: repo,
        },
        {
          execCommand: () => {},
          checkPortAvailable: async () => true,
        },
      ),
    ).rejects.toThrow(/overlaps existing worktree/);

    expect(existsSync(active.path)).toBe(true);
    expect(git(repo, ["branch", "--list", "worktree/nested-child"])).toBe("");
    expect(git(repo, ["branch", "--list", "worktree/contains-ghost"])).toBe("");
  });

  test("createWorktree never rmSyncs an external non-worktree directory populated during port probes or git worktree add", async () => {
    const repo = initTempRepo(false);
    const customParent = realpathSync(mkdtempSync(join(tmpdir(), "merit-race-dir-")));
    tempDirs.push(customParent);

    // Case 1: External process creates and populates targetDir while port probing is awaiting.
    const probeRaceDir = join(customParent, "probe-race");
    let createdDuringProbe = false;
    await expect(
      createWorktree(
        {
          slug: "probe-race",
          dir: probeRaceDir,
          dbMode: "skip",
          doctor: false,
          json: true,
          primaryRepoRoot: repo,
        },
        {
          execCommand: () => {},
          checkPortAvailable: async () => {
            if (!createdDuringProbe) {
              createdDuringProbe = true;
              mkdirSync(probeRaceDir, { recursive: true });
              writeFileSync(join(probeRaceDir, "external.txt"), "keep me\n", "utf8");
            }
            return true;
          },
        },
      ),
    ).rejects.toThrow(/already exists/);

    expect(existsSync(join(probeRaceDir, "external.txt"))).toBe(true);
    expect(readFileSync(join(probeRaceDir, "external.txt"), "utf8")).toBe("keep me\n");
    expect(git(repo, ["branch", "--list", "worktree/probe-race"])).toBe("");

    // Case 2: External process populates targetDir right before `git worktree add` runs,
    // exercising the rollback catch block after worktreeAddAttempted = true.
    const gitRaceDir = join(customParent, "git-race");

    const realGit = (dir: string, args: readonly string[]) =>
      execFileSync("git", ["-c", "commit.gpgsign=false", ...args], {
        cwd: dir,
        encoding: "utf8",
        env: isolatedGitEnv(),
      });

    await expect(
      createWorktree(
        {
          slug: "git-race",
          dir: gitRaceDir,
          dbMode: "skip",
          doctor: false,
          json: true,
          primaryRepoRoot: repo,
        },
        {
          execGit: (dir, args) => {
            if (args[0] === "worktree" && args[1] === "add") {
              mkdirSync(gitRaceDir, { recursive: true });
              writeFileSync(join(gitRaceDir, "external.txt"), "do not remove\n", "utf8");
            }
            return realGit(dir, args);
          },
          execCommand: () => {},
          checkPortAvailable: async () => true,
        },
      ),
    ).rejects.toThrow();

    expect(existsSync(join(gitRaceDir, "external.txt"))).toBe(true);
    expect(readFileSync(join(gitRaceDir, "external.txt"), "utf8")).toBe("do not remove\n");
    expect(git(repo, ["branch", "--list", "worktree/git-race"])).toBe("");
    expect(readWorktreeRegistry(repo).worktrees["git-race"]).toBeUndefined();
  });

  test("cleanWorktree refuses while status is creating, refuses concurrent clean owning cleanToken, and checks claim before DB drop", async () => {
    const repo = initTempRepo(false);
    const bootstrapStarted = createDeferred<void>();
    const releaseBootstrap = createDeferred<void>();
    let pausedBootstrap = false;

    const createPromise = createWorktree(
      {
        slug: "lifecycle",
        dbMode: "required",
        doctor: false,
        json: true,
        primaryRepoRoot: repo,
      },
      {
        execCommand: async () => {
          if (!pausedBootstrap) {
            pausedBootstrap = true;
            bootstrapStarted.resolve();
            await releaseBootstrap.promise;
          }
        },
        checkPortAvailable: async () => true,
        isPostgresReachable: async () => true,
        ensureDatabase: async () => ({ created: true }),
      },
    );

    await bootstrapStarted.promise;

    // While bootstrap is in progress, the record is reserved as "creating" and hidden from listWorktrees.
    expect(readWorktreeRegistry(repo).worktrees.lifecycle?.status).toBe("creating");
    expect(listWorktrees({ primaryRepoRoot: repo })).toEqual([]);

    const dropDuringCreate = vi.fn();
    await expect(
      cleanWorktree(
        { slug: "lifecycle", keepBranch: false, json: true, primaryRepoRoot: repo },
        { isPostgresReachable: async () => true, dropDatabase: dropDuringCreate },
      ),
    ).rejects.toThrow(/currently being created/);
    expect(dropDuringCreate).not.toHaveBeenCalled();

    await expect(
      createWorktree(
        {
          slug: "lifecycle",
          dbMode: "skip",
          doctor: false,
          json: true,
          primaryRepoRoot: repo,
        },
        {
          execCommand: () => {},
          checkPortAvailable: async () => true,
        },
      ),
    ).rejects.toThrow(/currently being created/);

    releaseBootstrap.resolve();
    const created = await createPromise;
    expect(readWorktreeRegistry(repo).worktrees.lifecycle?.status).toBe("active");
    expect(readWorktreeRegistry(repo).worktrees.lifecycle?.databaseCreated).toBe(true);
    expect(existsSync(created.path)).toBe(true);

    // Pause clean A during dropDatabase so clean B attempts a concurrent clean while cleanToken is held.
    const dropStarted = createDeferred<void>();
    const releaseDrop = createDeferred<void>();
    const droppedByA: string[] = [];
    const droppedByB = vi.fn();

    const cleanA = cleanWorktree(
      { slug: "lifecycle", keepBranch: false, json: true, primaryRepoRoot: repo },
      {
        isPostgresReachable: async () => true,
        dropDatabase: async (name) => {
          dropStarted.resolve();
          await releaseDrop.promise;
          droppedByA.push(name);
        },
      },
    );

    await dropStarted.promise;
    const midCleanRecord = readWorktreeRegistry(repo).worktrees.lifecycle;
    expect(midCleanRecord?.status).toBe("cleaning");
    expect(typeof midCleanRecord?.cleanToken).toBe("string");
    expect(midCleanRecord?.cleanToken?.length).toBeGreaterThan(0);

    await expect(
      cleanWorktree(
        { slug: "lifecycle", keepBranch: false, json: true, primaryRepoRoot: repo },
        { isPostgresReachable: async () => true, dropDatabase: droppedByB },
      ),
    ).rejects.toThrow(/already being cleaned/);
    expect(droppedByB).not.toHaveBeenCalled();

    releaseDrop.resolve();
    const cleanAResult = await cleanA;
    expect(cleanAResult).toMatchObject({
      slug: "lifecycle",
      databaseDropped: true,
      registryRemoved: true,
    });
    expect(droppedByA).toEqual(["merit_lifecycle"]);
    expect(readWorktreeRegistry(repo).worktrees.lifecycle).toBeUndefined();

    // Verify cleanWorktree re-checks cleanToken before dropping the DB and does not touch a foreign record.
    await createWorktree(
      {
        slug: "claim-check",
        dbMode: "skip",
        doctor: false,
        json: true,
        primaryRepoRoot: repo,
      },
      {
        execCommand: () => {},
        checkPortAvailable: async () => true,
      },
    );
    const dropAfterHijack = vi.fn();
    await expect(
      cleanWorktree(
        { slug: "claim-check", keepBranch: false, json: true, primaryRepoRoot: repo },
        {
          isPostgresReachable: async () => {
            const reg = readWorktreeRegistry(repo);
            reg.worktrees["claim-check"]!.cleanToken = "foreign-clean-token";
            writeWorktreeRegistry(repo, reg);
            return true;
          },
          dropDatabase: dropAfterHijack,
        },
      ),
    ).rejects.toThrow(/no longer matches this cleanup claim/);
    expect(dropAfterHijack).not.toHaveBeenCalled();
    expect(readWorktreeRegistry(repo).worktrees["claim-check"]?.cleanToken).toBe(
      "foreign-clean-token",
    );

    // Also verify cleanWorktree checks cleanToken before removing the registry entry at the end.
    await createWorktree(
      {
        slug: "claim-end",
        dbMode: "skip",
        doctor: false,
        json: true,
        primaryRepoRoot: repo,
      },
      {
        execCommand: () => {},
        checkPortAvailable: async () => true,
      },
    );
    await expect(
      cleanWorktree(
        { slug: "claim-end", keepBranch: false, json: true, primaryRepoRoot: repo },
        {
          isPostgresReachable: async () => true,
          dropDatabase: async () => {
            const reg = readWorktreeRegistry(repo);
            reg.worktrees["claim-end"]!.cleanToken = "end-foreign-token";
            writeWorktreeRegistry(repo, reg);
          },
        },
      ),
    ).rejects.toThrow(/no longer matches this cleanup claim/);
    expect(readWorktreeRegistry(repo).worktrees["claim-end"]?.cleanToken).toBe("end-foreign-token");
  });

  test("createWorktree refreshes active Git worktrees after port probes and rejects newly overlapping worktrees", async () => {
    const repo = initTempRepo(false);
    const customParent = realpathSync(mkdtempSync(join(tmpdir(), "merit-probe-overlap-")));
    tempDirs.push(customParent);
    const externalWorktreeDir = join(customParent, "group", "external-wt");
    const nestedTargetDir = join(externalWorktreeDir, "nested");

    let addedExternalDuringProbe = false;
    await expect(
      createWorktree(
        {
          slug: "late-overlap",
          dir: nestedTargetDir,
          dbMode: "skip",
          doctor: false,
          json: true,
          primaryRepoRoot: repo,
        },
        {
          execCommand: () => {},
          checkPortAvailable: async () => {
            if (!addedExternalDuringProbe) {
              addedExternalDuringProbe = true;
              mkdirSync(dirname(externalWorktreeDir), { recursive: true });
              git(repo, ["worktree", "add", "-b", "feat/external-wt", externalWorktreeDir, "main"]);
            }
            return true;
          },
        },
      ),
    ).rejects.toThrow(/overlaps existing worktree/);

    expect(existsSync(externalWorktreeDir)).toBe(true);
    expect(existsSync(nestedTargetDir)).toBe(false);
    expect(git(repo, ["branch", "--list", "worktree/late-overlap"])).toBe("");
    expect(readWorktreeRegistry(repo).worktrees["late-overlap"]).toBeUndefined();
  });

  test("createWorktree rollback preserves original error, drops DB, and keeps a checkout and registry record that Git refuses to remove", async () => {
    const repo = initTempRepo(false);
    const droppedDbs: string[] = [];
    const expectedPath = join(repo, ".tmp/worktrees/stuck-checkout");

    await expect(
      createWorktree(
        {
          slug: "stuck-checkout",
          branch: "feat/stuck-branch",
          dbMode: "required",
          doctor: true,
          json: true,
          primaryRepoRoot: repo,
        },
        {
          execCommand: (_command, args) => {
            if (args.includes("--doctor")) {
              // Someone locks the checkout during bootstrap, so Git refuses `worktree remove --force`.
              writeFileSync(join(expectedPath, "work.txt"), "keep me\n", "utf8");
              git(repo, ["worktree", "lock", expectedPath]);
              throw new Error("doctor check failed");
            }
          },
          checkPortAvailable: async () => true,
          isPostgresReachable: async () => true,
          ensureDatabase: async () => ({ created: true }),
          dropDatabase: async (name) => {
            droppedDbs.push(name);
          },
        },
      ),
    ).rejects.toThrow(/doctor check failed.*rollback could not remove checkout.*locked/s);

    expect(droppedDbs).toEqual(["merit_stuck_checkout"]);
    expect(readFileSync(join(expectedPath, "work.txt"), "utf8")).toBe("keep me\n");
    expect(existsSync(join(expectedPath, ".git"))).toBe(true);

    const retained = readWorktreeRegistry(repo).worktrees["stuck-checkout"];
    expect(retained).toMatchObject({
      slug: "stuck-checkout",
      path: expectedPath,
      branch: "feat/stuck-branch",
      databaseCreated: false,
      status: "cleaning",
    });
    expect(retained?.gitDir).toBeTruthy();
    expect(retained?.partialRemoval).toBeUndefined();

    // Once the operator unlocks it, worktree:clean removes the remaining checkout, branch, and record.
    git(repo, ["worktree", "unlock", expectedPath]);
    const cleaned = await cleanWorktree(
      { slug: "stuck-checkout", keepBranch: false, json: true, primaryRepoRoot: repo },
      { isPostgresReachable: async () => false },
    );
    expect(cleaned).toMatchObject({
      slug: "stuck-checkout",
      worktreeRemoved: true,
      branchDeleted: true,
      registryRemoved: true,
    });
    expect(existsSync(expectedPath)).toBe(false);
    expect(git(repo, ["branch", "--list", "feat/stuck-branch"])).toBe("");
    expect(readWorktreeRegistry(repo).worktrees["stuck-checkout"]).toBeUndefined();
  });

  test("cleanWorktree holds the registry lock across unrecorded DB drop so concurrent same-slug create cannot interleave", async () => {
    const repo = initTempRepo(false);
    const events: string[] = [];
    const dropStarted = createDeferred<void>();
    const releaseDrop = createDeferred<void>();
    const createReadyForLock = createDeferred<void>();
    let createEnteredCriticalSection = false;

    const lockOptions = { initialDelayMs: 5, maxDelayMs: 15, timeoutMs: 5_000 };

    const cleanPromise = cleanWorktree(
      { slug: "unrecorded-race", keepBranch: false, json: true, primaryRepoRoot: repo },
      {
        isPostgresReachable: async () => true,
        dropDatabase: async (name) => {
          events.push(`drop:start:${name}`);
          dropStarted.resolve();
          await releaseDrop.promise;
          events.push(`drop:end:${name}`);
        },
        lockOptions,
      },
    );

    await dropStarted.promise;
    expect(existsSync(registryLockPathForRepo(repo))).toBe(true);

    const createPromise = createWorktree(
      {
        slug: "unrecorded-race",
        dbMode: "required",
        doctor: false,
        json: true,
        primaryRepoRoot: repo,
      },
      {
        execCommand: () => {},
        checkPortAvailable: async () => {
          createEnteredCriticalSection = true;
          return true;
        },
        isPostgresReachable: async () => {
          createReadyForLock.resolve();
          return true;
        },
        ensureDatabase: async (name) => {
          events.push(`create:db:${name}`);
          return { created: true };
        },
        lockOptions,
      },
    );

    await createReadyForLock.promise;
    await Promise.resolve();
    await Promise.resolve();
    expect(createEnteredCriticalSection).toBe(false);

    releaseDrop.resolve();
    const [cleanResult, createResult] = await Promise.all([cleanPromise, createPromise]);

    expect(createEnteredCriticalSection).toBe(true);
    expect(cleanResult).toMatchObject({
      slug: "unrecorded-race",
      databaseDropped: true,
      registryRemoved: false,
    });
    expect(createResult.databaseCreated).toBe(true);
    expect(events).toEqual([
      "drop:start:merit_unrecorded_race",
      "drop:end:merit_unrecorded_race",
      "create:db:merit_unrecorded_race",
    ]);
    expect(readWorktreeRegistry(repo).worktrees["unrecorded-race"]?.status).toBe("active");
  });

  test("cleanWorktree refuses cleanup and preserves a replacement checkout when another worktree occupies the recorded path", async () => {
    const repo = initTempRepo(false);
    const movedParent = realpathSync(mkdtempSync(join(tmpdir(), "merit-moved-wt-")));
    tempDirs.push(movedParent);
    const movedAlphaPath = join(movedParent, "alpha-moved");

    const alpha = await createWorktree(
      {
        slug: "alpha",
        dbMode: "skip",
        doctor: false,
        json: true,
        primaryRepoRoot: repo,
      },
      {
        execCommand: () => {},
        checkPortAvailable: async () => true,
      },
    );

    const recordedAlpha = readWorktreeRegistry(repo).worktrees.alpha;
    expect(recordedAlpha?.gitDir).toBeTruthy();

    // Move alpha away and create a different linked worktree at alpha's old path.
    git(repo, ["worktree", "move", alpha.path, movedAlphaPath]);
    git(repo, ["worktree", "add", "-b", "feat/replacement", alpha.path, "main"]);
    writeFileSync(join(alpha.path, "replacement-marker.txt"), "preserve me\n", "utf8");

    const dropDatabase = vi.fn();
    await expect(
      cleanWorktree(
        { slug: "alpha", keepBranch: false, json: true, primaryRepoRoot: repo },
        { isPostgresReachable: async () => true, dropDatabase },
      ),
    ).rejects.toThrow(/registered checkout was moved to ".*alpha-moved"/);

    expect(dropDatabase).not.toHaveBeenCalled();
    expect(existsSync(join(alpha.path, "replacement-marker.txt"))).toBe(true);
    expect(readFileSync(join(alpha.path, "replacement-marker.txt"), "utf8")).toBe("preserve me\n");
    expect(existsSync(movedAlphaPath)).toBe(true);
    expect(git(repo, ["branch", "--list", "feat/replacement"])).toContain("feat/replacement");
    expect(git(repo, ["branch", "--list", "worktree/alpha"])).toContain("worktree/alpha");
    expect(readWorktreeRegistry(repo).worktrees.alpha?.status).toBe("active");
  });

  test("createWorktree records partial removal with its identity so retry cleanWorktree removes residue but rejects a replacement checkout", async () => {
    const repo = initTempRepo(false);
    const droppedDbs: string[] = [];

    const realGit = (dir: string, args: readonly string[]) =>
      execFileSync("git", ["-c", "commit.gpgsign=false", ...args], {
        cwd: dir,
        encoding: "utf8",
        env: isolatedGitEnv(),
      });

    await expect(
      createWorktree(
        {
          slug: "partial-rollback",
          branch: "feat/partial-rollback",
          dbMode: "required",
          doctor: true,
          json: true,
          primaryRepoRoot: repo,
        },
        {
          execGit: (dir, args) => {
            if (args[0] === "worktree" && args[1] === "remove") {
              // Simulate Git deleting the checkout `.git` before failing on a remaining file.
              rmSync(join(args[3] ?? "", ".git"), { force: true });
              throw new Error("EACCES: partial directory removal failed");
            }
            return realGit(dir, args);
          },
          execCommand: (_command, args) => {
            if (args.includes("--doctor")) {
              throw new Error("doctor check failed");
            }
          },
          checkPortAvailable: async () => true,
          isPostgresReachable: async () => true,
          ensureDatabase: async () => ({ created: true }),
          dropDatabase: async (name) => {
            droppedDbs.push(name);
          },
        },
      ),
    ).rejects.toThrow(
      /doctor check failed.*rollback could not remove checkout.*EACCES: partial directory removal failed/,
    );

    const expectedPath = join(repo, ".tmp/worktrees/partial-rollback");
    expect(droppedDbs).toEqual(["merit_partial_rollback"]);
    expect(existsSync(expectedPath)).toBe(true);
    expect(existsSync(join(expectedPath, ".git"))).toBe(false);

    const retained = readWorktreeRegistry(repo).worktrees["partial-rollback"];
    expect(retained).toMatchObject({
      slug: "partial-rollback",
      path: expectedPath,
      branch: "feat/partial-rollback",
      databaseCreated: false,
      status: "cleaning",
      partialRemoval: true,
    });
    expect(retained?.gitDir).toBeTruthy();
    expect(retained?.checkoutToken).toBeTruthy();
    expect(retained?.ownerPid).toBeUndefined();

    // A replacement checkout at the residue path reuses the pruned `.git/worktrees/<id>` name, but
    // lacks this worktree's checkout token, so cleanup must refuse it.
    const residueSnapshot = realpathSync(mkdtempSync(join(tmpdir(), "merit-residue-")));
    tempDirs.push(residueSnapshot);
    rmSync(residueSnapshot, { recursive: true, force: true });
    renameSync(expectedPath, residueSnapshot);
    git(repo, ["worktree", "add", "-b", "feat/replacement", expectedPath, "main"]);
    expect(readWorktreeRegistry(repo).worktrees["partial-rollback"]?.gitDir).toBe(
      realpathSync(join(repo, ".git/worktrees/partial-rollback")),
    );
    writeFileSync(join(expectedPath, "replacement-marker.txt"), "preserve me\n", "utf8");
    await expect(
      cleanWorktree(
        { slug: "partial-rollback", keepBranch: false, json: true, primaryRepoRoot: repo },
        { isPostgresReachable: async () => false },
      ),
    ).rejects.toThrow(/belongs to a different checkout/);
    expect(readFileSync(join(expectedPath, "replacement-marker.txt"), "utf8")).toBe(
      "preserve me\n",
    );
    git(repo, ["worktree", "remove", "--force", expectedPath]);
    renameSync(residueSnapshot, expectedPath);

    // With only the residue left (no `.git`), retrying cleanWorktree removes it.
    const cleaned = await cleanWorktree(
      { slug: "partial-rollback", keepBranch: false, json: true, primaryRepoRoot: repo },
      { isPostgresReachable: async () => false },
    );
    expect(cleaned).toMatchObject({
      slug: "partial-rollback",
      worktreeRemoved: true,
      branchDeleted: true,
      registryRemoved: true,
    });
    expect(existsSync(expectedPath)).toBe(false);
    expect(git(repo, ["branch", "--list", "feat/partial-rollback"])).toBe("");
    expect(readWorktreeRegistry(repo).worktrees["partial-rollback"]).toBeUndefined();
  });

  test("cleanWorktree refuses unrecorded slug cleanup when its default path matches or overlaps another registered slug", async () => {
    const repo = initTempRepo(false);
    const alphaDefaultPath = join(repo, ".tmp/worktrees/alpha");
    const nestedUnderDeltaPath = join(repo, ".tmp/worktrees/delta/nested");

    const beta = await createWorktree(
      {
        slug: "beta",
        dir: alphaDefaultPath,
        dbMode: "skip",
        doctor: false,
        json: true,
        primaryRepoRoot: repo,
      },
      {
        execCommand: () => {},
        checkPortAvailable: async () => true,
      },
    );
    writeFileSync(join(beta.path, "beta-marker.txt"), "owned by beta\n", "utf8");

    const gamma = await createWorktree(
      {
        slug: "gamma",
        dir: nestedUnderDeltaPath,
        dbMode: "skip",
        doctor: false,
        json: true,
        primaryRepoRoot: repo,
      },
      {
        execCommand: () => {},
        checkPortAvailable: async () => true,
      },
    );
    writeFileSync(join(gamma.path, "gamma-marker.txt"), "owned by gamma\n", "utf8");

    const dropDatabase = vi.fn();

    // Exact path collision: unrecorded "alpha" defaults to beta's custom path.
    await expect(
      cleanWorktree(
        { slug: "alpha", keepBranch: false, json: true, primaryRepoRoot: repo },
        { isPostgresReachable: async () => true, dropDatabase },
      ),
    ).rejects.toThrow(/overlaps registered worktree "beta"/);

    // Ancestor/nested path overlap: unrecorded "delta" contains gamma's custom path.
    await expect(
      cleanWorktree(
        { slug: "delta", keepBranch: false, json: true, primaryRepoRoot: repo },
        { isPostgresReachable: async () => true, dropDatabase },
      ),
    ).rejects.toThrow(/overlaps registered worktree "gamma"/);

    expect(dropDatabase).not.toHaveBeenCalled();
    expect(readFileSync(join(beta.path, "beta-marker.txt"), "utf8")).toBe("owned by beta\n");
    expect(readFileSync(join(gamma.path, "gamma-marker.txt"), "utf8")).toBe("owned by gamma\n");
    expect(git(repo, ["branch", "--list", "worktree/beta"])).toContain("worktree/beta");
    expect(git(repo, ["branch", "--list", "worktree/gamma"])).toContain("worktree/gamma");
    expect(readWorktreeRegistry(repo).worktrees.beta?.status).toBe("active");
    expect(readWorktreeRegistry(repo).worktrees.gamma?.status).toBe("active");
  });

  test("cleanWorktree rejects a replacement checkout that reuses the recorded path and Git metadata name", async () => {
    const repo = initTempRepo(false);
    const alpha = await createWorktree(
      { slug: "alpha", dbMode: "skip", doctor: false, json: true, primaryRepoRoot: repo },
      { execCommand: () => {}, checkPortAvailable: async () => true },
    );
    const recordedAlpha = readWorktreeRegistry(repo).worktrees.alpha;
    expect(recordedAlpha?.checkoutToken).toBeTruthy();

    // Removing alpha with Git frees `.git/worktrees/alpha`, so the replacement reuses that name.
    git(repo, ["worktree", "remove", "--force", alpha.path]);
    git(repo, ["worktree", "add", "-b", "feat/replacement", alpha.path, "main"]);
    expect(realpathSync(join(repo, ".git/worktrees/alpha"))).toBe(recordedAlpha?.gitDir);
    writeFileSync(join(alpha.path, "replacement-marker.txt"), "preserve me\n", "utf8");

    const dropDatabase = vi.fn();
    await expect(
      cleanWorktree(
        { slug: "alpha", keepBranch: false, json: true, primaryRepoRoot: repo },
        { isPostgresReachable: async () => true, dropDatabase },
      ),
    ).rejects.toThrow(/belongs to a different checkout/);
    expect(dropDatabase).not.toHaveBeenCalled();
    expect(readFileSync(join(alpha.path, "replacement-marker.txt"), "utf8")).toBe("preserve me\n");
    expect(git(repo, ["branch", "--list", "feat/replacement"])).toContain("feat/replacement");
  });

  test("cleanWorktree surfaces Git removal failures without deleting the checkout and recovers residue after Git drops its metadata", async () => {
    const repo = initTempRepo(false);
    const created = await createWorktree(
      { slug: "git-fails", dbMode: "skip", doctor: false, json: true, primaryRepoRoot: repo },
      { execCommand: () => {}, checkPortAvailable: async () => true },
    );
    writeFileSync(join(created.path, "work.txt"), "uncommitted\n", "utf8");

    const realGit = (dir: string, args: readonly string[]) =>
      execFileSync("git", ["-c", "commit.gpgsign=false", ...args], {
        cwd: dir,
        encoding: "utf8",
        env: isolatedGitEnv(),
      });

    const dropDatabase = vi.fn();

    // Git refuses for a reason other than a lock: nothing may be deleted recursively.
    await expect(
      cleanWorktree(
        { slug: "git-fails", keepBranch: false, json: true, primaryRepoRoot: repo },
        {
          execGit: (dir, args) => {
            if (args[0] === "worktree" && args[1] === "remove") {
              throw new Error("git worktree remove: permission denied");
            }
            return realGit(dir, args);
          },
          isPostgresReachable: async () => true,
          dropDatabase,
        },
      ),
    ).rejects.toThrow(/permission denied/);
    expect(readFileSync(join(created.path, "work.txt"), "utf8")).toBe("uncommitted\n");
    expect(dropDatabase).not.toHaveBeenCalled();
    const afterRefusal = readWorktreeRegistry(repo).worktrees["git-fails"];
    expect(afterRefusal).toMatchObject({ status: "cleaning" });
    expect(afterRefusal?.partialRemoval).toBeUndefined();
    expect(afterRefusal?.cleanToken).toBeUndefined();

    // Git removes the checkout `.git` and then fails on the remaining files.
    await expect(
      cleanWorktree(
        { slug: "git-fails", keepBranch: false, json: true, primaryRepoRoot: repo },
        {
          execGit: (dir, args) => {
            if (args[0] === "worktree" && args[1] === "remove") {
              rmSync(join(created.path, ".git"), { force: true });
              throw new Error("git worktree remove: failed to delete remaining files");
            }
            return realGit(dir, args);
          },
          isPostgresReachable: async () => true,
          dropDatabase,
        },
      ),
    ).rejects.toThrow(/failed to delete remaining files/);
    expect(existsSync(join(created.path, "work.txt"))).toBe(true);
    expect(readWorktreeRegistry(repo).worktrees["git-fails"]).toMatchObject({
      status: "cleaning",
      partialRemoval: true,
    });

    const cleaned = await cleanWorktree(
      { slug: "git-fails", keepBranch: false, json: true, primaryRepoRoot: repo },
      { isPostgresReachable: async () => true, dropDatabase },
    );
    expect(cleaned).toMatchObject({ worktreeRemoved: true, registryRemoved: true });
    expect(existsSync(created.path)).toBe(false);
    expect(dropDatabase).toHaveBeenCalledExactlyOnceWith("merit_git_fails");
  });

  test("cleanWorktree refuses to remove a checkout that contains another Git worktree", async () => {
    const repo = initTempRepo(false);
    const alpha = await createWorktree(
      { slug: "alpha", dbMode: "skip", doctor: false, json: true, primaryRepoRoot: repo },
      { execCommand: () => {}, checkPortAvailable: async () => true },
    );
    const nestedPath = join(alpha.path, "nested-raw");
    git(repo, ["worktree", "add", "-b", "feat/nested-raw", nestedPath, "main"]);
    writeFileSync(join(nestedPath, "nested-marker.txt"), "preserve me\n", "utf8");

    const dropDatabase = vi.fn();
    await expect(
      cleanWorktree(
        { slug: "alpha", keepBranch: false, json: true, primaryRepoRoot: repo },
        { isPostgresReachable: async () => true, dropDatabase },
      ),
    ).rejects.toThrow(/contains another worktree/);
    expect(dropDatabase).not.toHaveBeenCalled();
    expect(readFileSync(join(nestedPath, "nested-marker.txt"), "utf8")).toBe("preserve me\n");
    expect(readWorktreeRegistry(repo).worktrees.alpha?.status).toBe("active");
  });

  test("an interrupted create whose owner process exited does not block worktree:clean", async () => {
    const repo = initTempRepo(false);
    await createWorktree(
      { slug: "killed", dbMode: "skip", doctor: false, json: true, primaryRepoRoot: repo },
      { execCommand: () => {}, checkPortAvailable: async () => true },
    );
    const exitedPid = spawnSync(process.execPath, ["-e", ""]).pid;
    const registry = readWorktreeRegistry(repo);
    registry.worktrees.killed = {
      ...registry.worktrees.killed!,
      status: "creating",
      ownerPid: exitedPid,
    };
    writeWorktreeRegistry(repo, registry);

    expect(listWorktrees({ primaryRepoRoot: repo })).toEqual([]);
    await expect(
      createWorktree(
        { slug: "killed", dbMode: "skip", doctor: false, json: true, primaryRepoRoot: repo },
        { execCommand: () => {}, checkPortAvailable: async () => true },
      ),
    ).rejects.toThrow(/was interrupted.*worktree:clean killed/);

    const cleaned = await cleanWorktree(
      { slug: "killed", keepBranch: false, json: true, primaryRepoRoot: repo },
      { isPostgresReachable: async () => false },
    );
    expect(cleaned).toMatchObject({ worktreeRemoved: true, registryRemoved: true });
    expect(readWorktreeRegistry(repo).worktrees.killed).toBeUndefined();
  });

  test("createWorktree rollback preserves another linked checkout that took the target before git worktree add", async () => {
    const repo = initTempRepo(false);
    const customParent = realpathSync(mkdtempSync(join(tmpdir(), "merit-add-race-")));
    tempDirs.push(customParent);
    const targetDir = join(customParent, "contested");

    const realGit = (dir: string, args: readonly string[]) =>
      execFileSync("git", ["-c", "commit.gpgsign=false", ...args], {
        cwd: dir,
        encoding: "utf8",
        env: isolatedGitEnv(),
      });

    let raced = false;

    await expect(
      createWorktree(
        {
          slug: "contested",
          dir: targetDir,
          dbMode: "skip",
          doctor: false,
          json: true,
          primaryRepoRoot: repo,
        },
        {
          execGit: (dir, args) => {
            if (!raced && args[0] === "worktree" && args[1] === "add") {
              raced = true;
              realGit(repo, ["worktree", "add", "-b", "feat/other-job", targetDir, "main"]);
              writeFileSync(join(targetDir, "other-job.txt"), "keep me\n", "utf8");
            }
            return realGit(dir, args);
          },
          execCommand: () => {},
          checkPortAvailable: async () => true,
        },
      ),
    ).rejects.toThrow(/rollback preserved .*contested/);

    expect(readFileSync(join(targetDir, "other-job.txt"), "utf8")).toBe("keep me\n");
    expect(git(repo, ["worktree", "list", "--porcelain"])).toContain(targetDir);
    expect(git(repo, ["branch", "--list", "feat/other-job"])).toContain("feat/other-job");
    expect(readWorktreeRegistry(repo).worktrees.contested).toBeUndefined();
  });

  test("createWorktree never assigns ports the primary checkout's .env.local files configure", async () => {
    const repo = initTempRepo(false);
    mkdirSync(join(repo, "app"), { recursive: true });
    writeFileSync(join(repo, "app/.env.local"), "MERIT_DEV_PORT=3100\n", "utf8");
    writeFileSync(join(repo, ".env.local"), "MERIT_STORYBOOK_PORT=6117\n", "utf8");

    const created = await createWorktree(
      { slug: "alpha", dbMode: "skip", doctor: false, json: true, primaryRepoRoot: repo },
      { execCommand: () => {}, checkPortAvailable: async () => true },
    );

    expect(created.ports).toEqual({
      MERIT_DEV_PORT: 3120,
      MERIT_APP_PORT: 3121,
      MERIT_WORKSPACE_PORT: 3122,
      MERIT_STORYBOOK_DEV_PORT: 6126,
      MERIT_STORYBOOK_PORT: 6127,
    });
  });

  test("a checkout moved with git worktree move keeps its ports and refuses cleanup until moved back", async () => {
    const repo = initTempRepo(false);
    const movedParent = realpathSync(mkdtempSync(join(tmpdir(), "merit-moved-only-")));
    tempDirs.push(movedParent);
    const movedPath = join(movedParent, "alpha-moved");
    const deps = { execCommand: () => {}, checkPortAvailable: async () => true };

    const alpha = await createWorktree(
      { slug: "alpha", dbMode: "skip", doctor: false, json: true, primaryRepoRoot: repo },
      deps,
    );
    git(repo, ["worktree", "move", alpha.path, movedPath]);

    // The moved checkout's `.env.local` still uses alpha's ports, so beta must not receive them.
    const beta = await createWorktree(
      { slug: "beta", dbMode: "skip", doctor: false, json: true, primaryRepoRoot: repo },
      deps,
    );
    expect(Object.values(beta.ports)).not.toContain(alpha.ports.MERIT_DEV_PORT);

    const dropDatabase = vi.fn(async () => {});
    await expect(
      cleanWorktree(
        { slug: "alpha", keepBranch: false, json: true, primaryRepoRoot: repo },
        { isPostgresReachable: async () => true, dropDatabase },
      ),
    ).rejects.toThrow(/registered checkout was moved to ".*alpha-moved".*git worktree move/);
    expect(dropDatabase).not.toHaveBeenCalled();
    expect(existsSync(movedPath)).toBe(true);
    expect(readWorktreeRegistry(repo).worktrees.alpha?.status).toBe("active");

    git(repo, ["worktree", "move", movedPath, alpha.path]);
    const cleaned = await cleanWorktree(
      { slug: "alpha", keepBranch: false, json: true, primaryRepoRoot: repo },
      { isPostgresReachable: async () => true, dropDatabase },
    );
    expect(cleaned).toMatchObject({ worktreeRemoved: true, registryRemoved: true });
    expect(dropDatabase).toHaveBeenCalledExactlyOnceWith("merit_alpha");
  });

  test("createWorktree rollback keeps a branch that another job created after the last branch check", async () => {
    const repo = initTempRepo(false);
    let raced = false;

    const realGit = (dir: string, args: readonly string[]) =>
      execFileSync("git", ["-c", "commit.gpgsign=false", ...args], {
        cwd: dir,
        encoding: "utf8",
        env: isolatedGitEnv(),
      });

    await expect(
      createWorktree(
        {
          slug: "raced-branch",
          branch: "feat/raced",
          dbMode: "skip",
          doctor: false,
          json: true,
          primaryRepoRoot: repo,
        },
        {
          execGit: (dir, args) => {
            // Another job creates the branch just before this attempt does.
            const createsBranch =
              (args[0] === "worktree" && args[1] === "add") ||
              (args[0] === "branch" && args[1] === "feat/raced");
            if (!raced && createsBranch) {
              raced = true;
              realGit(repo, ["branch", "feat/raced", "main"]);
            }
            return realGit(dir, args);
          },
          execCommand: () => {},
          checkPortAvailable: async () => true,
        },
      ),
    ).rejects.toThrow(/already exists/);

    expect(git(repo, ["branch", "--list", "feat/raced"])).toContain("feat/raced");
    expect(existsSync(join(repo, ".tmp/worktrees/raced-branch"))).toBe(false);
    expect(readWorktreeRegistry(repo).worktrees["raced-branch"]).toBeUndefined();
  });

  test("cleanWorktree tells the operator how to recover residue of an interrupted removal outside .tmp/worktrees", async () => {
    const repo = initTempRepo(false);
    const customParent = realpathSync(mkdtempSync(join(tmpdir(), "merit-external-residue-")));
    tempDirs.push(customParent);
    const created = await createWorktree(
      {
        slug: "external",
        dir: join(customParent, "external"),
        dbMode: "skip",
        doctor: false,
        json: true,
        primaryRepoRoot: repo,
      },
      { execCommand: () => {}, checkPortAvailable: async () => true },
    );
    writeFileSync(join(created.path, "work.txt"), "uncommitted\n", "utf8");

    const realGit = (dir: string, args: readonly string[]) =>
      execFileSync("git", ["-c", "commit.gpgsign=false", ...args], {
        cwd: dir,
        encoding: "utf8",
        env: isolatedGitEnv(),
      });

    await expect(
      cleanWorktree(
        { slug: "external", keepBranch: false, json: true, primaryRepoRoot: repo },
        {
          execGit: (dir, args) => {
            if (args[0] === "worktree" && args[1] === "remove") {
              rmSync(join(created.path, ".git"), { force: true });
              throw new Error("git worktree remove: failed to delete remaining files");
            }
            return realGit(dir, args);
          },
          isPostgresReachable: async () => false,
        },
      ),
    ).rejects.toThrow(/failed to delete remaining files/);
    expect(readWorktreeRegistry(repo).worktrees.external?.partialRemoval).toBe(true);

    await expect(
      cleanWorktree(
        { slug: "external", keepBranch: false, json: true, primaryRepoRoot: repo },
        { isPostgresReachable: async () => false },
      ),
    ).rejects.toThrow(
      /interrupted removal of worktree "external".*delete it yourself, and rerun `vp run worktree:clean external`/,
    );
    expect(readFileSync(join(created.path, "work.txt"), "utf8")).toBe("uncommitted\n");

    rmSync(created.path, { recursive: true, force: true });
    const cleaned = await cleanWorktree(
      { slug: "external", keepBranch: false, json: true, primaryRepoRoot: repo },
      { isPostgresReachable: async () => false },
    );
    expect(cleaned).toMatchObject({ branchDeleted: true, registryRemoved: true });
    expect(readWorktreeRegistry(repo).worktrees.external).toBeUndefined();
  });

  test("createWorktree never assigns ports that a linked checkout's .env.local now configures, even after a move", async () => {
    const repo = initTempRepo(false);
    const movedParent = realpathSync(mkdtempSync(join(tmpdir(), "merit-moved-ports-")));
    tempDirs.push(movedParent);
    const movedPath = join(movedParent, "alpha-moved");
    const deps = { execCommand: () => {}, checkPortAvailable: async () => true };

    const alpha = await createWorktree(
      { slug: "alpha", dbMode: "skip", doctor: false, json: true, primaryRepoRoot: repo },
      deps,
    );
    git(repo, ["worktree", "move", alpha.path, movedPath]);
    // Idle alpha now overrides its recorded dev port with the next slot's port.
    mkdirSync(join(movedPath, "app"), { recursive: true });
    writeFileSync(join(movedPath, "app/.env.local"), "MERIT_DEV_PORT=3110\n", "utf8");

    const beta = await createWorktree(
      { slug: "beta", dbMode: "skip", doctor: false, json: true, primaryRepoRoot: repo },
      deps,
    );
    expect(beta.ports.MERIT_DEV_PORT).toBe(3120);
  });

  test("cleanWorktree re-checks the registry under the lock before deleting an unrecorded slug's branch", async () => {
    const repo = initTempRepo(false);
    const branch = "worktree/alpha";

    await expect(
      cleanWorktree(
        { slug: "alpha", keepBranch: false, json: true, primaryRepoRoot: repo },
        {
          // A same-slug create finishes its locked section after clean's first lock.
          isPostgresReachable: async () => {
            git(repo, ["branch", branch, "main"]);
            writeWorktreeRegistry(repo, {
              version: 1,
              worktrees: {
                alpha: {
                  slug: "alpha",
                  path: join(repo, ".tmp/worktrees/alpha"),
                  branch,
                  baseRef: "main",
                  databaseName: "merit_alpha",
                  databaseUrl: buildLocalDatabaseUrl("merit_alpha"),
                  databaseCreated: false,
                  ports: WORKTREE_PORT_BASES,
                  createdAt: new Date().toISOString(),
                  status: "creating",
                  ownerPid: process.pid,
                },
              },
            });
            return false;
          },
        },
      ),
    ).rejects.toThrow(/refusing to delete branch "worktree\/alpha"/);
    expect(git(repo, ["branch", "--list", branch])).toContain(branch);
    expect(readWorktreeRegistry(repo).worktrees.alpha?.status).toBe("creating");
  });

  test("listWorktrees follows a moved checkout by its token and ignores another checkout at its old path", async () => {
    const repo = initTempRepo(false);
    const movedParent = realpathSync(mkdtempSync(join(tmpdir(), "merit-moved-list-")));
    tempDirs.push(movedParent);
    const movedPath = join(movedParent, "alpha-moved");

    const alpha = await createWorktree(
      { slug: "alpha", dbMode: "skip", doctor: false, json: true, primaryRepoRoot: repo },
      { execCommand: () => {}, checkPortAvailable: async () => true },
    );
    git(repo, ["worktree", "move", alpha.path, movedPath]);
    git(repo, ["worktree", "add", "-b", "feat/other", alpha.path, "main"]);

    expect(listWorktrees({ primaryRepoRoot: repo })).toEqual([
      expect.objectContaining({
        slug: "alpha",
        path: movedPath,
        branch: "worktree/alpha",
        databaseName: "merit_alpha",
        ports: alpha.ports,
      }),
    ]);
  });

  test("cleanWorktree refuses an unrecorded slug whose default path holds a registered checkout moved there", async () => {
    const repo = initTempRepo(false);
    const alphaDefaultPath = join(repo, ".tmp/worktrees/alpha");

    const beta = await createWorktree(
      { slug: "beta", dbMode: "skip", doctor: false, json: true, primaryRepoRoot: repo },
      { execCommand: () => {}, checkPortAvailable: async () => true },
    );
    git(repo, ["worktree", "move", beta.path, alphaDefaultPath]);
    writeFileSync(join(alphaDefaultPath, "beta-work.txt"), "uncommitted\n", "utf8");

    const dropDatabase = vi.fn(async () => {});
    await expect(
      cleanWorktree(
        { slug: "alpha", keepBranch: false, json: true, primaryRepoRoot: repo },
        { isPostgresReachable: async () => true, dropDatabase },
      ),
    ).rejects.toThrow(/overlaps registered worktree "beta"/);
    expect(dropDatabase).not.toHaveBeenCalled();
    expect(readFileSync(join(alphaDefaultPath, "beta-work.txt"), "utf8")).toBe("uncommitted\n");
    expect(readWorktreeRegistry(repo).worktrees.beta?.status).toBe("active");
  });
});
