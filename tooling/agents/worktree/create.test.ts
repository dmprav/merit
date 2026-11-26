import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { describe, expect, test, vi } from "vite-plus/test";

import { createWorktree } from "./create.ts";
import { type ExecCommand } from "./deps.ts";
import { canonicalPath } from "./paths.ts";
import {
  readWorktreeRegistry,
  registryLockPathForRepo,
  registryPathForRepo,
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
  interruptCreate,
  isGitCommand,
  listBranch,
  makeTempDir,
  testDeps,
  useWorktreeFixtures,
  worktreeRecord,
} from "./tests/fixtures.ts";

useWorktreeFixtures();

const reachableDatabase = (dropped: string[] = []) =>
  fakeDatabase({
    isReachable: async () => true,
    drop: async (name) => {
      dropped.push(name);
    },
  });

const failDoctor: ExecCommand = (_command, args) => {
  if (args.includes("--doctor")) {
    throw new Error("doctor check failed");
  }
};

describe("createWorktree", () => {
  test("creates a worktree from origin/main with its env file, database, and bootstrap commands", async () => {
    const repo = initTempRepo({ withOriginMain: true });
    const commandsRun: Array<[string, readonly string[], string]> = [];
    const created: string[] = [];

    const alpha = await createIn(
      repo,
      { slug: "alpha", dbMode: "auto", doctor: true },
      {
        execCommand: (command, args, { cwd }) => {
          commandsRun.push([command, args, cwd]);
        },
        database: fakeDatabase({
          isReachable: async () => true,
          ensure: async (name) => {
            created.push(name);
            return { created: true };
          },
        }),
      },
    );

    expect(alpha).toMatchObject({
      baseRef: "origin/main",
      branch: "worktree/alpha",
      databaseName: "merit_alpha",
      databaseCreated: true,
      path: join(repo, ".tmp/worktrees/alpha"),
    });
    expect(created).toEqual(["merit_alpha"]);
    expect(readFileSync(join(alpha.path, ".env.local"), "utf8")).toContain(
      `DATABASE_URL=${alpha.databaseUrl}`,
    );
    expect(commandsRun).toEqual([
      ["pnpm", ["install", "--frozen-lockfile", "--prefer-offline"], alpha.path],
      ["vp", ["config", "--no-agent"], alpha.path],
      ["bash", [join(alpha.path, ".agents/install-environment.sh"), "--doctor"], alpha.path],
    ]);
    expect(readWorktreeRegistry(repo).worktrees.alpha).toMatchObject({
      status: "active",
      databaseCreated: true,
    });
  });

  test("creates a worktree at a custom --dir on a custom --branch without a database", async () => {
    const repo = initTempRepo();
    const customDir = join(makeTempDir("merit-custom-wt-"), "beta-dir");
    const ensure = vi.fn(async () => ({ created: true }));

    const beta = await createIn(
      repo,
      { slug: "beta", branch: "feat/beta-work", dir: customDir },
      { database: fakeDatabase({ isReachable: async () => true, ensure }) },
    );

    expect(beta).toMatchObject({
      path: customDir,
      branch: "feat/beta-work",
      databaseName: "merit_beta",
      databaseCreated: false,
    });
    expect(ensure).not.toHaveBeenCalled();
  });

  test("warns instead of failing when auto mode finds PostgreSQL down", async () => {
    const repo = initTempRepo();

    const { result, warnings } = await createWorktree(
      { primaryRepoRoot: repo, slug: "alpha", dbMode: "auto", doctor: false, quiet: true },
      testDeps(),
    );

    expect(result.databaseCreated).toBe(false);
    expect(warnings).toEqual([
      'Warning: PostgreSQL at 127.0.0.1:55432 is not reachable; skipped creating database "merit_alpha".',
    ]);
  });

  test("gives each worktree ports no other worktree uses", async () => {
    const repo = initTempRepo();

    const alpha = await createIn(repo, { slug: "alpha" });
    const beta = await createIn(repo, { slug: "beta" });

    const alphaPorts = new Set(Object.values(alpha.ports));
    expect(Object.values(beta.ports).filter((port) => alphaPorts.has(port))).toEqual([]);
  });

  test("bases a worktree on main when origin/main is absent", async () => {
    const repo = initTempRepo();

    expect((await createIn(repo, { slug: "local-only" })).baseRef).toBe("main");
  });

  test("fails before any Git or bootstrap work when --with-db cannot reach PostgreSQL", async () => {
    const repo = initTempRepo();
    const execCommand = vi.fn();

    await expect(
      createIn(repo, { slug: "needs-db", dbMode: "required" }, { execCommand }),
    ).rejects.toThrow(/PostgreSQL is not reachable at 127\.0\.0\.1:55432 \(--with-db/);

    expect(execCommand).not.toHaveBeenCalled();
    expect(existsSync(join(repo, ".tmp/worktrees/needs-db"))).toBe(false);
    expect(listBranch(repo, "worktree/needs-db")).toBe("");
  });

  test("never overwrites a corrupt registry", async () => {
    const repo = initTempRepo();
    const registryPath = registryPathForRepo(repo);
    mkdirSync(dirname(registryPath), { recursive: true });
    writeFileSync(registryPath, "{not valid json", "utf8");

    await expect(createIn(repo, { slug: "fresh" })).rejects.toThrow(
      /Corrupt or invalid worktree registry/,
    );
    expect(readFileSync(registryPath, "utf8")).toBe("{not valid json");
  });

  test("never assigns ports the primary checkout's .env.local files configure", async () => {
    const repo = initTempRepo();
    mkdirSync(join(repo, "app"), { recursive: true });
    writeFileSync(join(repo, "app/.env.local"), "MERIT_DEV_PORT=3100\n", "utf8");
    writeFileSync(join(repo, ".env.local"), "MERIT_STORYBOOK_PORT=6117\n", "utf8");

    const created = await createIn(repo, { slug: "alpha" });

    expect(created.ports).toEqual({
      MERIT_DEV_PORT: 3120,
      MERIT_APP_PORT: 3121,
      MERIT_WORKSPACE_PORT: 3122,
      MERIT_STORYBOOK_DEV_PORT: 6126,
      MERIT_STORYBOOK_PORT: 6127,
    });
  });

  test("never assigns the recorded ports of a checkout moved with git worktree move", async () => {
    const repo = initTempRepo();
    const movedPath = join(makeTempDir("merit-moved-only-"), "alpha-moved");
    const alpha = await createIn(repo, { slug: "alpha" });
    git(repo, ["worktree", "move", alpha.path, movedPath]);

    const beta = await createIn(repo, { slug: "beta" });

    expect(Object.values(beta.ports)).not.toContain(alpha.ports.MERIT_DEV_PORT);
  });

  test("never assigns ports a moved linked checkout's .env.local now configures", async () => {
    const repo = initTempRepo();
    const movedPath = join(makeTempDir("merit-moved-ports-"), "alpha-moved");
    const alpha = await createIn(repo, { slug: "alpha" });
    git(repo, ["worktree", "move", alpha.path, movedPath]);
    // Idle alpha now overrides its recorded dev port with the next slot's port.
    mkdirSync(join(movedPath, "app"), { recursive: true });
    writeFileSync(join(movedPath, "app/.env.local"), "MERIT_DEV_PORT=3110\n", "utf8");

    const beta = await createIn(repo, { slug: "beta" });

    expect(beta.ports.MERIT_DEV_PORT).toBe(3120);
  });
});

describe("createWorktree refuses taken targets", () => {
  test.each([
    { name: "nested inside an active linked worktree", dir: "group/base-wt/sub/child" },
    { name: "containing an active linked worktree", dir: "group" },
    { name: "containing a registered worktree not on disk", dir: "ghost" },
    { name: "nested inside a registered worktree not on disk", dir: "ghost/sub/ghost-wt/nested" },
  ])("rejects a --dir $name", async ({ dir }) => {
    const repo = initTempRepo();
    const customRoot = makeTempDir("merit-overlap-wt-");
    const active = await createIn(repo, {
      slug: "base-wt",
      dir: join(customRoot, "group/base-wt"),
    });
    const registry = readWorktreeRegistry(repo);
    registry.worktrees["ghost-wt"] = worktreeRecord({
      slug: "ghost-wt",
      path: join(customRoot, "ghost/sub/ghost-wt"),
      ports: {
        MERIT_DEV_PORT: 3120,
        MERIT_APP_PORT: 3121,
        MERIT_WORKSPACE_PORT: 3122,
        MERIT_STORYBOOK_DEV_PORT: 6126,
        MERIT_STORYBOOK_PORT: 6127,
      },
      status: "active",
    });
    writeWorktreeRegistry(repo, registry);

    await expect(
      createIn(repo, { slug: "overlapping", dir: join(customRoot, dir) }),
    ).rejects.toThrow(/overlaps existing worktree/);
    expect(existsSync(active.path)).toBe(true);
    expect(listBranch(repo, "worktree/overlapping")).toBe("");
  });

  test("rejects a linked worktree that overlaps the target after port probes", async () => {
    const repo = initTempRepo();
    const externalWorktreeDir = join(makeTempDir("merit-probe-overlap-"), "group", "external-wt");
    const nestedTargetDir = join(externalWorktreeDir, "nested");
    let added = false;

    await expect(
      createIn(
        repo,
        { slug: "late-overlap", dir: nestedTargetDir },
        {
          checkPortAvailable: async () => {
            if (!added) {
              added = true;
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
    expect(listBranch(repo, "worktree/late-overlap")).toBe("");
    expect(readWorktreeRegistry(repo).worktrees["late-overlap"]).toBeUndefined();
  });

  test("never deletes a directory another process fills during port probes", async () => {
    const repo = initTempRepo();
    const targetDir = join(makeTempDir("merit-race-dir-"), "probe-race");
    let filled = false;

    await expect(
      createIn(
        repo,
        { slug: "probe-race", dir: targetDir },
        {
          checkPortAvailable: async () => {
            if (!filled) {
              filled = true;
              mkdirSync(targetDir, { recursive: true });
              writeFileSync(join(targetDir, "external.txt"), "keep me\n", "utf8");
            }
            return true;
          },
        },
      ),
    ).rejects.toThrow(/already exists/);

    expect(readFileSync(join(targetDir, "external.txt"), "utf8")).toBe("keep me\n");
    expect(listBranch(repo, "worktree/probe-race")).toBe("");
  });

  test("refuses a slug another live create holds", async () => {
    const repo = initTempRepo();
    writeWorktreeRegistry(repo, {
      version: 1,
      worktrees: {
        lifecycle: worktreeRecord({
          slug: "lifecycle",
          path: join(repo, ".tmp/worktrees/lifecycle"),
          status: "creating",
          ownerPid: process.pid,
        }),
      },
    });

    await expect(createIn(repo, { slug: "lifecycle" })).rejects.toThrow(
      /currently being created .* by process/,
    );
  });

  test("refuses the slug of an interrupted create until it is cleaned", async () => {
    const repo = initTempRepo();
    await createIn(repo, { slug: "killed" });
    interruptCreate(repo, "killed");

    await expect(createIn(repo, { slug: "killed" })).rejects.toThrow(
      /was interrupted.*worktree:clean killed/,
    );
  });
});

describe("createWorktree concurrency", () => {
  test("serializes concurrent creates through the registry lock", async () => {
    const repo = initTempRepo();
    const created: string[] = [];
    const lockOptions = { initialDelayMs: 5, maxDelayMs: 15, timeoutMs: 5_000 };

    const database = (onReachable = () => {}) =>
      fakeDatabase({
        isReachable: async () => {
          onReachable();
          return true;
        },
        ensure: async (name) => {
          created.push(name);
          return { created: true };
        },
      });

    const alphaEnteredLock = createDeferred();
    const releaseAlphaLock = createDeferred();
    const betaReadyForLock = createDeferred();
    let alphaPaused = false;
    let betaEnteredLock = false;

    const alphaPromise = createIn(
      repo,
      { slug: "alpha", dbMode: "required" },
      {
        checkPortAvailable: async () => {
          if (!alphaPaused) {
            alphaPaused = true;
            alphaEnteredLock.resolve();
            await releaseAlphaLock.promise;
          }
          return true;
        },
        database: database(),
        lockOptions,
      },
    );
    await alphaEnteredLock.promise;
    expect(existsSync(registryLockPathForRepo(repo))).toBe(true);

    const betaPromise = createIn(
      repo,
      { slug: "beta", dbMode: "required" },
      {
        checkPortAvailable: async () => {
          betaEnteredLock = true;
          return true;
        },
        database: database(() => betaReadyForLock.resolve()),
        lockOptions,
      },
    );
    await betaReadyForLock.promise;
    // Allow beta to reach the registry lock and find alpha holding it.
    await Promise.resolve();
    await Promise.resolve();
    expect(betaEnteredLock).toBe(false);

    releaseAlphaLock.resolve();
    const [alpha, beta] = await Promise.all([alphaPromise, betaPromise]);

    expect(betaEnteredLock).toBe(true);
    const alphaPorts = new Set(Object.values(alpha.ports));
    expect(Object.values(beta.ports).filter((port) => alphaPorts.has(port))).toEqual([]);
    const registry = readWorktreeRegistry(repo);
    expect(registry.worktrees.alpha).toMatchObject({ ports: alpha.ports, databaseCreated: true });
    expect(registry.worktrees.beta).toMatchObject({ ports: beta.ports, databaseCreated: true });
    expect(created.sort()).toEqual(["merit_alpha", "merit_beta"]);
    expect(existsSync(registryLockPathForRepo(repo))).toBe(false);
  });
});

describe("createWorktree rollback", () => {
  test("removes the checkout, branch, and record when bootstrap fails", async () => {
    const repo = initTempRepo();

    await expect(
      createIn(
        repo,
        { slug: "broken-install" },
        {
          execCommand: () => {
            throw new Error("pnpm install failed");
          },
        },
      ),
    ).rejects.toThrow(/pnpm install failed/);

    expect(existsSync(join(repo, ".tmp/worktrees/broken-install"))).toBe(false);
    expect(listBranch(repo, "worktree/broken-install")).toBe("");
    expect(readWorktreeRegistry(repo).worktrees["broken-install"]).toBeUndefined();
  });

  test("drops the database and removes only the failed worktree when --doctor fails", async () => {
    const repo = initTempRepo();
    const dropped: string[] = [];
    await createIn(repo, { slug: "sibling" });

    await expect(
      createIn(
        repo,
        { slug: "doctor-fail", dbMode: "required", doctor: true },
        { execCommand: failDoctor, database: reachableDatabase(dropped) },
      ),
    ).rejects.toThrow(/doctor check failed/);

    expect(dropped).toEqual(["merit_doctor_fail"]);
    expect(existsSync(join(repo, ".tmp/worktrees/doctor-fail"))).toBe(false);
    expect(git(repo, ["worktree", "list", "--porcelain"])).not.toContain("doctor-fail");
    expect(listBranch(repo, "worktree/doctor-fail")).toBe("");
    const registry = readWorktreeRegistry(repo);
    expect(registry.worktrees["doctor-fail"]).toBeUndefined();
    expect(registry.worktrees.sibling).toBeDefined();
  });

  test("removes a partial checkout and its new branch when git worktree add fails in a hook", async () => {
    const repo = initTempRepo();
    const markerFile = join(makeTempDir("merit-hook-marker-"), "post-checkout-ran.txt");
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

    await expect(createIn(repo, { slug: "hook-fail" })).rejects.toThrow();

    expect(readFileSync(markerFile, "utf8").trim()).toBe("hook-ran");
    expect(existsSync(join(repo, ".tmp/worktrees/hook-fail"))).toBe(false);
    expect(git(repo, ["worktree", "list", "--porcelain", "-z"])).not.toContain("hook-fail");
    expect(listBranch(repo, "worktree/hook-fail")).toBe("");
    expect(readWorktreeRegistry(repo).worktrees["hook-fail"]).toBeUndefined();
  });

  test("never deletes a directory another process fills before git worktree add", async () => {
    const repo = initTempRepo();
    const targetDir = join(makeTempDir("merit-race-dir-"), "git-race");

    await expect(
      createIn(
        repo,
        { slug: "git-race", dir: targetDir },
        {
          execGit: gitWith((args) => {
            if (isGitCommand(args, "worktree", "add")) {
              mkdirSync(targetDir, { recursive: true });
              writeFileSync(join(targetDir, "external.txt"), "do not remove\n", "utf8");
            }
          }),
        },
      ),
    ).rejects.toThrow();

    expect(readFileSync(join(targetDir, "external.txt"), "utf8")).toBe("do not remove\n");
    expect(listBranch(repo, "worktree/git-race")).toBe("");
    expect(readWorktreeRegistry(repo).worktrees["git-race"]).toBeUndefined();
  });

  test("preserves another job's linked checkout that took the target before git worktree add", async () => {
    const repo = initTempRepo();
    const targetDir = join(makeTempDir("merit-add-race-"), "contested");
    let raced = false;

    await expect(
      createIn(
        repo,
        { slug: "contested", dir: targetDir },
        {
          execGit: gitWith((args) => {
            if (!raced && isGitCommand(args, "worktree", "add")) {
              raced = true;
              git(repo, ["worktree", "add", "-b", "feat/other-job", targetDir, "main"]);
              writeFileSync(join(targetDir, "other-job.txt"), "keep me\n", "utf8");
            }
          }),
        },
      ),
    ).rejects.toThrow(/rollback preserved .*contested/);

    expect(readFileSync(join(targetDir, "other-job.txt"), "utf8")).toBe("keep me\n");
    expect(git(repo, ["worktree", "list", "--porcelain"])).toContain(targetDir);
    expect(listBranch(repo, "feat/other-job")).toContain("feat/other-job");
    expect(readWorktreeRegistry(repo).worktrees.contested).toBeUndefined();
  });

  test("keeps a branch another job created after the last branch check", async () => {
    const repo = initTempRepo();
    let raced = false;

    await expect(
      createIn(
        repo,
        { slug: "raced-branch", branch: "feat/raced" },
        {
          execGit: gitWith((args) => {
            // Another job creates the branch just before this attempt does.
            if (!raced && isGitCommand(args, "branch", "feat/raced")) {
              raced = true;
              git(repo, ["branch", "feat/raced", "main"]);
            }
          }),
        },
      ),
    ).rejects.toThrow(/already exists/);

    expect(listBranch(repo, "feat/raced")).toContain("feat/raced");
    expect(existsSync(join(repo, ".tmp/worktrees/raced-branch"))).toBe(false);
    expect(readWorktreeRegistry(repo).worktrees["raced-branch"]).toBeUndefined();
  });
});

describe("a checkout rollback cannot remove", () => {
  /** Fails `--doctor` after locking the checkout, so Git refuses `worktree remove --force`. */
  const createLockedDuringDoctor = async (repo: string, dropped: string[] = []) => {
    const checkoutPath = join(repo, ".tmp/worktrees/stuck-checkout");
    const failure = createIn(
      repo,
      { slug: "stuck-checkout", branch: "feat/stuck-branch", dbMode: "required", doctor: true },
      {
        execCommand: (_command, args) => {
          if (args.includes("--doctor")) {
            writeFileSync(join(checkoutPath, "work.txt"), "keep me\n", "utf8");
            git(repo, ["worktree", "lock", checkoutPath]);
            throw new Error("doctor check failed");
          }
        },
        database: reachableDatabase(dropped),
      },
    );
    await expect(failure).rejects.toThrow(
      /doctor check failed.*rollback could not remove checkout.*locked/s,
    );
    return checkoutPath;
  };

  test("keeps the checkout and its record with its identity after dropping the database", async () => {
    const repo = initTempRepo();
    const dropped: string[] = [];

    const checkoutPath = await createLockedDuringDoctor(repo, dropped);

    expect(dropped).toEqual(["merit_stuck_checkout"]);
    expect(readFileSync(join(checkoutPath, "work.txt"), "utf8")).toBe("keep me\n");
    expect(existsSync(join(checkoutPath, ".git"))).toBe(true);
    const retained = readWorktreeRegistry(repo).worktrees["stuck-checkout"];
    expect(retained).toMatchObject({
      slug: "stuck-checkout",
      path: checkoutPath,
      branch: "feat/stuck-branch",
      databaseCreated: false,
      status: "cleaning",
    });
    expect(retained?.gitDir).toBeTruthy();
    expect(retained?.partialRemoval).toBeUndefined();
  });

  test("lets worktree:clean finish once the checkout is unlocked", async () => {
    const repo = initTempRepo();
    const checkoutPath = await createLockedDuringDoctor(repo);
    git(repo, ["worktree", "unlock", checkoutPath]);

    const cleaned = await cleanIn(repo, "stuck-checkout");

    expect(cleaned).toMatchObject({
      worktreeRemoved: true,
      branchDeleted: true,
      registryRemoved: true,
    });
    expect(existsSync(checkoutPath)).toBe(false);
    expect(listBranch(repo, "feat/stuck-branch")).toBe("");
    expect(readWorktreeRegistry(repo).worktrees["stuck-checkout"]).toBeUndefined();
  });
});

describe("a checkout rollback removes partially", () => {
  /** Fails `--doctor`, then has Git delete the checkout's `.git` before failing on its files. */
  const createWithPartialRollback = async (repo: string, dropped: string[] = []) => {
    const checkoutPath = join(repo, ".tmp/worktrees/partial-rollback");
    const failure = createIn(
      repo,
      {
        slug: "partial-rollback",
        branch: "feat/partial-rollback",
        dbMode: "required",
        doctor: true,
      },
      {
        execGit: gitWith((args) => {
          if (isGitCommand(args, "worktree", "remove")) {
            // Remove only the fixture checkout's metadata, never a path read from the arguments.
            const target = args.at(-1);
            if (target === undefined || canonicalPath(target) !== canonicalPath(checkoutPath)) {
              throw new Error(`Unexpected worktree remove target: ${target ?? "(none)"}`);
            }
            rmSync(join(checkoutPath, ".git"), { force: true });
            throw new Error("EACCES: partial directory removal failed");
          }
        }),
        execCommand: failDoctor,
        database: reachableDatabase(dropped),
      },
    );
    await expect(failure).rejects.toThrow(
      /doctor check failed.*rollback could not remove checkout.*EACCES: partial directory removal failed/,
    );
    return checkoutPath;
  };

  test("records the residue with the checkout's identity for worktree:clean", async () => {
    const repo = initTempRepo();
    const dropped: string[] = [];

    const residuePath = await createWithPartialRollback(repo, dropped);

    expect(dropped).toEqual(["merit_partial_rollback"]);
    expect(existsSync(residuePath)).toBe(true);
    expect(existsSync(join(residuePath, ".git"))).toBe(false);
    const retained = readWorktreeRegistry(repo).worktrees["partial-rollback"];
    expect(retained).toMatchObject({
      path: residuePath,
      branch: "feat/partial-rollback",
      databaseCreated: false,
      status: "cleaning",
      partialRemoval: true,
    });
    expect(retained?.gitDir).toBeTruthy();
    expect(retained?.checkoutToken).toBeTruthy();
    expect(retained?.ownerPid).toBeUndefined();
  });

  test("keeps worktree:clean from removing a replacement checkout at the residue path", async () => {
    const repo = initTempRepo();
    const residuePath = await createWithPartialRollback(repo);
    // The replacement reuses the pruned `.git/worktrees/<id>` name but lacks this worktree's token.
    rmSync(residuePath, { recursive: true, force: true });
    git(repo, ["worktree", "add", "-b", "feat/replacement", residuePath, "main"]);
    expect(readWorktreeRegistry(repo).worktrees["partial-rollback"]?.gitDir).toBe(
      join(repo, ".git/worktrees/partial-rollback"),
    );
    writeFileSync(join(residuePath, "replacement-marker.txt"), "preserve me\n", "utf8");

    await expect(cleanIn(repo, "partial-rollback")).rejects.toThrow(
      /belongs to a different checkout/,
    );
    expect(readFileSync(join(residuePath, "replacement-marker.txt"), "utf8")).toBe("preserve me\n");
  });

  test("lets worktree:clean remove the residue", async () => {
    const repo = initTempRepo();
    const residuePath = await createWithPartialRollback(repo);

    const cleaned = await cleanIn(repo, "partial-rollback");

    expect(cleaned).toMatchObject({
      worktreeRemoved: true,
      branchDeleted: true,
      registryRemoved: true,
    });
    expect(existsSync(residuePath)).toBe(false);
    expect(listBranch(repo, "feat/partial-rollback")).toBe("");
    expect(readWorktreeRegistry(repo).worktrees["partial-rollback"]).toBeUndefined();
  });
});
