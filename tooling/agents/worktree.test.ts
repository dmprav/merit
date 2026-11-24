import { execFileSync } from "node:child_process";
import {
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

import { afterEach, describe, expect, test, vi } from "vite-plus/test";

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
  resolvePrimaryRepoRoot,
  validateWorktreeSlug,
  withWorktreeRegistryLock,
  WORKTREE_PORT_BASES,
  writeWorktreeRegistry,
} from "./worktree.ts";

const tempDirs: string[] = [];

const git = (cwd: string, args: readonly string[]) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

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

afterEach(() => {
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

  test("parses git worktree porcelain output and collects only active reserved ports", () => {
    const parsed = parseGitWorktreePorcelain(
      [
        "worktree /repo",
        "HEAD abcdef1234",
        "branch refs/heads/main",
        "",
        "worktree /repo/.tmp/worktrees/alpha",
        "HEAD 1234567890",
        "branch refs/heads/worktree/alpha",
        "",
      ].join("\n"),
    );
    expect(parsed).toEqual([
      { path: "/repo", head: "abcdef1234", branch: "main" },
      { path: "/repo/.tmp/worktrees/alpha", head: "1234567890", branch: "worktree/alpha" },
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

  test("serializes concurrent createWorktree calls to assign disjoint ports and preserve all registry records", async () => {
    const repo = initTempRepo(false);
    const createdDbs: string[] = [];

    const delay = (ms: number) =>
      new Promise<void>((resolveDelay) => {
        setTimeout(resolveDelay, ms);
      });

    const deps = {
      execCommand: async (command: string) => {
        if (command === "pnpm") {
          await delay(60);
        }
      },
      checkPortAvailable: async () => {
        await delay(10);
        return true;
      },
      isPostgresReachable: async () => true,
      ensureDatabase: async (name: string) => {
        await delay(20);
        createdDbs.push(name);
        return { created: true };
      },
    };

    const [alpha, beta] = await Promise.all([
      createWorktree(
        {
          slug: "alpha",
          dbMode: "required",
          doctor: false,
          json: true,
          primaryRepoRoot: repo,
        },
        deps,
      ),
      createWorktree(
        {
          slug: "beta",
          dbMode: "required",
          doctor: false,
          json: true,
          primaryRepoRoot: repo,
        },
        deps,
      ),
    ]);

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

  test("recovers stale registry lock files before acquiring the lock", async () => {
    const repo = initTempRepo(false);
    const lockPath = registryLockPathForRepo(repo);
    mkdirSync(join(repo, ".tmp/worktrees"), { recursive: true });
    writeFileSync(
      lockPath,
      `${JSON.stringify({ pid: process.pid, token: "stale-token", createdAt: 0 })}\n`,
      "utf8",
    );
    const expired = new Date(Date.now() - 60_000);
    utimesSync(lockPath, expired, expired);

    const value = await withWorktreeRegistryLock(repo, () => "acquired", {
      staleMs: 5_000,
      timeoutMs: 2_000,
    });
    expect(value).toBe("acquired");
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
});
