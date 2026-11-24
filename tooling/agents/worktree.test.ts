import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
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

const isolatedGitEnv = (): NodeJS.ProcessEnv => ({
  ...process.env,
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
});

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
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("worktree helpers", () => {
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

  test("refuses to drop protected databases or delete main during clean even if metadata is tampered with", async () => {
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

    // Even with a valid non-protected DB name, branch "main" is never deleted.
    const registry = readWorktreeRegistry(repo);
    registry.worktrees.tampered!.databaseName = "merit_tampered";
    writeWorktreeRegistry(repo, registry);

    const cleaned = await cleanWorktree(
      { slug: "tampered", keepBranch: false, json: true, primaryRepoRoot: repo },
      { isPostgresReachable: async () => true, dropDatabase },
    );
    expect(cleaned.branchDeleted).toBe(false);
    expect(git(repo, ["branch", "--list", "main"])).toContain("main");
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
    const hookPath = join(repo, ".git", "hooks", "post-checkout");
    writeFileSync(hookPath, "#!/usr/bin/env sh\nexit 1\n", "utf8");
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
});
