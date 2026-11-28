import { randomUUID } from "node:crypto";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

import { errorMessage } from "../../cli.ts";
import { assertSafeManagedDatabaseName } from "../../scripts/local-postgres.ts";
import {
  assertCheckoutIdentity,
  currentCheckoutPath,
  hasOwnedWorktreeGitFile,
} from "./checkout-identity.ts";
import {
  type CleanClaim,
  cleanRefusal,
  isClaimOwnerAlive,
  matchesCleanClaim,
  withoutCleanClaim,
} from "./claims.ts";
import { LOCAL_POSTGRES_ADDRESS } from "./database.ts";
import { type WorktreeDeps } from "./deps.ts";
import { type GitWorktreeEntry, linkedCheckoutPaths, type RepoGit, repoGit } from "./git.ts";
import {
  databaseNameForSlug,
  defaultBranchForSlug,
  isProtectedBranch,
  validateWorktreeSlug,
} from "./naming.ts";
import {
  canonicalPath,
  containsPath,
  defaultWorktreePath,
  isInsideDirectory,
  managedWorktreesRoot,
  pathEntryExists,
  pathsOverlap,
} from "./paths.ts";
import {
  readWorktreeRegistry,
  updateRecord,
  type WorktreeRecord,
  type WorktreeRegistry,
  withWorktreeRegistryLock,
  writeWorktreeRegistry,
} from "./registry.ts";

export type CleanWorktreeRequest = {
  primaryRepoRoot: string;
  slug: string;
  keepBranch: boolean;
};

export type WorktreeCleanResult = {
  slug: string;
  path: string;
  branch: string;
  worktreeRemoved: boolean;
  databaseName: string;
  databaseDropped: boolean;
  branchDeleted: boolean;
  registryRemoved: boolean;
};

export type WorktreeCleanOutcome = { result: WorktreeCleanResult; warnings: string[] };

export type CleanDeps = Pick<WorktreeDeps, "execGit" | "database" | "lockOptions">;

type CleanTarget = CleanClaim & {
  slug: string;
  worktreePath: string;
  /** The registered record, whose checkout identity removal must still match. */
  identity: WorktreeRecord | undefined;
  branch: string;
};

type CleanRun = {
  target: CleanTarget;
  git: RepoGit;
  deps: CleanDeps;
  /** Removal of the checkout started, so a failure may leave residue without its `.git`. */
  removalAttempted: boolean;
};

const assertNoNestedWorktrees = (normalizedPath: string, otherPaths: Iterable<string>): void => {
  for (const otherPath of otherPaths) {
    const otherCanonicalPath = canonicalPath(otherPath);
    if (isInsideDirectory(otherCanonicalPath, normalizedPath)) {
      throw new Error(
        `Refusing to remove "${normalizedPath}": it contains another worktree at "${otherCanonicalPath}". Move or remove that worktree first.`,
      );
    }
  }
};

/** A registered checkout's recorded path and, if it was moved with `git worktree move`, its current one. */
const registeredPaths = (record: WorktreeRecord): Set<string> =>
  new Set([canonicalPath(record.path), currentCheckoutPath(record) ?? canonicalPath(record.path)]);

/** Refuses an unrecorded slug whose default path matches or overlaps another registered checkout. */
const assertUnrecordedPathFree = (
  slug: string,
  normalizedPath: string,
  others: readonly WorktreeRecord[],
): void => {
  for (const other of others) {
    for (const otherPath of registeredPaths(other)) {
      if (pathsOverlap(normalizedPath, otherPath)) {
        throw new Error(
          `Refusing to clean unrecorded worktree "${slug}": default path "${normalizedPath}" overlaps registered worktree "${other.slug}" at "${otherPath}". Run \`vp run worktree:clean ${other.slug}\` instead.`,
        );
      }
    }
  }
};

/** Checks what the clean may remove and marks the record `cleaning` so no other operation takes it. */
const claimCleanup = (
  registry: WorktreeRegistry,
  { slug, git, cleanToken }: { slug: string; git: RepoGit; cleanToken: string },
): CleanTarget => {
  const record = registry.worktrees[slug];
  const refusal = cleanRefusal(slug, record, Boolean(record && isClaimOwnerAlive(record)));
  if (refusal) {
    throw new Error(refusal);
  }
  const worktreePath = record?.path ?? defaultWorktreePath(git.root, slug);
  const normalizedPath = canonicalPath(worktreePath);
  if (containsPath(normalizedPath, git.root)) {
    throw new Error(
      `Refusing to remove primary repository root or ancestor directory "${normalizedPath}".`,
    );
  }
  const others = Object.values(registry.worktrees).filter((other) => other.slug !== slug);
  if (!record) {
    assertUnrecordedPathFree(slug, normalizedPath, others);
  }
  assertNoNestedWorktrees(normalizedPath, [
    ...others.map((other) => other.path),
    ...linkedCheckoutPaths(git.worktrees(), git.root),
  ]);
  assertCheckoutIdentity(worktreePath, normalizedPath, record);
  const databaseName = record?.databaseName ?? databaseNameForSlug(slug);
  assertSafeManagedDatabaseName(databaseName);

  if (record) {
    registry.worktrees[slug] = { ...record, status: "cleaning", cleanToken, ownerPid: process.pid };
    writeWorktreeRegistry(git.root, registry);
  }
  return {
    slug,
    worktreePath,
    normalizedPath,
    identity: record,
    branch: record?.branch ?? defaultBranchForSlug(slug),
    databaseName,
    databaseCreated: record?.databaseCreated ?? false,
    claimed: Boolean(record),
    cleanToken,
  };
};

