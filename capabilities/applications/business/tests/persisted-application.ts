import { and, desc, eq } from "drizzle-orm";

import { auditEvents } from "@merit/audit/schema";
import type { Database } from "@merit/db";
import { workspaceSlug } from "@merit/organizations/testing/workspace";

import { findIntakeApplication } from "../src/server/persistence/commands/intake";

export const readPersistedApplication = (db: Database, id: string) =>
  db.transaction(async (tx) => {
    const state = await findIntakeApplication(tx, workspaceSlug, id);
    if (!state) {
      return undefined;
    }
    const history = await tx
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.targetType, "application"), eq(auditEvents.targetId, id)))
      .orderBy(desc(auditEvents.targetRevision));
    return { ...state, history };
  });
