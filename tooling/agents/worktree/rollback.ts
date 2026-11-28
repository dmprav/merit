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
import {
  consumeDatabaseOwnership,
  type RegistryLockOptions,
  updateRecord,
  type WorktreeRecord,
} from "./registry.ts";

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
  movedTo?: string;
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
 * whose drop was deferred while PostgreSQL was unreachable also keeps its ownership record.
 */
export const decideRegistryRollback = (
  progress: Pick<CreateProgress, "registryReserved">,
  checkout: CheckoutRollback,
  databasePending: boolean,
): RegistryRollback => {
  if (!progress.registryReserved) {
    return { action: "none" };
  }
  if (!checkout.remains && !databasePending) {
    return { action: "remove" };
  }
  return {
    action: "retain",
    partialRemoval: checkout.metadataRemoved,
    databaseCreated: databasePending,
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
  databaseProblem?: string,
  createdBranch?: string,
): unknown => {
  const problems = [
    checkoutRollbackProblem(slug, checkoutPath, checkout),
    createdBranch && `inspect branch "${createdBranch}" before retrying with that name`,
    databaseProblem,
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

const matchesAttempt = (attempt: CreateAttempt) => (record: WorktreeRecord) =>
  matchesCreateClaim(attempt.checkoutToken)(record) && record.databaseName === attempt.databaseName;

type DatabaseRollback = "settled" | "deferred" | "inspect";

const dropCreatedDatabase = async (
  attempt: CreateAttempt,
  progress: CreateProgress,
  canDrop: (record: WorktreeRecord) => boolean,
): Promise<DatabaseRollback> => {
  if (!progress.databaseCreated) {
    return "settled";
  }
  try {
    if (!(await attempt.database.isReachable())) {
      return "deferred";
    }
    const owned = await consumeDatabaseOwnership(
      attempt.git.root,
      attempt.slug,
      (record) => matchesAttempt(attempt)(record) && canDrop(record),
      attempt.lockOptions,
    );
    if (!owned) {
      return "inspect";
    }
    await attempt.database.drop(attempt.databaseName);
    return "settled";
  } catch {
    return "inspect";
  }
};

const databaseRollbackProblem = (outcome: DatabaseRollback, name: string): string | undefined => {
  if (outcome === "deferred") {
    return `rollback could not drop database "${name}" while PostgreSQL was unreachable; retry with \`vp run worktree:clean\``;
  }
  if (outcome === "inspect") {
    return `rollback could not confirm the drop of database "${name}"; inspect the database manually`;
  }
  return undefined;
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
  if (!progress.branchCreated) {
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
        when: matchesAttempt(attempt),
        apply: (record) =>
          registry.action === "retain"
            ? {
                ...withoutOwner(record),
                ...(registry.partialRemoval ? { partialRemoval: true } : {}),
                databaseCreated: record.databaseCreated && registry.databaseCreated,
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
 * Undoes what a failed create attempt changed and returns the error to report.
 * Each step is best effort so one failure never hides the original error.
 */
export const rollBackCreate = async (
  attempt: CreateAttempt,
  progress: CreateProgress,
  error: unknown,
): Promise<unknown> => {
  let checkout = rollBackCheckout(attempt, progress);
  const database = checkout.movedTo
    ? "deferred"
    : await dropCreatedDatabase(attempt, progress, (record) => {
        // The checkout can move while PostgreSQL is probed or while waiting for the registry lock.
        const movedTo = movedCheckoutPath(progress.checkoutPath, record);
        if (movedTo) {
          checkout = { ...checkout, movedTo, remains: true };
        }
        return !movedTo;
      });
  const databasePending = checkout.movedTo ? progress.databaseCreated : database === "deferred";
  const registry = decideRegistryRollback(progress, checkout, databasePending);
  await settleRegistryRecord(attempt, registry);
  return rollbackError(
    error,
    attempt.slug,
    progress.checkoutPath,
    checkout,
    checkout.movedTo ? undefined : databaseRollbackProblem(database, attempt.databaseName),
    progress.branchCreated ? attempt.branch : undefined,
  );
};
