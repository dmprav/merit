import { and, eq, desc, sql } from "drizzle-orm";

import { caseChanges } from "@merit/applications/schema";
import { appUsers } from "@merit/auth/schema";
import type { Database } from "@merit/db";
import { roundChanges } from "@merit/rounds/schema";

export const readApplicationHistory = (db: Database, publicId: string) =>
  db
    .select({
      revision: caseChanges.revision,
      action: caseChanges.action,
      reason: caseChanges.reason,
      recordedAt: caseChanges.recordedAt,
      actor: appUsers.name,
      provenance: caseChanges.provenance,
      before: caseChanges.before,
      after: caseChanges.after,
    })
    .from(caseChanges)
    .innerJoin(appUsers, eq(appUsers.id, caseChanges.actorUserId))
    .where(eq(caseChanges.publicId, publicId))
    .orderBy(desc(caseChanges.revision));

export const readRoundHistory = (db: Database, publicId: string) =>
  db
    .select({
      revision: roundChanges.revision,
      action: roundChanges.action,
      reason: roundChanges.reason,
      recordedAt: roundChanges.recordedAt,
      actor: appUsers.name,
      provenance: roundChanges.provenance,
      before: sql<unknown>`${roundChanges.before}->'budget'`,
      after: sql<unknown>`${roundChanges.after}->'budget'`,
    })
    .from(roundChanges)
    .innerJoin(appUsers, eq(appUsers.id, roundChanges.actorUserId))
    .where(and(eq(roundChanges.publicId, publicId), eq(roundChanges.action, "budget")))
    .orderBy(desc(roundChanges.revision));
