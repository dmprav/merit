import { holdsCheckoutToken } from "./checkout-identity.ts";
import { readConfiguredPorts } from "./env-file.ts";
import { canonicalPath } from "./paths.ts";
import { DEFAULT_PORTS } from "./ports.ts";
import { type WorktreeRecord, type WorktreeRegistry } from "./registry.ts";

/** Reports whether a registered worktree may still be serving on its recorded ports. */
const mayUseRecordedPorts = (
  record: WorktreeRecord,
  activeWorktreePaths: ReadonlySet<string> | undefined,
): boolean =>
  !activeWorktreePaths ||
  record.status === "cleaning" ||
  record.status === "creating" ||
  activeWorktreePaths.has(canonicalPath(record.path)) ||
  // A checkout moved with `git worktree move` keeps its Git metadata and token, and its
  // `.env.local` still uses the recorded ports.
  holdsCheckoutToken(record);

export const collectReservedPorts = (
  registry: WorktreeRegistry,
  activeWorktreePaths?: ReadonlySet<string>,
): Set<number> => {
  const reserved = new Set<number>(Object.values(DEFAULT_PORTS));
  for (const record of Object.values(registry.worktrees)) {
    if (mayUseRecordedPorts(record, activeWorktreePaths)) {
      for (const port of Object.values(record.ports)) {
        reserved.add(port);
      }
    }
  }
  return reserved;
};

/**
 * Collects every port a new worktree must avoid: the defaults, those recorded for registered
 * worktrees, and those the primary and linked checkouts' `.env.local` files set now. Idle
 * checkouts, including moved ones, start servers on those files' ports, which can differ from
 * the ports recorded for them.
 */
export const portsInUse = (
  primaryRepoRoot: string,
  registry: WorktreeRegistry,
  activeWorktreePaths: ReadonlySet<string>,
): Set<number> => {
  const reserved = collectReservedPorts(registry, activeWorktreePaths);
  for (const checkoutPath of new Set([primaryRepoRoot, ...activeWorktreePaths])) {
    for (const port of readConfiguredPorts(checkoutPath)) {
      reserved.add(port);
    }
  }
  return reserved;
};
