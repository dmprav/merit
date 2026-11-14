import { and, eq, sql, gt } from "drizzle-orm";

import { appUsers } from "@merit/auth/schema";
import type { Database } from "@merit/db";

import { memberships, organizations } from "../membership-schema";
import { membershipScope, organizationScope } from "../scope";

export const listWorkspaces = (
  db: Database,
  userId: string,
  slug?: string,
  page?: { after?: string; limit: number },
) => {
  const query = db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      kind: organizations.kind,
      demoExpiresAt: sql<
        string | null
      >`to_char(${organizations.demoExpiresAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`,
      role: memberships.role,
      administration: memberships.administration,
      canViewTeam: membershipScope("read_team", organizations.id),
      canWorkOnGrants: membershipScope("work_on_grants", organizations.id),
    })
    .from(organizations)
    .innerJoin(memberships, eq(memberships.organizationId, organizations.id))
    .innerJoin(appUsers, eq(appUsers.id, memberships.userId))
    .where(
      and(
        organizationScope(userId, "read_workspace", organizations.id),
        slug === undefined ? undefined : eq(organizations.slug, slug),
        page?.after ? gt(organizations.id, page.after) : undefined,
      ),
    )
    .orderBy(...(page ? [organizations.id] : [organizations.name, organizations.id]));
  return page ? query.limit(page.limit + 1) : query;
};