export type CheckoutRemovalFacts = {
  /** Git's entry for the checkout, if Git still lists it. */
  gitEntry: Pick<GitWorktreeEntry, "prunable"> | undefined;
  exists: boolean;
  /** The directory is under `.tmp/worktrees/` or is a linked checkout of this repository. */
  owned: boolean;
  partialRemoval: boolean;
};

export type CheckoutRemoval =
  | { action: "git-remove" | "delete-directory" | "none"; removed: boolean }
  | { action: "refuse"; reason: "unowned" | "interrupted-removal" };

/**
 * Decides how to remove a checkout. Git removes the checkouts it still tracks, so a locked or
 * failing removal surfaces instead of deleting files recursively; a directory Git no longer
 * tracks is deleted only when this tool owns it. A prunable entry has lost its checkout `.git`;
 * `git worktree prune` clears its metadata.
 */
export const decideCheckoutRemoval = (facts: CheckoutRemovalFacts): CheckoutRemoval => {
  if (facts.gitEntry && !facts.gitEntry.prunable) {
    return { action: facts.exists ? "git-remove" : "none", removed: true };
  }
  if (!facts.exists) {
    return { action: "none", removed: Boolean(facts.gitEntry) };
  }
  if (facts.owned) {
    return { action: "delete-directory", removed: true };
  }
  return { action: "refuse", reason: facts.partialRemoval ? "interrupted-removal" : "unowned" };
};

const removalRefusal = (
  { slug, normalizedPath }: CleanTarget,
  reason: "unowned" | "interrupted-removal",
): Error =>
  new Error(
    reason === "interrupted-removal"
      ? `Refusing to delete "${normalizedPath}" recursively: it is what remains of an interrupted removal of worktree "${slug}" outside ".tmp/worktrees/". Check that it holds nothing you need, delete it yourself, and rerun \`vp run worktree:clean ${slug}\`.`
      : `Refusing to remove directory "${normalizedPath}": it is not a recognized Git worktree for this repository and is outside ".tmp/worktrees/".`,
  );

const removeCheckout = (run: CleanRun): boolean => {
  const { target, git } = run;
  const gitWorktrees = git.worktrees();
  const commonGitDir = git.commonGitDir();
  assertCheckoutIdentity(target.worktreePath, target.normalizedPath, target.identity);
  assertNoNestedWorktrees(target.normalizedPath, linkedCheckoutPaths(gitWorktrees, git.root));

  const removal = decideCheckoutRemoval({
    gitEntry: gitWorktrees.find((entry) => canonicalPath(entry.path) === target.normalizedPath),
    exists: existsSync(target.worktreePath),
    owned:
      isInsideDirectory(target.normalizedPath, managedWorktreesRoot(git.root)) ||
      hasOwnedWorktreeGitFile(target.worktreePath, commonGitDir),
    partialRemoval: Boolean(target.identity?.partialRemoval),
  });
  if (removal.action === "refuse") {
    throw removalRefusal(target, removal.reason);
  }
  if (removal.action !== "none") {
    run.removalAttempted = true;
  }
  if (removal.action === "git-remove") {
    git.run(["worktree", "remove", "--force", target.worktreePath]);
  } else if (removal.action === "delete-directory") {
    rmSync(target.worktreePath, { recursive: true, force: true });
  }
  git.run(["worktree", "prune"]);
  return removal.removed;
};

const assertClaimHeld = (run: CleanRun, refusedAction: string): void => {
  const { target, git } = run;
  if (!matchesCleanClaim(readWorktreeRegistry(git.root).worktrees[target.slug], target)) {
    throw new Error(
      `Worktree "${target.slug}" registry record no longer matches this cleanup claim; refusing to ${refusedAction}.`,
    );
  }
};

const withRegistryLock = <T>(run: CleanRun, operation: () => Promise<T> | T): Promise<T> =>
  withWorktreeRegistryLock(run.git.root, operation, run.deps.lockOptions);

const consumeDatabaseOwnership = async (run: CleanRun): Promise<void> => {
  const { target, deps } = run;
  // Consume permission before DROP: a crash or lost reply must never authorize a second drop
  // by name, because the operator may have put a different database there in the meantime.
  const cleared = await updateRecord(
    run.git.root,
    target.slug,
    {
      when: (record) => matchesCleanClaim(record, target),
      apply: (record) => ({ ...record, databaseCreated: false }),
    },
    deps.lockOptions,
  );
  if (!cleared) {
    throw new Error(
      `Worktree "${target.slug}" registry record no longer matches this cleanup claim; refusing to drop database "${target.databaseName}".`,
    );
  }
  target.databaseCreated = false;
};

