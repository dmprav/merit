import { eq, and, sql } from "drizzle-orm";

import type { Database } from "@merit/db";

import { auditEvents } from "../schema";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Operator-only deletion; the database trigger independently enforces expiry. */
export const removeDemoAudit = (tx: Transaction, organizationId: string) =>
  tx
    .delete(auditEvents)
    .where(
      and(
        eq(auditEvents.organizationId, organizationId),
        sql`exists (select 1 from organizations where id = ${organizationId} and kind = 'demo' and demo_expires_at <= statement_timestamp())`,
      ),
    );
