import { existsSync } from "node:fs";

import { currentCheckoutPath } from "./checkout-identity.ts";
import { type ExecGit, repoGit } from "./git.ts";
import { canonicalPath } from "./paths.ts";
import { type WorktreePorts } from "./ports.ts";
import { readWorktreeRegistry, type WorktreeRecord } from "./registry.ts";

export type WorktreeListEntry = {
  slug: string;
  path: string;
  branch: string;
  databaseName: string;
  databaseUrl: string;
  ports: WorktreePorts;
};

/**
 * Follows a checkout moved with `git worktree move` through its token, and never attributes
 * another checkout at the recorded path to this record.
 */
const registeredCheckoutPath = (record: WorktreeRecord): string | null =>
  record.checkoutToken ? currentCheckoutPath(record) : canonicalPath(record.path);

/** Lists the active worktrees whose registered checkout Git still tracks, sorted by slug. */
export const listWorktrees = (
  { primaryRepoRoot }: { primaryRepoRoot: string },
  deps: { execGit: ExecGit },
): WorktreeListEntry[] => {
  const git = repoGit(canonicalPath(primaryRepoRoot), deps.execGit);
  const registry = readWorktreeRegistry(git.root);
  const activeByPath = new Map(git.worktrees().map((entry) => [canonicalPath(entry.path), entry]));

  return Object.values(registry.worktrees)
    .flatMap((record) => {
      if (record.status === "cleaning" || record.status === "creating") {
        return [];
      }
      const checkoutPath = registeredCheckoutPath(record);
      const gitEntry = checkoutPath ? activeByPath.get(checkoutPath) : undefined;
      if (!checkoutPath || !gitEntry || !existsSync(checkoutPath)) {
        return [];
      }
      return [
        {
          slug: record.slug,
          path: checkoutPath,
          branch: gitEntry.branch ?? record.branch,
          databaseName: record.databaseName,
          databaseUrl: record.databaseUrl,
          ports: record.ports,
        },
      ];
    })
    .sort((left, right) => left.slug.localeCompare(right.slug));
};
