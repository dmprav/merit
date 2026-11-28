import { isProcessAlive } from "../file-lock.ts";
import { canonicalPath } from "./paths.ts";
import { type WorktreeRecord } from "./registry.ts";

/**
 * Rules for the `creating` and `cleaning` claims a create or clean operation holds on a registry
 * record, so concurrent operations on one slug never act on each other's checkout or database.
 */

export const isClaimOwnerAlive = (record: WorktreeRecord): boolean =>
  record.ownerPid !== undefined && isProcessAlive(record.ownerPid);

/** Releases the owning process recorded with a claim. */
export const withoutOwner = (record: WorktreeRecord): WorktreeRecord => {
  const { ownerPid: _releasedOwner, ...rest } = record;
  return rest;
};

/** Releases a clean claim, leaving the record for a retried clean. */
export const withoutCleanClaim = (record: WorktreeRecord): WorktreeRecord => {
  const { cleanToken: _cleared, ...rest } = withoutOwner(record);
  return rest;
};

/** Matches the creating record reserved by this attempt, even if Git moved its checkout. */
export const matchesCreateClaim =
  (checkoutToken: string) =>
  (record: WorktreeRecord): boolean =>
    record.status === "creating" && record.checkoutToken === checkoutToken;

/** Returns why a create may not take `slug` while `existing` is registered under it. */
export const createRefusal = (
  slug: string,
  existing: WorktreeRecord | undefined,
  ownerAlive: boolean,
): string | undefined => {
  if (!existing) {
    return undefined;
  }
  if (existing.status === "cleaning") {
    return `Worktree "${slug}" is currently being cleaned. Wait for cleanup to finish or re-run \`vp run worktree:clean ${slug}\`.`;
  }
  if (existing.status === "creating") {
    return ownerAlive
      ? `Worktree "${slug}" is currently being created at ${existing.path} by process ${existing.ownerPid}. Wait for creation to finish.`
      : `Creating worktree "${slug}" at ${existing.path} was interrupted. Run \`vp run worktree:clean ${slug}\` to remove its partial state first.`;
  }
  return `Worktree "${slug}" already exists at ${existing.path}. Run \`vp run worktree:clean ${slug}\` first.`;
};

/**
 * Returns why a clean may not claim `record` now. A claim whose owner process has exited (for
 * example, a killed create or clean) no longer blocks cleanup.
 */
export const cleanRefusal = (
  slug: string,
  record: WorktreeRecord | undefined,
  ownerAlive: boolean,
): string | undefined => {
  if (record?.status === "creating" && ownerAlive) {
    return `Worktree "${slug}" is currently being created by process ${record.ownerPid}. Wait for creation to finish before cleaning.`;
  }
  if (record?.status === "cleaning" && record.cleanToken && ownerAlive) {
    return `Worktree "${slug}" is already being cleaned by another operation (process ${record.ownerPid}). Wait for it to finish.`;
  }
  return undefined;
};

export type CleanClaim = {
  /** Whether the clean wrote its claim into a registry record; an unrecorded slug has none. */
  claimed: boolean;
  cleanToken: string;
  normalizedPath: string;
  databaseName: string;
  databaseCreated: boolean;
};

/**
 * Reports whether the registry still shows this clean's claim: the claimed record unchanged, or
 * for an unrecorded slug, still no record that a concurrent create may have added.
 */
export const matchesCleanClaim = (
  current: WorktreeRecord | undefined,
  claim: CleanClaim,
): boolean => {
  if (!claim.claimed) {
    return current === undefined;
  }
  return (
    current !== undefined &&
    current.status === "cleaning" &&
    current.cleanToken === claim.cleanToken &&
    canonicalPath(current.path) === claim.normalizedPath &&
    current.databaseName === claim.databaseName &&
    current.databaseCreated === claim.databaseCreated
  );
};
