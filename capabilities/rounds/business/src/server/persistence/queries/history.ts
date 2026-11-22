import { and, eq, gt, or, sql } from "drizzle-orm";

import { auditPageInput } from "@merit/audit/api";
import { auditEvents } from "@merit/audit/schema";
import { auditBefore, auditOrder, auditPage } from "@merit/audit/scope";
import type { Database } from "@merit/db";

import { roundBudgetChangeSchema } from "../../../domain/encoding";

const roundEvents = (organizationId: string, roundId: string) =>
  and(
    eq(auditEvents.organizationId, organizationId),
    eq(auditEvents.targetType, "round"),
    eq(auditEvents.targetId, roundId),
  );

const budgetEvent = or(
  eq(auditEvents.action, "round.budget_changed"),
  and(
    eq(auditEvents.action, "round.created"),
    sql`${auditEvents.details} #>> '{after,budget,minorUnits}' is not null`,
  ),
);

const budgetChange = sql`jsonb_build_object(
  'before', ${auditEvents.details} #> '{before,budget}',
  'after', ${auditEvents.details} #> '{after,budget}',
  'reason', ${auditEvents.details} ->> 'reason'
)`.mapWith((value: unknown) => roundBudgetChangeSchema.parse(value));

const summary = {
  revision: sql<number>`${auditEvents.targetRevision}`,
  action: auditEvents.action,
  recordedAt: auditEvents.recordedAt,
};

/** Callers authorize the workspace in the same transaction. Deleted rounds retain their history. */
export const readRoundPreparationHistory = (
  db: Database,
  organizationId: string,
  input: { roundId: string; afterRevision?: number; limit: number },
) =>
  db
    .select({
      ...summary,
      budgetChange: sql`case when ${budgetEvent} then ${budgetChange} end`.mapWith(
        (value: unknown) => roundBudgetChangeSchema.nullable().parse(value),
      ),
    })
    .from(auditEvents)
    .where(
      and(
        roundEvents(organizationId, input.roundId),
        input.afterRevision === undefined
          ? undefined
          : gt(auditEvents.targetRevision, input.afterRevision),
      ),
    )
    .orderBy(auditEvents.targetRevision)
    .limit(input.limit + 1);

/** Callers authorize the round in the same transaction. Filter before paging the budget timeline. */
export const readRoundBudgetHistory = async (
  db: Database,
  organizationId: string,
  roundId: string,
  page: { after?: string; limit?: number } = {},
) => {
  const { after, limit } = auditPageInput.parse({ after: page.after, limit: page.limit });
  const rows = await db
    .select({
      ...summary,
      id: auditEvents.id,
      actor: auditEvents.actorName,
      provenance: auditEvents.provenance,
      budgetChange,
    })
    .from(auditEvents)
    .where(and(roundEvents(organizationId, roundId), budgetEvent, auditBefore(after)))
    .orderBy(...auditOrder)
    .limit(limit + 1);
  const { entries, nextCursor } = auditPage(rows, limit);
  return {
    entries: entries.map(({ id: _id, budgetChange, recordedAt, ...entry }) => ({
      ...entry,
      ...budgetChange,
      recordedAt: recordedAt.toISOString(),
    })),
    nextCursor,
  };
};
