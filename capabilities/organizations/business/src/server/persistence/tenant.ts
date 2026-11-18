import { sql } from "drizzle-orm";
import { PgTransaction } from "drizzle-orm/pg-core";

import { readTransaction, type Database } from "@merit/db";

import type { Transaction } from "./transaction";

export type MemberScope =
  | { kind: "workspace"; userId: string; slug: string }
  | { kind: "discovery"; userId: string }
  | { kind: "assignment"; userId: string; assignmentId: string };

type TenantScope =
  | MemberScope
  | { kind: "provision"; organizationId: string }
  | { kind: "organization_directory" }
  | { kind: "invitation"; tokenHash: string }
  | { kind: "demo"; userId: string; newId?: string };

type Operation<T> = (tx: Transaction) => Promise<T>;

// SET LOCAL expires on commit and rollback. Releasing a savepoint retains settings,
// so a nested operation also restores the scope of the transaction it borrowed.
const bindScope =
  <T>(db: Database, scope: TenantScope, operation: Operation<T>) =>
  async (tx: Transaction) => {
    const nested = db instanceof PgTransaction;
    const previous = nested
      ? (
          await tx.execute<{ value: string | null }>(
            sql`select current_setting('merit.scope', true) as value`,
          )
        ).rows[0]?.value
      : undefined;
    if (previous) {
      const parent = JSON.parse(previous) as TenantScope;
      if (parent.kind === "workspace") {
        if (
          scope.kind !== "workspace" ||
          parent.userId !== scope.userId ||
          parent.slug !== scope.slug
        ) {
          throw new Error("A workspace transaction cannot change its actor or workspace.");
        }
        return operation(tx);
      }
    }
    await tx.execute(sql`select set_config('merit.scope', ${JSON.stringify(scope)}, true)`);
    const result = await operation(tx);
    if (nested) {
      await tx.execute(sql`select set_config('merit.scope', ${previous ?? ""}, true)`);
    }
    return result;
  };

export const readScoped = <T>(db: Database, scope: TenantScope, operation: Operation<T>) =>
  readTransaction(db, bindScope(db, scope, operation));

export const writeScoped = <T>(db: Database, scope: TenantScope, operation: Operation<T>) =>
  db.transaction(bindScope(db, scope, operation));

export const readWorkspace = <T>(
  db: Database,
  userId: string,
  slug: string,
  operation: Operation<T>,
) => readScoped(db, { kind: "workspace", userId, slug }, operation);

export const writeWorkspace = <T>(
  db: Database,
  userId: string,
  slug: string,
  operation: Operation<T>,
) => writeScoped(db, { kind: "workspace", userId, slug }, operation);
