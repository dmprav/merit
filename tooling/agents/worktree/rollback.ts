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
  /** This attempt created the branch and proceeded to add its checkout. */
  branchCreated: boolean;
  checkoutPath: string;
  /** The added checkout's Git metadata directory, set once the attempt's token is written there. */
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

const UNTOUCHED_CHECKOUT: CheckoutRollback = {
  preserved: false,
  remains: false,
  metadataRemoved: false,
};

/**
 * Decides what happens to the registry record once rollback has dealt with the checkout.
 * A checkout Git refused to remove keeps its branch and its record, with the recorded identity,
 * so `worktree:clean` can finish the job and still reject a replacement checkout. A database
 * rollback created but could not drop also keeps the record, so `worktree:clean` can drop it.
 */
export const decideRegistryRollback = (
  progress: Pick<CreateProgress, "registryReserved" | "databaseCreated">,
  checkout: CheckoutRollback,
  databaseDropped: boolean,
): RegistryRollback => {
  const databaseRemains = progress.databaseCreated && !databaseDropped;
  if (!progress.registryReserved) {
    return { action: "none" };
  }
  if (!checkout.remains && !databaseRemains) {
    return { action: "remove" };
  }
  return {
    action: "retain",
    partialRemoval: checkout.metadataRemoved,
    databaseCreated: databaseRemains,
  };
};

const describeRemovalError = (removalError: unknown): string =>
  describeExecError(removalError) ||
  (typeof removalError === "string" ? removalError : "unknown removal error");

/**
 * Returns the error a failed create reports, naming any checkout or database rollback had to
 * leave behind.
 */
export const rollbackError = (
  error: unknown,
  checkoutPath: string,
  checkout: CheckoutRollback,
  undroppedDatabase?: string,
  createdBranch?: string,
): unknown => {
  const problems = [
    checkoutRollbackProblem(checkoutPath, checkout),
    createdBranch && `inspect branch "${createdBranch}" before retrying with that name`,
    undroppedDatabase === undefined
      ? undefined
      : `rollback could not drop database "${undroppedDatabase}"; its registry record is kept so \`vp run worktree:clean\` can drop it`,
  ].filter((problem) => problem !== undefined);
  return problems.length === 0
    ? error
    : new Error(`${errorMessage(error)} (${problems.join("; ")})`, { cause: error });
};

/** Describes what rollback left of the checkout, or undefined when it removed the checkout. */
const checkoutRollbackProblem = (
  checkoutPath: string,
  checkout: CheckoutRollback,
): string | undefined => {
  if (checkout.removalError || checkout.remains) {
    const detail = checkout.removalError
      ? describeRemovalError(checkout.removalError)
      : "directory still exists after removal";
    return `rollback could not remove checkout at "${checkoutPath}": ${detail}`;
  }
  if (checkout.preserved) {
    return `rollback preserved "${checkoutPath}" because its Git metadata does not show that this attempt created it`;
  }
  return undefined;
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
  if (!progress.branchCreated) {
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
                cleanupPolicy: "finish-rollback",
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
  const registry = decideRegistryRollback(progress, checkout, databaseDropped);
  await settleRegistryRecord(attempt, progress, registry);
  const undroppedDatabase =
    progress.databaseCreated && !databaseDropped ? attempt.databaseName : undefined;
  return rollbackError(
    error,
    progress.checkoutPath,
    checkout,
    undroppedDatabase,
    progress.branchCreated ? attempt.branch : undefined,
  );
};
