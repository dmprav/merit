import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { canonicalPath, isInsideDirectory, pathEntryExists } from "./paths.ts";
import { type WorktreeRecord } from "./registry.ts";

// Written into the checkout's `.git/worktrees/<id>/` directory. Git deletes that directory with the
// checkout, so a later checkout that reuses the same path and id never carries this token.
const CHECKOUT_TOKEN_FILE = "merit-checkout-token";

export type CheckoutIdentity = Pick<WorktreeRecord, "gitDir" | "checkoutToken" | "partialRemoval">;

const readTrimmed = (path: string): string | null => {
  try {
    return readFileSync(path, "utf8").trim();
  } catch {
    return null;
  }
};

const readCheckoutToken = (gitDir: string): string | null =>
  readTrimmed(join(gitDir, CHECKOUT_TOKEN_FILE)) || null;

export const writeCheckoutToken = (gitDir: string, token: string): void => {
  writeFileSync(join(gitDir, CHECKOUT_TOKEN_FILE), `${token}\n`, "utf8");
};

/** Returns the Git metadata directory a linked checkout's `.git` file points at. */
export const readWorktreeGitDir = (worktreePath: string): string | null => {
  const dotGitPath = join(worktreePath, ".git");
  try {
    if (!statSync(dotGitPath).isFile()) {
      return null;
    }
    const content = readFileSync(dotGitPath, "utf8").trim();
    const match = /^gitdir:\s*(.+)$/.exec(content);
    if (!match?.[1]) {
      return null;
    }
    return canonicalPath(resolve(worktreePath, match[1].trim()));
  } catch {
    return null;
  }
};

/** Reports whether `worktreePath` is a linked checkout of the repository that owns `commonGitDir`. */
export const hasOwnedWorktreeGitFile = (worktreePath: string, commonGitDir: string): boolean => {
  const referencedGitDir = readWorktreeGitDir(worktreePath);
  if (!referencedGitDir) {
    return false;
  }
  return isInsideDirectory(referencedGitDir, join(commonGitDir, "worktrees"));
};

/** Reports whether the Git metadata recorded for a checkout still carries the token written at create. */
export const holdsCheckoutToken = (identity: CheckoutIdentity | undefined): boolean =>
  Boolean(
    identity?.gitDir &&
    identity.checkoutToken &&
    readCheckoutToken(identity.gitDir) === identity.checkoutToken,
  );

/**
 * Returns where the registered checkout lives now, following the back-link Git keeps in its
 * metadata, or `null` when that metadata no longer belongs to the registered checkout.
 */
export const currentCheckoutPath = (identity: CheckoutIdentity | undefined): string | null => {
  if (!identity?.gitDir || !holdsCheckoutToken(identity)) {
    return null;
  }
  const backLink = readTrimmed(join(identity.gitDir, "gitdir"));
  return backLink === null ? null : dirname(canonicalPath(resolve(identity.gitDir, backLink)));
};

export type CheckoutAttempt = {
  commonGitDir: string;
  /** The metadata directory `git worktree add` created, when it got that far. */
  gitDir?: string;
  checkoutToken: string;
  branch: string;
};

/**
 * Proves that a checkout left behind by a failed `git worktree add` belongs to this attempt: its
 * Git metadata must point back at `worktreePath` and check out the branch this attempt created.
 */
const gitMetadataNamesNewCheckout = (
  gitDir: string,
  worktreePath: string,
  branch: string,
): boolean => {
  const head = readTrimmed(join(gitDir, "HEAD"));
  const backLink = readTrimmed(join(gitDir, "gitdir"));
  return (
    head === `ref: refs/heads/${branch}` &&
    backLink !== null &&
    canonicalPath(resolve(gitDir, backLink)) === canonicalPath(join(worktreePath, ".git"))
  );
};

/**
 * Reports whether the checkout at `worktreePath` was created by this attempt. The directory's earlier
 * absence does not prove ownership: another process can fill it before `git worktree add` runs.
 * Only Git metadata tied to this attempt does.
 */
