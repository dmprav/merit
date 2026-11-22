import { PgTransaction } from "drizzle-orm/pg-core";

import { actorProvenance, type Actor } from "@merit/auth";
import type { Database, Transaction } from "@merit/db";

import type { WorkspaceChange, WorkspaceChangeObserver } from "../../domain";
import { readScoped as readTenant, writeScoped as writeTenant, type MemberScope } from "./tenant";

export { readWorkspace, writeWorkspace } from "./tenant";

// Other capabilities can open member operations. Onboarding scopes belong to Organizations.
type MemberTransaction = <T>(
  db: Database,
  scope: MemberScope,
  operation: (tx: Transaction) => Promise<T>,
) => Promise<T>;

export const readScoped: MemberTransaction = readTenant;
export const writeScoped: MemberTransaction = writeTenant;

export const assignmentScope = (userId: string, assignmentId: string, slug?: string): MemberScope =>
  slug === undefined
    ? { kind: "assignment", userId, assignmentId }
    : { kind: "workspace", userId, slug };

/** Notify only after a command that marked a new write commits. A borrowed transaction
 * can still roll back after its savepoint is released, so it cannot publish outcomes. */
export const writeObservedWorkspace = async <T>(
  db: Database,
  actor: Actor,
  address: { workspaceSlug: string } | { assignmentId: string; workspaceSlug?: string },
  onCommitted: WorkspaceChangeObserver | undefined,
  operation: (
    tx: Transaction,
    changed: (id: string, kind: WorkspaceChange["workspaceKind"]) => void,
  ) => Promise<T>,
) => {
  const scope: MemberScope =
    "assignmentId" in address
      ? assignmentScope(actor.userId, address.assignmentId, address.workspaceSlug)
      : { kind: "workspace", userId: actor.userId, slug: address.workspaceSlug };
  let change: WorkspaceChange | undefined;
  const result = await writeTenant(db, scope, (tx) =>
    operation(tx, (workspaceId, workspaceKind) => {
      change = { workspaceId, workspaceKind, surface: actorProvenance(actor).interface };
    }),
  );
  if (change && onCommitted && !(db instanceof PgTransaction)) {
    try {
      onCommitted(change);
    } catch {
      // A measurement failure cannot undo the committed workspace change.
    }
  }
  return result;
};
