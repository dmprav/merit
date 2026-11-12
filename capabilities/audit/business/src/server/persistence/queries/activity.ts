import { and, desc, eq, inArray, or, sql, type SQL } from "drizzle-orm";

import { appUsers } from "@merit/auth/schema";
import type { Database } from "@merit/db";
import { memberships, organizations } from "@merit/organizations/schema";
import { organizationScope } from "@merit/organizations/scope";

import type { ActivityCursor, ActivityInput } from "../../../domain/activity";
import { auditEvents } from "../schema";

/** Resolves the workspace for a member and whether they currently work on grants. */
export const readActivityAccess = async (db: Database, userId: string, workspaceSlug: string) => {
  const [row] = await db
    .select({
      organizationId: organizations.id,
      allowed: sql<boolean>`${organizationScope(userId, "work_on_grants", organizations.id)}`,
    })
    .from(organizations)
    .innerJoin(memberships, eq(memberships.organizationId, organizations.id))
    .innerJoin(appUsers, eq(appUsers.id, memberships.userId))
    .where(
      and(
        eq(organizations.slug, workspaceSlug),
        organizationScope(userId, "read_workspace", organizations.id),
      ),
    );
  return row;
};

const targetFilter = (targets: NonNullable<ActivityInput["targets"]>): SQL => {
  const groups = targets
    .filter((target) => target.ids.length > 0)
    .map((target) =>
      and(eq(auditEvents.targetType, target.type), inArray(auditEvents.targetId, target.ids)),
    );
  return or(...groups) ?? sql`false`;
};

export const readActivityEvents = (
  db: Database,
  organizationId: string,
  filter: {
    actorUserId?: string;
    targets?: ActivityInput["targets"];
    after?: ActivityCursor | null;
    limit: number;
  },
) =>
  db
    .select({
      id: auditEvents.id,
      actorUserId: auditEvents.actorUserId,
      actorName: auditEvents.actorName,
      provenance: auditEvents.provenance,
      action: auditEvents.action,
      targetType: auditEvents.targetType,
      targetId: auditEvents.targetId,
      targetRevision: auditEvents.targetRevision,
      recordedAt: auditEvents.recordedAt,
    })
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.organizationId, organizationId),
        filter.actorUserId ? eq(auditEvents.actorUserId, filter.actorUserId) : undefined,
        filter.targets ? targetFilter(filter.targets) : undefined,
        filter.after
          ? sql`(${auditEvents.recordedAt}, ${auditEvents.id}) < (${filter.after.recordedAt.toISOString()}::timestamptz, ${filter.after.id}::uuid)`
          : undefined,
      ),
    )
    .orderBy(desc(auditEvents.recordedAt), desc(auditEvents.id))
    .limit(filter.limit + 1);

/** Everyone with recorded activity, named as they were most recently recorded. */
export const readActivityPeople = (db: Database, organizationId: string) =>
  db
    .select({
      userId: auditEvents.actorUserId,
      name: sql<
        string | null
      >`(array_agg(${auditEvents.actorName} order by ${auditEvents.actorName} is null, ${auditEvents.recordedAt} desc, ${auditEvents.id} desc))[1]`,
    })
    .from(auditEvents)
    .where(eq(auditEvents.organizationId, organizationId))
    .groupBy(auditEvents.actorUserId);
