import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { errorMessage } from "../../cli.ts";
import {
  currentCheckoutPath,
  isCheckoutOfAttempt,
  moveBackInstruction,
  movedCheckoutPath,
  readWorktreeGitDir,
} from "./checkout-identity.ts";
import { matchesCreateClaim, withoutOwner } from "./claims.ts";
import { type WorktreeDatabase } from "./database.ts";
import { describeExecError, type RepoGit } from "./git.ts";
import { type RegistryLockOptions, updateRecord } from "./registry.ts";

/** What a create attempt has changed so far; rollback undoes exactly these changes. */
export type CreateProgress = {
  /** This attempt's own `git branch` created the branch, so rollback may delete it. */
  branchCreated: boolean;
  /** `git worktree add` ran, so a checkout may exist at `checkoutPath`. */
  checkoutAttempted: boolean;
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
  movedTo?: string;
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
 * so `worktree:clean` can finish the job and still reject a replacement checkout. A database
 * rollback created but could not drop also keeps the record, so `worktree:clean` can drop it.
 */
export const decideRollbackCleanup = (
  progress: Pick<CreateProgress, "branchCreated" | "registryReserved" | "databaseCreated">,
  checkout: CheckoutRollback,
  databaseDropped: boolean,
): RollbackCleanup => {
  const deleteBranch = progress.branchCreated && !checkout.remains;
  const databaseRemains = progress.databaseCreated && !databaseDropped;
  if (!progress.registryReserved) {
    return { deleteBranch, registry: { action: "none" } };
  }
  if (!checkout.remains && !databaseRemains) {
    return { deleteBranch, registry: { action: "remove" } };
  }
  return {
    deleteBranch,
    registry: {
      action: "retain",
      partialRemoval: checkout.metadataRemoved,
      databaseCreated: databaseRemains,
    },
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
  slug: string,
  checkoutPath: string,
  checkout: CheckoutRollback,
  undroppedDatabase?: string,
): unknown => {
  const problems = [
    checkoutRollbackProblem(slug, checkoutPath, checkout),
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
  slug: string,
  checkoutPath: string,
  checkout: CheckoutRollback,
): string | undefined => {
  if (checkout.movedTo) {
    return `checkout moved to "${checkout.movedTo}". ${moveBackInstruction(checkoutPath, checkout.movedTo)} and run \`vp run worktree:clean ${slug}\``;
  }
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

/** Pin the token-backed checkout while Git resolves the path passed to worktree remove. */
const removeRegisteredCheckout = (
  attempt: CreateAttempt,
  checkoutPath: string,
  gitDir: string,
): void => {
  const lock = join(gitDir, "locked");
  const reason = `Merit is rolling back ${attempt.slug} (${attempt.checkoutToken})\n`;
  // Claim Git's per-worktree lock by stable metadata path, without overwriting an existing lock.
  writeFileSync(lock, reason, { flag: "wx" });
  try {
    const identity = { gitDir, checkoutToken: attempt.checkoutToken };
    if (
      currentCheckoutPath(identity) !== checkoutPath ||
      readWorktreeGitDir(checkoutPath) !== gitDir
    ) {
      throw new Error("checkout identity changed before removal");
    }
    // Git requires two force flags to remove the checkout under our own lock.
    attempt.git.run(["worktree", "remove", "--force", "--force", checkoutPath]);
  } finally {
    ignoreFailure(() => {
      if (readFileSync(lock, "utf8") === reason) {
        unlinkSync(lock);
      }
    });
  }
};

/**
 * Lets Git remove its own checkout. If Git refuses (for example, a locked worktree), the checkout
 * and its registry record stay instead of the directory being deleted recursively.
 */
const removeOwnedCheckout = (
  attempt: CreateAttempt,
  progress: CreateProgress,
): CheckoutRollback => {
  const checkoutDir = progress.checkoutPath;
  let removalError: unknown;
  try {
    if (progress.gitDir) {
      removeRegisteredCheckout(attempt, checkoutDir, progress.gitDir);
    } else {
      attempt.git.run(["worktree", "remove", "--force", checkoutDir]);
    }
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
  const checkoutDir = progress.checkoutPath;

  const movedCheckout = (): CheckoutRollback | undefined => {
    const path = movedCheckoutPath(checkoutDir, {
      gitDir: progress.gitDir,
      checkoutToken: attempt.checkoutToken,
    });
    if (path) {
      return { ...UNTOUCHED_CHECKOUT, remains: true, movedTo: path };
    }
    return undefined;
  };

  const moved = movedCheckout();
  if (moved) {
    return moved;
  }
  let checkout = UNTOUCHED_CHECKOUT;
  if (existsSync(checkoutDir)) {
    checkout = ownsCheckout(attempt, progress, checkoutDir)
      ? removeOwnedCheckout(attempt, progress)
      : { ...UNTOUCHED_CHECKOUT, preserved: true };
  }
  ignoreFailure(() => attempt.git.run(["worktree", "prune"]));
  // Git may have moved it during removal or pruning. Observe its location at the drop decision.
  return movedCheckout() ?? checkout;
};

const settleRegistryRecord = async (
  attempt: CreateAttempt,
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
        when: matchesCreateClaim(attempt.checkoutToken),
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
 * Undoes what a failed create attempt changed and returns the error to report.
 * Each step is best effort so one failure never hides the original error.
 */
export const rollBackCreate = async (
  attempt: CreateAttempt,
  progress: CreateProgress,
  error: unknown,
): Promise<unknown> => {
  const checkout = rollBackCheckout(attempt, progress);
  const databaseDropped = !checkout.movedTo && (await dropCreatedDatabase(attempt, progress));
  const cleanup = decideRollbackCleanup(progress, checkout, databaseDropped);
  // A branch that appeared after the last check may belong to another job, so delete only the
  // branch this attempt's own `git branch` created.
  if (cleanup.deleteBranch && attempt.git.branchExists(attempt.branch)) {
    ignoreFailure(() => attempt.git.run(["branch", "-D", attempt.branch]));
  }
  await settleRegistryRecord(attempt, cleanup.registry);
  const undroppedDatabase =
    progress.databaseCreated && !databaseDropped && !checkout.movedTo
      ? attempt.databaseName
      : undefined;
  return rollbackError(error, attempt.slug, progress.checkoutPath, checkout, undroppedDatabase);
};
