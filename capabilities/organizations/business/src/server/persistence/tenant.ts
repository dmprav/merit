import { sql } from "drizzle-orm";
import { PgTransaction } from "drizzle-orm/pg-core";
import { z } from "zod";

import { readTransaction, type Database, type Transaction } from "@merit/db";

const memberScopeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("workspace"), userId: z.string(), slug: z.string() }),
  z.object({ kind: z.literal("discovery"), userId: z.string() }),
  z.object({ kind: z.literal("assignment"), userId: z.string(), assignmentId: z.string() }),
]);

const tenantScopeSchema = z.discriminatedUnion("kind", [
  ...memberScopeSchema.options,
  z.object({ kind: z.literal("provision"), organizationId: z.string() }),
  z.object({ kind: z.literal("organization_directory") }),
  z.object({ kind: z.literal("invitation"), tokenHash: z.string() }),
  z.object({ kind: z.literal("demo"), userId: z.string(), newId: z.string().optional() }),
]);

export type MemberScope = z.infer<typeof memberScopeSchema>;

type TenantScope = z.infer<typeof tenantScopeSchema>;

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
      const parent = tenantScopeSchema.parse(JSON.parse(previous));
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
