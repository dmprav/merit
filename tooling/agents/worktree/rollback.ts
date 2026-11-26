import { existsSync } from "node:fs";
import { join } from "node:path";

import { errorMessage } from "../../cli.ts";
import { isCheckoutOfAttempt } from "./checkout-identity.ts";
import { isCreateClaimAt, withoutOwner } from "./claims.ts";
import { type WorktreeDatabase } from "./database.ts";
import { describeExecError, type RepoGit } from "./git.ts";
import { canonicalPath } from "./paths.ts";
import { type RegistryLockOptions, updateRecord } from "./registry.ts";

/** What a create attempt has changed so far; rollback undoes exactly these changes. */
export type CreateProgress = {
  /** This attempt's own `git branch` created the branch, so rollback may delete it. */
  branchCreated: boolean;
  /** `git worktree add` ran, so a checkout may exist at `checkoutPath`. */
  checkoutAttempted: boolean;
  checkoutPath: string;
  /** The Git metadata directory of the added checkout, which holds the attempt's token. */
  gitDir?: string;
  registryReserved: boolean;
  databaseCreated: boolean;
};

/** What rollback found at, and did to, the attempted checkout. */
export type CheckoutRollback = {
  /** Something occupies the target that Git metadata does not tie to this attempt. */
  preserved: boolean;
  removalError?: unknown;
  /** The checkout directory still exists after Git tried to remove it. */
  remains: boolean;
  /** Git deleted the remaining checkout's `.git` before failing. */
  metadataRemoved: boolean;
};

export type RegistryRollback =
  | { action: "none" | "remove" }
  | { action: "retain"; partialRemoval: boolean; databaseCreated: boolean };

export type RollbackCleanup = { deleteBranch: boolean; registry: RegistryRollback };

const UNTOUCHED_CHECKOUT: CheckoutRollback = {
  preserved: false,
  remains: false,
  metadataRemoved: false,
};

/**
 * Decides what rollback does with the branch and registry record once the checkout is dealt with.
 * A checkout Git refused to remove keeps its branch and its record, with the recorded identity,
 * so `worktree:clean` can finish the job and still reject a replacement checkout.
 */
export const decideRollbackCleanup = (
  progress: Pick<CreateProgress, "branchCreated" | "registryReserved" | "databaseCreated">,
  checkout: CheckoutRollback,
  databaseDropped: boolean,
): RollbackCleanup => {
  const deleteBranch = progress.branchCreated && !checkout.remains;
  if (!progress.registryReserved) {
    return { deleteBranch, registry: { action: "none" } };
  }
  if (!checkout.remains) {
    return { deleteBranch, registry: { action: "remove" } };
  }
  return {
    deleteBranch,
    registry: {
      action: "retain",
      partialRemoval: checkout.metadataRemoved,
      databaseCreated: progress.databaseCreated && !databaseDropped,
    },
  };
};

const describeRemovalError = (removalError: unknown): string =>
  describeExecError(removalError) ||
  (typeof removalError === "string" ? removalError : "unknown removal error");

/** Returns the error a failed create reports, naming any checkout rollback had to leave behind. */
export const rollbackError = (
  error: unknown,
  checkoutPath: string,
  checkout: CheckoutRollback,
): unknown => {
  if (checkout.removalError || checkout.remains) {
    const detail = checkout.removalError
      ? describeRemovalError(checkout.removalError)
      : "directory still exists after removal";
    return new Error(
      `${errorMessage(error)} (rollback could not remove checkout at "${checkoutPath}": ${detail})`,
      { cause: error },
    );
  }
  if (checkout.preserved) {
    return new Error(
      `${errorMessage(error)} (rollback preserved "${checkoutPath}" because its Git metadata does not show that this attempt created it)`,
      { cause: error },
    );
  }
  return error;
};

/** The parts of a create attempt that rollback needs to identify and undo its changes. */
export type CreateAttempt = {
  slug: string;
  branch: string;
  databaseName: string;
  checkoutToken: string;
  git: RepoGit;
  database: WorktreeDatabase;
  lockOptions?: RegistryLockOptions;
};

