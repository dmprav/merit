import { existsSync, lstatSync, realpathSync } from "node:fs";
import { basename, dirname, join, resolve, sep } from "node:path";

/**
 * Resolves symlinks in `targetPath`, or in its nearest existing ancestor when it does not exist
 * yet, so paths compare equal however they were spelled.
 */
export const canonicalPath = (targetPath: string): string => {
  const resolved = resolve(targetPath);
  if (existsSync(resolved)) {
    try {
      return realpathSync(resolved);
    } catch {
      return resolved;
    }
  }
  const trailingSegments: string[] = [];
  let cursor = resolved;
  while (!existsSync(cursor)) {
    const parent = dirname(cursor);
    if (parent === cursor) {
      return resolved;
    }
    trailingSegments.unshift(basename(cursor));
    cursor = parent;
  }
  try {
    return join(realpathSync(cursor), ...trailingSegments);
  } catch {
    return resolved;
  }
};

export const isInsideDirectory = (targetPath: string, parentDir: string): boolean => {
  const normalizedTarget = canonicalPath(targetPath);
  const normalizedParent = canonicalPath(parentDir);
  const prefix = normalizedParent.endsWith(sep) ? normalizedParent : `${normalizedParent}${sep}`;
  return normalizedTarget.startsWith(prefix);
};

/** Reports whether `directory` is `targetPath` or one of its ancestors. */
export const containsPath = (directory: string, targetPath: string): boolean =>
  canonicalPath(directory) === canonicalPath(targetPath) ||
  isInsideDirectory(targetPath, directory);

export const pathsOverlap = (left: string, right: string): boolean =>
  containsPath(left, right) || isInsideDirectory(left, right);

/** Reports whether anything, including a dangling symlink, exists at `targetPath`. */
export const pathEntryExists = (targetPath: string): boolean => {
  try {
    lstatSync(targetPath);
    return true;
  } catch {
    return false;
  }
};

/** The directory that holds default worktree checkouts and the worktree registry. */
export const managedWorktreesRoot = (primaryRepoRoot: string): string =>
  join(primaryRepoRoot, ".tmp", "worktrees");

export const defaultWorktreePath = (primaryRepoRoot: string, slug: string): string =>
  join(managedWorktreesRoot(primaryRepoRoot), slug);