const dropDatabase = async (run: CleanRun): Promise<{ dropped: boolean; warnings: string[] }> => {
  const { target, deps } = run;
  if (!target.databaseCreated) {
    return {
      dropped: false,
      warnings: [
        `Skipped database "${target.databaseName}": the registry has no ownership record for this database.`,
      ],
    };
  }
  if (!(await deps.database.isReachable())) {
    return {
      dropped: false,
      warnings: [
        `Warning: PostgreSQL at ${LOCAL_POSTGRES_ADDRESS} is not reachable; skipped dropping database "${target.databaseName}".`,
      ],
    };
  }
  await consumeDatabaseOwnership(run);
  try {
    await deps.database.drop(target.databaseName);
  } catch (cause) {
    throw new Error(
      `Could not confirm the drop of "${target.databaseName}": ${errorMessage(cause)}. Inspect the database manually before retrying cleanup.`,
      { cause },
    );
  }
  return { dropped: true, warnings: [] };
};

/**
 * Deletes the worktree branch unless the primary or another checkout uses it. A same-slug create
 * holds this lock from `git branch` until it records its claim, so checking the registry under the
 * lock keeps this cleanup from deleting that create's new branch.
 */
const deleteBranch = (run: CleanRun): Promise<boolean> =>
  withRegistryLock(run, () => {
    const { target, git } = run;
    assertClaimHeld(run, `delete branch "${target.branch}"`);
    const checkedOutBranches = new Set(git.worktrees().map((entry) => entry.branch));
    if (
      target.branch === git.currentBranch() ||
      checkedOutBranches.has(target.branch) ||
      !git.branchExists(target.branch)
    ) {
      return false;
    }
    git.run(["branch", "-D", target.branch]);
    return true;
  });

/** Keeps the ownership record for an offline database and releases its claim for a retry. */
const finishRecord = async ({ target, git, deps }: CleanRun): Promise<boolean> => {
  const updated = await updateRecord(
    git.root,
    target.slug,
    {
      when: (record) => matchesCleanClaim(record, target),
      apply: (record) => (record.databaseCreated ? withoutCleanClaim(record) : undefined),
    },
    deps.lockOptions,
  );
  if (!updated) {
    throw new Error(
      `Worktree "${target.slug}" registry record no longer matches this cleanup claim; refusing to remove registry entry.`,
    );
  }
  return !target.databaseCreated;
};

/**
 * Releases a failed clean's claim so it can be retried. Git deletes a checkout's metadata even when
 * removing its files fails, so the residue is recorded explicitly instead of dropping its identity.
 */
const releaseClaim = async ({ target, git, deps, removalAttempted }: CleanRun): Promise<void> => {
  await updateRecord(
    git.root,
    target.slug,
    {
      when: (record) => record.status === "cleaning" && record.cleanToken === target.cleanToken,
      apply: (record) => {
        const partialRemoval =
          removalAttempted &&
          existsSync(target.worktreePath) &&
          !pathEntryExists(join(target.worktreePath, ".git"));
        return partialRemoval
          ? { ...withoutCleanClaim(record), partialRemoval: true }
          : withoutCleanClaim(record);
      },
    },
    deps.lockOptions,
  );
};

const cleanClaimedWorktree = async (
  run: CleanRun,
  keepBranch: boolean,
): Promise<WorktreeCleanOutcome> => {
  const { target } = run;
  const worktreeRemoved = removeCheckout(run);
  const database = await dropDatabase(run);
  const branchDeleted =
    !keepBranch && !isProtectedBranch(target.branch) && (await deleteBranch(run));
  const registryRemoved = target.claimed && (await finishRecord(run));
  return {
    result: {
      slug: target.slug,
      path: target.normalizedPath,
      branch: target.branch,
      worktreeRemoved,
      databaseName: target.databaseName,
      databaseDropped: database.dropped,
      branchDeleted,
      registryRemoved,
    },
    warnings: database.warnings,
  };
};

/**
 * Idempotently removes a worktree's checkout, database, branch, and registry record, refusing
 * anything this tool cannot prove it created. A failed clean leaves its record for a retry.
 */
export const cleanWorktree = async (
  request: CleanWorktreeRequest,
  deps: CleanDeps,
): Promise<WorktreeCleanOutcome> => {
  const slug = validateWorktreeSlug(request.slug);
  const git = repoGit(canonicalPath(request.primaryRepoRoot), deps.execGit);
  const cleanToken = randomUUID();
  const target = await withWorktreeRegistryLock(
    git.root,
    () => claimCleanup(readWorktreeRegistry(git.root), { slug, git, cleanToken }),
    deps.lockOptions,
  );
  const run: CleanRun = { target, git, deps, removalAttempted: false };
  try {
    return await cleanClaimedWorktree(run, request.keepBranch);
  } catch (error) {
    if (target.claimed) {
      await releaseClaim(run).catch(() => {
        // Best-effort release; the original error explains the failure.
      });
    }
    throw error;
  }
};
