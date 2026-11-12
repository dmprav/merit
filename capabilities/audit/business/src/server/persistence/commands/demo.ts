import { and, eq, inArray, lte } from "drizzle-orm";

import type { Database } from "@merit/db";
import { organizations } from "@merit/organizations/schema";

import { auditEvents } from "../schema";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Operator cleanup; the caller holds the expired demo's lifecycle lock. */
export const removeDemoAudit = (tx: Transaction, organizationId: string) =>
  tx.delete(auditEvents).where(
    inArray(
      auditEvents.organizationId,
      tx
        .select({ id: organizations.id })
        .from(organizations)
        .where(
          and(
            eq(organizations.id, organizationId),
            eq(organizations.kind, "demo"),
            lte(organizations.demoExpiresAt, new Date()),
          ),
        ),
    ),
  );