export const isCheckoutOfAttempt = (worktreePath: string, attempt: CheckoutAttempt): boolean => {
  const actualGitDir = readWorktreeGitDir(worktreePath);
  if (actualGitDir === null || !hasOwnedWorktreeGitFile(worktreePath, attempt.commonGitDir)) {
    return false;
  }
  return attempt.gitDir
    ? actualGitDir === attempt.gitDir && readCheckoutToken(actualGitDir) === attempt.checkoutToken
    : gitMetadataNamesNewCheckout(actualGitDir, worktreePath, attempt.branch);
};

/** What is on disk at a registered checkout's path and in the Git metadata it points at. */
export type CheckoutObservation = {
  expectedGitDir: string;
  /** Where the registered checkout lives now, when it still exists. */
  movedPath: string | null;
  checkoutExists: boolean;
  dotGitExists: boolean;
  actualGitDir: string | null;
  actualGitDirExists: boolean;
  actualToken: string | null;
};

const observeCheckout = (
  worktreePath: string,
  identity: CheckoutIdentity & { gitDir: string },
): CheckoutObservation => {
  const movedPath = currentCheckoutPath(identity);
  const actualGitDir = readWorktreeGitDir(worktreePath);
  return {
    expectedGitDir: canonicalPath(identity.gitDir),
    movedPath: movedPath && existsSync(movedPath) ? movedPath : null,
    checkoutExists: existsSync(worktreePath),
    dotGitExists: pathEntryExists(join(worktreePath, ".git")),
    actualGitDir,
    actualGitDirExists: actualGitDir !== null && existsSync(actualGitDir),
    actualToken: actualGitDir === null ? null : readCheckoutToken(actualGitDir),
  };
};

/**
 * Decides whether the checkout at `normalizedPath` is still the one `identity` registered, and
 * returns the refusal to report when it is not.
 */
export const checkoutIdentityRefusal = (
  normalizedPath: string,
  identity: CheckoutIdentity,
  seen: CheckoutObservation,
): string | undefined => {
  if (seen.movedPath && seen.movedPath !== normalizedPath) {
    return `Refusing to clean "${normalizedPath}": its registered checkout was moved to "${seen.movedPath}" and still uses this worktree's database and branch. Move it back with \`git worktree move "${seen.movedPath}" "${normalizedPath}"\` and retry.`;
  }
  // Residue of a removal this tool started: allow it only while no checkout metadata reappears.
  if (!seen.checkoutExists || (identity.partialRemoval && !seen.dotGitExists)) {
    return undefined;
  }
  if (seen.actualGitDir !== seen.expectedGitDir) {
    const found = seen.actualGitDir
      ? `gitdir "${seen.actualGitDir}"`
      : "no matching linked-worktree .git file";
    return `Refusing to remove "${normalizedPath}": checkout identity mismatch (expected gitdir "${seen.expectedGitDir}", found ${found}).`;
  }
  // Git may reuse the same `.git/worktrees/<id>` for a new checkout at this path, so a live
  // metadata directory must also carry the token written when this worktree was created.
  if (
    identity.checkoutToken &&
    seen.actualGitDirExists &&
    seen.actualToken !== identity.checkoutToken
  ) {
    return `Refusing to remove "${normalizedPath}": checkout identity mismatch (gitdir "${seen.actualGitDir}" belongs to a different checkout than the one worktree:create registered).`;
  }
  return undefined;
};

/** Throws unless the checkout at `worktreePath` is still the one `identity` registered. */
export const assertCheckoutIdentity = (
  worktreePath: string,
  normalizedPath: string,
  identity: CheckoutIdentity | undefined,
): void => {
  if (!identity?.gitDir) {
    return;
  }
  const refusal = checkoutIdentityRefusal(
    normalizedPath,
    identity,
    observeCheckout(worktreePath, { ...identity, gitDir: identity.gitDir }),
  );
  if (refusal) {
    throw new Error(refusal);
  }
};
