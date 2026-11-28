import { currentCheckoutPath, readWorktreeGitDir } from "./checkout-identity.ts";
import { resolvePrimaryRepoRoot } from "./git.ts";
import { canonicalPath } from "./paths.ts";
import {
  readWorktreeRegistry,
  withWorktreeRegistryLock,
  writeWorktreeRegistry,
} from "./registry.ts";

/** Coordinates a registered checkout's database replacement with create and clean. */
export const resetWorktreeDatabase = async (
  checkoutPath: string,
  databaseName: string,
  recreate: () => Promise<void>,
): Promise<void> => {
  const path = canonicalPath(checkoutPath);
  const gitDir = readWorktreeGitDir(path);
  const root = resolvePrimaryRepoRoot(path);
  const records = Object.values(readWorktreeRegistry(root).worktrees);
  const registered = records.find(
    (record) => canonicalPath(record.path) === path || record.gitDir === gitDir,
  );
  if (!registered) {
    return recreate();
  }

  await withWorktreeRegistryLock(root, async () => {
    const registry = readWorktreeRegistry(root);
    const record = registry.worktrees[registered.slug];
    if (
      !record ||
      record.status !== "active" ||
      record.databaseName !== databaseName ||
      record.checkoutToken !== registered.checkoutToken ||
      currentCheckoutPath(record) !== path ||
      readWorktreeGitDir(path) !== record.gitDir
    ) {
      throw new Error(
        `Refusing to reset "${databaseName}": this checkout no longer matches an active registration for that database.`,
      );
    }

    // A failed or interrupted recreation can leave either the old database or no database.
    if (record.databaseCreated) {
      record.databaseCreated = false;
      writeWorktreeRegistry(root, registry);
    }
    await recreate();
    record.databaseCreated = true;
    writeWorktreeRegistry(root, registry);
  });
};
