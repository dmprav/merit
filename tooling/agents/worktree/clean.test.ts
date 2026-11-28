import { existsSync, mkdirSync, readFileSync, symlinkSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { describe, expect, test, vi } from "vite-plus/test";

import { DEFAULT_COMPOSE_DATABASE_URL } from "../../scripts/local-postgres.ts";
import { type CheckoutRemovalFacts, cleanWorktree, decideCheckoutRemoval } from "./clean.ts";
import {
  readWorktreeRegistry,
  registryLockPathForRepo,
  type WorktreeRegistry,
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
  listIn,
  makeTempDir,
  testDeps,
  useWorktreeFixtures,
  worktreeRecord,
} from "./tests/fixtures.ts";

useWorktreeFixtures();

const reachable = (drop: (name: string) => Promise<void> = async () => {}) =>
  fakeDatabase({ isReachable: async () => true, drop });

const register = (repo: string, worktrees: WorktreeRegistry["worktrees"]) => {
  writeWorktreeRegistry(repo, { version: 1, worktrees });
};

describe("cleanWorktree", () => {
  test("removes the checkout, database, branch, and registry record", async () => {
    const repo = initTempRepo();
    const alpha = await createIn(repo, { slug: "alpha" });
    const dropped: string[] = [];

    const cleaned = await cleanIn(repo, "alpha", {
      database: reachable(async (name) => {
        dropped.push(name);
      }),
    });

    expect(cleaned).toMatchObject({
      slug: "alpha",
      worktreeRemoved: true,
      databaseName: "merit_alpha",
      databaseDropped: true,
      branchDeleted: true,
      registryRemoved: true,
    });
    expect(dropped).toEqual(["merit_alpha"]);
    expect(existsSync(alpha.path)).toBe(false);
    expect(listBranch(repo, "worktree/alpha")).toBe("");
    expect(listIn(repo)).toEqual([]);
  });

  test("keeps the branch with --keep-branch", async () => {
    const repo = initTempRepo();
    const beta = await createIn(repo, {
      slug: "beta",
      branch: "feat/beta-work",
      dir: join(makeTempDir("merit-custom-wt-"), "beta-dir"),
    });

    const cleaned = await cleanIn(repo, "beta", { database: reachable() }, { keepBranch: true });

    expect(cleaned).toMatchObject({
      worktreeRemoved: true,
      databaseDropped: true,
      branchDeleted: false,
      registryRemoved: true,
    });
    expect(existsSync(beta.path)).toBe(false);
    expect(listBranch(repo, "feat/beta-work")).toContain("feat/beta-work");
  });

  test("succeeds without changes once everything is gone", async () => {
    const repo = initTempRepo();
    await createIn(repo, { slug: "alpha" });
    await cleanIn(repo, "alpha");

    const again = await cleanIn(repo, "alpha");

    expect(again).toMatchObject({
      worktreeRemoved: false,
      branchDeleted: false,
      registryRemoved: false,
    });
  });

  test("warns instead of failing when PostgreSQL is down", async () => {
    const repo = initTempRepo();
    await createIn(repo, { slug: "alpha" });

    const { result, warnings } = await cleanWorktree(
      { primaryRepoRoot: repo, slug: "alpha", keepBranch: false },
      testDeps(),
    );

    expect(result.databaseDropped).toBe(false);
    expect(warnings).toEqual([
      'Warning: PostgreSQL at 127.0.0.1:55432 is not reachable; skipped dropping database "merit_alpha".',
    ]);
  });

  test("prunes Git metadata and cleans the rest when the checkout directory is already gone", async () => {
    const repo = initTempRepo();
    const created = await createIn(repo, { slug: "gone-dir" });
    rmSync(created.path, { recursive: true, force: true });
    expect(git(repo, ["worktree", "list", "--porcelain"])).toContain(created.path);
    const drop = vi.fn(async () => {});

    const cleaned = await cleanIn(repo, "gone-dir", { database: reachable(drop) });

    expect(cleaned).toMatchObject({
      worktreeRemoved: true,
      databaseDropped: true,
      branchDeleted: true,
      registryRemoved: true,
    });
    expect(drop).toHaveBeenCalledExactlyOnceWith("merit_gone_dir");
    expect(git(repo, ["worktree", "list", "--porcelain"])).not.toContain(created.path);
    expect(listBranch(repo, "worktree/gone-dir")).toBe("");
    expect(readWorktreeRegistry(repo).worktrees["gone-dir"]).toBeUndefined();
  });

  test("lets a clean finish what an interrupted create left behind", async () => {
    const repo = initTempRepo();
    await createIn(repo, { slug: "killed" });
    interruptCreate(repo, "killed");

    const offline = await cleanIn(repo, "killed");
    expect(offline).toMatchObject({
      worktreeRemoved: true,
      branchDeleted: false,
      registryRemoved: false,
    });

    const drop = vi.fn(async () => {});
    const cleaned = await cleanIn(repo, "killed", { database: reachable(drop) });
    expect(drop).toHaveBeenCalledExactlyOnceWith("merit_killed");
    expect(cleaned).toMatchObject({ branchDeleted: false, registryRemoved: true });
    expect(readWorktreeRegistry(repo).worktrees.killed).toBeUndefined();
  });

  test("keeps a sibling registered while the clean runs", async () => {
    const repo = initTempRepo();
    await createIn(repo, { slug: "alpha" });

    const cleaned = await cleanIn(repo, "alpha", {
      database: reachable(async () => {
        await createIn(repo, { slug: "beta" });
      }),
    });

    expect(cleaned.registryRemoved).toBe(true);
    expect(listIn(repo).map((entry) => entry.slug)).toEqual(["beta"]);
  });
});

describe("cleanWorktree protects what it does not own", () => {
  test.each(["same path", "old path", "no gitDir"])(
    "preserves a tokenless record (%s)",
    async (state) => {
      const repo = initTempRepo();
      const created = await createIn(repo, { slug: "legacy" });
      const registry = readWorktreeRegistry(repo);
      const record = registry.worktrees.legacy;
      expect.assert(record);
      delete record.checkoutToken;
      if (state === "old path") {
        record.path = join(repo, ".tmp/worktrees/old-location");
      }
      if (state === "no gitDir") {
        delete record.gitDir;
      }
      writeWorktreeRegistry(repo, registry);
      const drop = vi.fn(async () => {});

      await expect(cleanIn(repo, "legacy", { database: reachable(drop) })).rejects.toThrow(
        /checkout token.*merit_legacy/,
      );

      expect(drop).not.toHaveBeenCalled();
      expect(existsSync(join(created.path, ".git"))).toBe(true);
      expect(listBranch(repo, created.branch)).toContain(created.branch);
      expect(readWorktreeRegistry(repo)).toEqual(registry);
    },
  );

  test("preserves the branch of a pre-upgrade cleaning record across retries", async () => {
    const repo = initTempRepo();
    const created = await createIn(repo, { slug: "old-retry" });
    const registry = readWorktreeRegistry(repo);
    const record = registry.worktrees["old-retry"];
    expect.assert(record);
    record.status = "cleaning";
    writeWorktreeRegistry(repo, registry);

    const offline = await cleanIn(repo, "old-retry");
    expect(offline).toMatchObject({ branchDeleted: false, registryRemoved: false });
    const retried = await cleanIn(repo, "old-retry", { database: reachable() });
    expect(retried).toMatchObject({ branchDeleted: false, registryRemoved: true });
    expect(listBranch(repo, created.branch)).toContain(created.branch);
  });

  test("refuses to drop a protected database named by a tampered record", async () => {
    const repo = initTempRepo();
    const drop = vi.fn(async () => {});
    register(repo, {
      tampered: worktreeRecord({
        slug: "tampered",
        path: join(repo, ".tmp/worktrees/tampered"),
        gitDir: join(repo, ".git/worktrees/tampered"),
        checkoutToken: "recorded-token",
        branch: "main",
        databaseName: "merit",
        databaseUrl: DEFAULT_COMPOSE_DATABASE_URL,
      }),
    });

    await expect(cleanIn(repo, "tampered", { database: reachable(drop) })).rejects.toThrow(
      /protected database "merit"/,
    );
    expect(drop).not.toHaveBeenCalled();
  });

  test("never deletes a protected branch, even when no checkout uses it", async () => {
    const repo = initTempRepo();
    // `master` is neither the primary branch nor checked out, so only the protected-name rule keeps it.
    git(repo, ["branch", "master", "main"]);
    register(repo, {
      tampered: worktreeRecord({
        slug: "tampered",
        path: join(repo, ".tmp/worktrees/tampered"),
        gitDir: join(repo, ".git/worktrees/tampered"),
        checkoutToken: "recorded-token",
        branch: "master",
      }),
    });

    const cleaned = await cleanIn(repo, "tampered");

    expect(cleaned).toMatchObject({ branchDeleted: false, registryRemoved: true });
    expect(listBranch(repo, "master")).toContain("master");
  });

  test("keeps a branch another active worktree has checked out", async () => {
    const repo = initTempRepo();
    const active = await createIn(repo, { slug: "active-peer", branch: "feat/shared-branch" });
    const registry = readWorktreeRegistry(repo);
    registry.worktrees.stale = worktreeRecord({
      slug: "stale",
      path: join(repo, ".tmp/worktrees/stale"),
      gitDir: join(repo, ".git/worktrees/stale"),
      checkoutToken: "recorded-token",
      branch: active.branch,
    });
    writeWorktreeRegistry(repo, registry);

    const cleaned = await cleanIn(repo, "stale");

    expect(cleaned).toMatchObject({ branchDeleted: false, registryRemoved: true });
    expect(listBranch(repo, "feat/shared-branch")).toContain("feat/shared-branch");
    expect(existsSync(active.path)).toBe(true);
  });

  test("refuses to delete an ancestor of the primary repository root", async () => {
    const outerDir = makeTempDir("merit-worktree-outer-");
    const repo = initTempRepo({ dir: join(outerDir, "repo") });
    const drop = vi.fn(async () => {});
    register(repo, {
      ancestor: worktreeRecord({ slug: "ancestor", path: dirname(repo) }),
    });

    await expect(cleanIn(repo, "ancestor", { database: reachable(drop) })).rejects.toThrow(
      /primary repository root or ancestor directory/,
    );
    expect(drop).not.toHaveBeenCalled();
    expect(existsSync(repo)).toBe(true);
  });

  test("refuses to delete a directory outside .tmp/worktrees that is not a linked checkout", async () => {
    const repo = initTempRepo();
    const unownedDir = makeTempDir("merit-unowned-dir-");
    writeFileSync(join(unownedDir, "important.txt"), "do not delete\n", "utf8");
    const drop = vi.fn(async () => {});
    mkdirSync(join(repo, ".tmp/worktrees"), { recursive: true });
    symlinkSync(unownedDir, join(repo, ".tmp/worktrees/unowned"), "dir");

    await expect(cleanIn(repo, "unowned", { database: reachable(drop) })).rejects.toThrow(
      /not a recognized Git worktree/,
    );
    expect(existsSync(join(unownedDir, "important.txt"))).toBe(true);
    expect(drop).not.toHaveBeenCalled();
  });

  test("surfaces Git's refusal to remove a locked checkout instead of deleting it", async () => {
    const repo = initTempRepo();
    const created = await createIn(repo, {
      slug: "locked-slug",
      dir: join(makeTempDir("merit-locked-wt-"), "locked-wt"),
    });
    git(repo, ["worktree", "lock", created.path]);
    const drop = vi.fn(async () => {});

    await expect(cleanIn(repo, "locked-slug", { database: reachable(drop) })).rejects.toThrow();
    expect(existsSync(created.path)).toBe(true);
    expect(drop).not.toHaveBeenCalled();
  });

  test("refuses to remove a checkout that contains another Git worktree", async () => {
    const repo = initTempRepo();
    const alpha = await createIn(repo, { slug: "alpha" });
    const nestedPath = join(alpha.path, "nested-raw");
    git(repo, ["worktree", "add", "-b", "feat/nested-raw", nestedPath, "main"]);
    writeFileSync(join(nestedPath, "nested-marker.txt"), "preserve me\n", "utf8");
    const drop = vi.fn(async () => {});

    await expect(cleanIn(repo, "alpha", { database: reachable(drop) })).rejects.toThrow(
      /contains another worktree/,
    );
    expect(drop).not.toHaveBeenCalled();
    expect(readFileSync(join(nestedPath, "nested-marker.txt"), "utf8")).toBe("preserve me\n");
    expect(readWorktreeRegistry(repo).worktrees.alpha?.status).toBe("active");
  });

  test.each([
    { name: "matches", unrecorded: "alpha", dir: ".tmp/worktrees/alpha" },
    { name: "contains", unrecorded: "delta", dir: ".tmp/worktrees/delta/nested" },
  ])(
    "refuses an unrecorded slug whose default path $name a registered checkout",
    async ({ unrecorded, dir }) => {
      const repo = initTempRepo();
      const owner = await createIn(repo, { slug: "owner", dir: join(repo, dir) });
      writeFileSync(join(owner.path, "owner-marker.txt"), "owned\n", "utf8");
      const drop = vi.fn(async () => {});

      await expect(cleanIn(repo, unrecorded, { database: reachable(drop) })).rejects.toThrow(
        /overlaps registered worktree "owner"/,
      );
      expect(drop).not.toHaveBeenCalled();
      expect(readFileSync(join(owner.path, "owner-marker.txt"), "utf8")).toBe("owned\n");
      expect(listBranch(repo, "worktree/owner")).toContain("worktree/owner");
      expect(readWorktreeRegistry(repo).worktrees.owner?.status).toBe("active");
    },
  );

  test("refuses an unrecorded slug whose default path holds a registered checkout moved there", async () => {
    const repo = initTempRepo();
    const alphaDefaultPath = join(repo, ".tmp/worktrees/alpha");
    const beta = await createIn(repo, { slug: "beta" });
    git(repo, ["worktree", "move", beta.path, alphaDefaultPath]);
    writeFileSync(join(alphaDefaultPath, "beta-work.txt"), "uncommitted\n", "utf8");
    const drop = vi.fn(async () => {});

    await expect(cleanIn(repo, "alpha", { database: reachable(drop) })).rejects.toThrow(
      /overlaps registered worktree "beta"/,
    );
    expect(drop).not.toHaveBeenCalled();
    expect(readFileSync(join(alphaDefaultPath, "beta-work.txt"), "utf8")).toBe("uncommitted\n");
    expect(readWorktreeRegistry(repo).worktrees.beta?.status).toBe("active");
  });
});

describe("cleanWorktree checks the checkout's identity", () => {
  test("refuses a checkout moved away while another checkout occupies its recorded path", async () => {
    const repo = initTempRepo();
    const movedAlphaPath = join(makeTempDir("merit-moved-wt-"), "alpha-moved");
    const alpha = await createIn(repo, { slug: "alpha" });
    git(repo, ["worktree", "move", alpha.path, movedAlphaPath]);
    git(repo, ["worktree", "add", "-b", "feat/replacement", alpha.path, "main"]);
    writeFileSync(join(alpha.path, "replacement-marker.txt"), "preserve me\n", "utf8");
    const drop = vi.fn(async () => {});

    await expect(cleanIn(repo, "alpha", { database: reachable(drop) })).rejects.toThrow(
      /registered checkout was moved to ".*alpha-moved"/,
    );
    expect(drop).not.toHaveBeenCalled();
    expect(readFileSync(join(alpha.path, "replacement-marker.txt"), "utf8")).toBe("preserve me\n");
    expect(existsSync(movedAlphaPath)).toBe(true);
    expect(listBranch(repo, "feat/replacement")).toContain("feat/replacement");
    expect(listBranch(repo, "worktree/alpha")).toContain("worktree/alpha");
    expect(readWorktreeRegistry(repo).worktrees.alpha?.status).toBe("active");
  });

  test("refuses a moved checkout and names the command that moves it back", async () => {
    const repo = initTempRepo();
    const movedPath = join(makeTempDir("merit-moved-only-"), "alpha-moved");
    const alpha = await createIn(repo, { slug: "alpha" });
    git(repo, ["worktree", "move", alpha.path, movedPath]);
    const drop = vi.fn(async () => {});

    await expect(cleanIn(repo, "alpha", { database: reachable(drop) })).rejects.toThrow(
      /registered checkout was moved to ".*alpha-moved".*git worktree move/,
    );
    expect(drop).not.toHaveBeenCalled();
    expect(existsSync(movedPath)).toBe(true);
    expect(readWorktreeRegistry(repo).worktrees.alpha?.status).toBe("active");
  });

  test("cleans a moved checkout once it is moved back", async () => {
    const repo = initTempRepo();
    const movedPath = join(makeTempDir("merit-moved-only-"), "alpha-moved");
    const alpha = await createIn(repo, { slug: "alpha" });
    git(repo, ["worktree", "move", alpha.path, movedPath]);
    await expect(cleanIn(repo, "alpha")).rejects.toThrow(/was moved/);
    git(repo, ["worktree", "move", movedPath, alpha.path]);
    const drop = vi.fn(async () => {});

    const cleaned = await cleanIn(repo, "alpha", { database: reachable(drop) });

    expect(cleaned).toMatchObject({ worktreeRemoved: true, registryRemoved: true });
    expect(drop).toHaveBeenCalledExactlyOnceWith("merit_alpha");
  });

  test("refuses a replacement checkout that reuses the recorded path and Git metadata name", async () => {
    const repo = initTempRepo();
    const alpha = await createIn(repo, { slug: "alpha" });
    const recordedGitDir = readWorktreeRegistry(repo).worktrees.alpha?.gitDir;
    // Removing alpha with Git frees `.git/worktrees/alpha`, so the replacement reuses that name.
    git(repo, ["worktree", "remove", "--force", alpha.path]);
    git(repo, ["worktree", "add", "-b", "feat/replacement", alpha.path, "main"]);
    expect(join(repo, ".git/worktrees/alpha")).toBe(recordedGitDir);
    writeFileSync(join(alpha.path, "replacement-marker.txt"), "preserve me\n", "utf8");
    const drop = vi.fn(async () => {});

    await expect(cleanIn(repo, "alpha", { database: reachable(drop) })).rejects.toThrow(
      /belongs to a different checkout/,
    );
    expect(drop).not.toHaveBeenCalled();
    expect(readFileSync(join(alpha.path, "replacement-marker.txt"), "utf8")).toBe("preserve me\n");
    expect(listBranch(repo, "feat/replacement")).toContain("feat/replacement");
  });
});

describe("cleanWorktree when Git cannot remove the checkout", () => {
  const failRemoval = (message: string, before: () => void = () => {}) =>
    gitWith((args) => {
      if (isGitCommand(args, "worktree", "remove")) {
        before();
        throw new Error(message);
      }
    });

  test("surfaces the failure, keeps the files, and releases its claim", async () => {
    const repo = initTempRepo();
    const created = await createIn(repo, { slug: "git-fails" });
    writeFileSync(join(created.path, "work.txt"), "uncommitted\n", "utf8");
    const drop = vi.fn(async () => {});

    await expect(
      cleanIn(repo, "git-fails", {
        execGit: failRemoval("git worktree remove: permission denied"),
        database: reachable(drop),
      }),
    ).rejects.toThrow(/permission denied/);

    expect(readFileSync(join(created.path, "work.txt"), "utf8")).toBe("uncommitted\n");
    expect(drop).not.toHaveBeenCalled();
    const released = readWorktreeRegistry(repo).worktrees["git-fails"];
    expect(released).toMatchObject({ status: "cleaning" });
    expect(released?.partialRemoval).toBeUndefined();
    expect(released?.cleanToken).toBeUndefined();
    expect(released?.ownerPid).toBeUndefined();
  });

  /** Has Git delete the checkout's `.git` and then fail on its remaining files. */
  const failAfterRemovingMetadata = async (repo: string, checkoutPath: string) => {
    await expect(
      cleanIn(repo, "git-fails", {
        execGit: failRemoval("git worktree remove: failed to delete remaining files", () => {
          rmSync(join(checkoutPath, ".git"), { force: true });
        }),
      }),
    ).rejects.toThrow(/failed to delete remaining files/);
  };

  test("records the residue when Git removed the checkout's metadata before failing", async () => {
    const repo = initTempRepo();
    const created = await createIn(repo, { slug: "git-fails" });
    writeFileSync(join(created.path, "work.txt"), "uncommitted\n", "utf8");

    await failAfterRemovingMetadata(repo, created.path);

    expect(existsSync(join(created.path, "work.txt"))).toBe(true);
    expect(readWorktreeRegistry(repo).worktrees["git-fails"]).toMatchObject({
      status: "cleaning",
      partialRemoval: true,
    });
  });

  test("removes the recorded residue under .tmp/worktrees on a retry", async () => {
    const repo = initTempRepo();
    const created = await createIn(repo, { slug: "git-fails" });
    await failAfterRemovingMetadata(repo, created.path);
    const drop = vi.fn(async () => {});

    const cleaned = await cleanIn(repo, "git-fails", { database: reachable(drop) });

    expect(cleaned).toMatchObject({ worktreeRemoved: true, registryRemoved: true });
    expect(existsSync(created.path)).toBe(false);
    expect(drop).toHaveBeenCalledExactlyOnceWith("merit_git_fails");
  });

  /** Leaves residue of an interrupted removal of a checkout outside `.tmp/worktrees/`. */
  const leaveExternalResidue = async (repo: string) => {
    const created = await createIn(repo, {
      slug: "external",
      dir: join(makeTempDir("merit-external-residue-"), "external"),
    });
    writeFileSync(join(created.path, "work.txt"), "uncommitted\n", "utf8");
    await expect(
      cleanIn(repo, "external", {
        execGit: failRemoval("git worktree remove: failed to delete remaining files", () => {
          rmSync(join(created.path, ".git"), { force: true });
        }),
      }),
    ).rejects.toThrow(/failed to delete remaining files/);
    expect(readWorktreeRegistry(repo).worktrees.external?.partialRemoval).toBe(true);
    return created.path;
  };

  test("tells the operator how to recover residue outside .tmp/worktrees instead of deleting it", async () => {
    const repo = initTempRepo();
    const residuePath = await leaveExternalResidue(repo);

    await expect(cleanIn(repo, "external")).rejects.toThrow(
      /interrupted removal of worktree "external".*delete it yourself, and rerun `vp run worktree:clean external`/,
    );
    expect(readFileSync(join(residuePath, "work.txt"), "utf8")).toBe("uncommitted\n");
  });

  test("finishes once the operator deletes residue outside .tmp/worktrees", async () => {
    const repo = initTempRepo();
    const residuePath = await leaveExternalResidue(repo);
    rmSync(residuePath, { recursive: true, force: true });

    const cleaned = await cleanIn(repo, "external");

    expect(cleaned).toMatchObject({ branchDeleted: true, registryRemoved: true });
    expect(readWorktreeRegistry(repo).worktrees.external).toBeUndefined();
  });
});

describe("cleanWorktree when deleting the branch fails", () => {
  const failBranchDelete = gitWith((args) => {
    if (isGitCommand(args, "branch", "-D")) {
      throw new Error("simulated branch delete failure");
    }
  });

  test("keeps the record and custom branch for a retry", async () => {
    const repo = initTempRepo();
    await createIn(repo, { slug: "gamma", branch: "feat/custom-gamma" });

    await expect(cleanIn(repo, "gamma", { execGit: failBranchDelete })).rejects.toThrow(
      /simulated branch delete failure/,
    );

    expect(readWorktreeRegistry(repo).worktrees.gamma).toMatchObject({
      branch: "feat/custom-gamma",
      status: "cleaning",
    });
    expect(listBranch(repo, "feat/custom-gamma")).toContain("feat/custom-gamma");
  });

  test("deletes the recorded custom branch and record on a retry", async () => {
    const repo = initTempRepo();
    await createIn(repo, { slug: "gamma", branch: "feat/custom-gamma" });
    await expect(cleanIn(repo, "gamma", { execGit: failBranchDelete })).rejects.toThrow();

    const retried = await cleanIn(repo, "gamma");

    expect(retried).toMatchObject({
      branch: "feat/custom-gamma",
      branchDeleted: true,
      registryRemoved: true,
    });
    expect(listBranch(repo, "feat/custom-gamma")).toBe("");
    expect(readWorktreeRegistry(repo).worktrees.gamma).toBeUndefined();
  });
});

describe("cleanWorktree concurrency", () => {
  test("refuses while a live create holds the slug", async () => {
    const repo = initTempRepo();
    const bootstrapStarted = createDeferred();
    const releaseBootstrap = createDeferred();
    const creating = createIn(
      repo,
      { slug: "lifecycle" },
      {
        execCommand: async () => {
          bootstrapStarted.resolve();
          await releaseBootstrap.promise;
        },
      },
    );
    await bootstrapStarted.promise;
    const drop = vi.fn(async () => {});

    await expect(cleanIn(repo, "lifecycle", { database: reachable(drop) })).rejects.toThrow(
      /currently being created/,
    );
    expect(drop).not.toHaveBeenCalled();

    releaseBootstrap.resolve();
    await creating;
    expect(readWorktreeRegistry(repo).worktrees.lifecycle?.status).toBe("active");
  });

  test("refuses a same-slug create while it cleans", async () => {
    const repo = initTempRepo();
    await createIn(repo, { slug: "gamma" });
    let createDuringClean: Promise<unknown> = Promise.resolve();

    await cleanIn(repo, "gamma", {
      database: reachable(async () => {
        createDuringClean = createIn(repo, { slug: "gamma" });
        await createDuringClean.catch(() => {});
      }),
    });

    await expect(createDuringClean).rejects.toThrow(/currently being cleaned/);
  });

  test("refuses while another live clean holds the claim", async () => {
    const repo = initTempRepo();
    await createIn(repo, { slug: "lifecycle" });
    const dropStarted = createDeferred();
    const releaseDrop = createDeferred();
    const cleanA = cleanIn(repo, "lifecycle", {
      database: reachable(async () => {
        dropStarted.resolve();
        await releaseDrop.promise;
      }),
    });
    await dropStarted.promise;
    const midClean = readWorktreeRegistry(repo).worktrees.lifecycle;
    expect(midClean?.status).toBe("cleaning");
    expect(midClean?.cleanToken).toMatch(/.+/);
    const dropByB = vi.fn(async () => {});

    await expect(cleanIn(repo, "lifecycle", { database: reachable(dropByB) })).rejects.toThrow(
      /already being cleaned/,
    );
    expect(dropByB).not.toHaveBeenCalled();

    releaseDrop.resolve();
    expect(await cleanA).toMatchObject({ databaseDropped: true, registryRemoved: true });
    expect(readWorktreeRegistry(repo).worktrees.lifecycle).toBeUndefined();
  });

  /** Replaces the clean's token with another operation's, as if that operation took the record. */
  const hijackClaim = (repo: string, slug: string, token: string) => {
    const registry = readWorktreeRegistry(repo);
    const record = registry.worktrees[slug];
    if (record) {
      registry.worktrees[slug] = { ...record, cleanToken: token };
      writeWorktreeRegistry(repo, registry);
    }
  };

  test("re-checks its claim before dropping the database", async () => {
    const repo = initTempRepo();
    await createIn(repo, { slug: "claim-check" });
    const drop = vi.fn(async () => {});

    await expect(
      cleanIn(repo, "claim-check", {
        database: fakeDatabase({
          isReachable: async () => {
            hijackClaim(repo, "claim-check", "foreign-clean-token");
            return true;
          },
          drop,
        }),
      }),
    ).rejects.toThrow(/no longer matches this cleanup claim; refusing to drop database/);
    expect(drop).not.toHaveBeenCalled();
    expect(readWorktreeRegistry(repo).worktrees["claim-check"]?.cleanToken).toBe(
      "foreign-clean-token",
    );
  });

  test.each([
    { step: "delete branch", keepBranch: false },
    { step: "remove registry entry", keepBranch: true },
  ])("re-checks its claim before it may $step", async ({ step, keepBranch }) => {
    const repo = initTempRepo();
    await createIn(repo, { slug: "claim-end" });

    await expect(
      cleanIn(
        repo,
        "claim-end",
        {
          database: reachable(async () => {
            hijackClaim(repo, "claim-end", "end-foreign-token");
          }),
        },
        { keepBranch },
      ),
    ).rejects.toThrow(`no longer matches this cleanup claim; refusing to ${step}`);
    expect(readWorktreeRegistry(repo).worktrees["claim-end"]?.cleanToken).toBe("end-foreign-token");
    expect(listBranch(repo, "worktree/claim-end")).toContain("worktree/claim-end");
  });

  test("re-checks the registry under the lock before deleting an unrecorded slug's branch", async () => {
    const repo = initTempRepo();
    const branch = "worktree/alpha";

    await expect(
      cleanIn(repo, "alpha", {
        database: fakeDatabase({
          // A same-slug create finishes its locked section after clean's first lock.
          isReachable: async () => {
            git(repo, ["branch", branch, "main"]);
            register(repo, {
              alpha: worktreeRecord({
                slug: "alpha",
                path: join(repo, ".tmp/worktrees/alpha"),
                status: "creating",
                ownerPid: process.pid,
              }),
            });
            return false;
          },
        }),
      }),
    ).rejects.toThrow(/refusing to delete branch "worktree\/alpha"/);
    expect(listBranch(repo, branch)).toContain(branch);
    expect(readWorktreeRegistry(repo).worktrees.alpha?.status).toBe("creating");
  });

  test("holds the registry lock across an unrecorded slug's database drop", async () => {
    const repo = initTempRepo();
    const events: string[] = [];
    const dropStarted = createDeferred();
    const releaseDrop = createDeferred();
    const createReadyForLock = createDeferred();
    let createEnteredLock = false;
    const lockOptions = { initialDelayMs: 5, maxDelayMs: 15, timeoutMs: 5_000 };

    const cleaning = cleanIn(repo, "unrecorded-race", {
      database: reachable(async (name) => {
        events.push(`drop:start:${name}`);
        dropStarted.resolve();
        await releaseDrop.promise;
        events.push(`drop:end:${name}`);
      }),
      lockOptions,
    });
    await dropStarted.promise;
    expect(existsSync(registryLockPathForRepo(repo))).toBe(true);

    const creating = createIn(
      repo,
      { slug: "unrecorded-race", dbMode: "required" },
      {
        checkPortAvailable: async () => {
          createEnteredLock = true;
          return true;
        },
        database: fakeDatabase({
          isReachable: async () => {
            createReadyForLock.resolve();
            return true;
          },
          ensure: async (name) => {
            events.push(`create:db:${name}`);
            return { created: true };
          },
        }),
        lockOptions,
      },
    );
    await createReadyForLock.promise;
    await Promise.resolve();
    await Promise.resolve();
    expect(createEnteredLock).toBe(false);

    releaseDrop.resolve();
    const [cleaned, created] = await Promise.all([cleaning, creating]);

    expect(createEnteredLock).toBe(true);
    expect(cleaned).toMatchObject({ databaseDropped: true, registryRemoved: false });
    expect(created.databaseCreated).toBe(true);
    expect(events).toEqual([
      "drop:start:merit_unrecorded_race",
      "drop:end:merit_unrecorded_race",
      "create:db:merit_unrecorded_race",
    ]);
    expect(readWorktreeRegistry(repo).worktrees["unrecorded-race"]?.status).toBe("active");
  });
});

describe("decideCheckoutRemoval", () => {
  const facts: CheckoutRemovalFacts = {
    gitEntry: { prunable: false },
    exists: true,
    owned: true,
    partialRemoval: false,
  };

  test.each([
    {
      name: "lets Git remove a checkout it tracks",
      facts,
      removal: { action: "git-remove", removed: true },
    },
    {
      name: "lets Git remove a checkout it tracks even outside .tmp/worktrees",
      facts: { ...facts, owned: false },
      removal: { action: "git-remove", removed: true },
    },
    {
      name: "counts a tracked checkout whose directory is gone as removed",
      facts: { ...facts, exists: false },
      removal: { action: "none", removed: true },
    },
    {
      name: "leaves a prunable entry's missing checkout to `git worktree prune`",
      facts: { ...facts, gitEntry: { prunable: true }, exists: false },
      removal: { action: "none", removed: true },
    },
    {
      name: "reports nothing removed when neither Git nor the disk has the checkout",
      facts: { ...facts, gitEntry: undefined, exists: false },
      removal: { action: "none", removed: false },
    },
    {
      name: "deletes an owned directory Git no longer tracks",
      facts: { ...facts, gitEntry: undefined },
      removal: { action: "delete-directory", removed: true },
    },
    {
      name: "refuses an untracked directory it does not own",
      facts: { ...facts, gitEntry: undefined, owned: false },
      removal: { action: "refuse", reason: "unowned" },
    },
    {
      name: "refuses residue of an interrupted removal outside .tmp/worktrees",
      facts: { ...facts, gitEntry: undefined, owned: false, partialRemoval: true },
      removal: { action: "refuse", reason: "interrupted-removal" },
    },
  ])("$name", ({ facts: found, removal }) => {
    expect(decideCheckoutRemoval(found)).toEqual(removal);
  });
});