const ignoreFailure = (step: () => unknown): void => {
  try {
    step();
  } catch {
    // Best-effort rollback.
  }
};

const ignoreAsyncFailure = async (step: () => Promise<unknown>): Promise<void> => {
  try {
    await step();
  } catch {
    // Best-effort rollback.
  }
};

const dropCreatedDatabase = async (attempt: CreateAttempt, progress: CreateProgress) => {
  if (!progress.databaseCreated) {
    return false;
  }
  try {
    await attempt.database.drop(attempt.databaseName);
    return true;
  } catch {
    return false;
  }
};

const ownsCheckout = (attempt: CreateAttempt, progress: CreateProgress, checkoutDir: string) => {
  try {
    return isCheckoutOfAttempt(checkoutDir, {
      commonGitDir: attempt.git.commonGitDir(),
      gitDir: progress.gitDir,
      checkoutToken: attempt.checkoutToken,
      branch: attempt.branch,
    });
  } catch {
    return false;
  }
};

/**
 * Lets Git remove its own checkout. If Git refuses (for example, a locked worktree), the checkout
 * and its registry record stay instead of the directory being deleted recursively.
 */
const removeOwnedCheckout = (git: RepoGit, checkoutDir: string): CheckoutRollback => {
  let removalError: unknown;
  try {
    git.run(["worktree", "remove", "--force", checkoutDir]);
  } catch (error) {
    removalError = error;
  }
  const remains = existsSync(checkoutDir);
  return {
    preserved: false,
    removalError,
    remains,
    metadataRemoved: remains && !existsSync(join(checkoutDir, ".git")),
  };
};

const rollBackCheckout = (attempt: CreateAttempt, progress: CreateProgress): CheckoutRollback => {
  if (!progress.checkoutAttempted) {
    return UNTOUCHED_CHECKOUT;
  }
  const checkoutDir = existsSync(progress.checkoutPath)
    ? canonicalPath(progress.checkoutPath)
    : progress.checkoutPath;
  let checkout = UNTOUCHED_CHECKOUT;
  if (existsSync(checkoutDir)) {
    checkout = ownsCheckout(attempt, progress, checkoutDir)
      ? removeOwnedCheckout(attempt.git, checkoutDir)
      : { ...UNTOUCHED_CHECKOUT, preserved: true };
  }
  ignoreFailure(() => attempt.git.run(["worktree", "prune"]));
  return checkout;
};

const settleRegistryRecord = async (
  attempt: CreateAttempt,
  progress: CreateProgress,
  registry: RegistryRollback,
): Promise<void> => {
  if (registry.action === "none") {
    return;
  }
  await ignoreAsyncFailure(() =>
    updateRecord(
      attempt.git.root,
      attempt.slug,
      {
        when: isCreateClaimAt(progress.checkoutPath),
        apply: (record) =>
          registry.action === "retain"
            ? {
                ...withoutOwner(record),
                ...(registry.partialRemoval ? { partialRemoval: true } : {}),
                databaseCreated: registry.databaseCreated,
                status: "cleaning",
              }
            : undefined,
      },
      attempt.lockOptions,
    ),
  );
};

/**
 * Undoes what a failed create attempt changed, newest first, and returns the error to report.
 * Each step is best effort so one failure never hides the original error.
 */
export const rollBackCreate = async (
  attempt: CreateAttempt,
  progress: CreateProgress,
  error: unknown,
): Promise<unknown> => {
  const databaseDropped = await dropCreatedDatabase(attempt, progress);
  const checkout = rollBackCheckout(attempt, progress);
  const cleanup = decideRollbackCleanup(progress, checkout, databaseDropped);
  // A branch that appeared after the last check may belong to another job, so delete only the
  // branch this attempt's own `git branch` created.
  if (cleanup.deleteBranch && attempt.git.branchExists(attempt.branch)) {
    ignoreFailure(() => attempt.git.run(["branch", "-D", attempt.branch]));
  }
  await settleRegistryRecord(attempt, progress, cleanup.registry);
  return rollbackError(error, progress.checkoutPath, checkout);
};
