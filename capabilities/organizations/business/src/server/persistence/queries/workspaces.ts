import { sql, gt } from "drizzle-orm";

import type { Database } from "@merit/db";

import { authorizedWorkspaces } from "../scope";

export const listWorkspaces = (
  db: Database,
  userId: string,
  slug?: string,
  page?: { after?: string; limit: number },
) => {
  const workspace = authorizedWorkspaces(db, userId, "read_workspace", slug);
  const query = db
    .select({
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      kind: workspace.kind,
      demoExpiresAt: sql<
        string | null
      >`to_char(${workspace.demoExpiresAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`,
      role: workspace.role,
      administration: workspace.administration,
      canViewTeam: workspace.canViewTeam,
      canWorkOnGrants: workspace.canWorkOnGrants,
    })
    .from(workspace)
    .where(page?.after ? gt(workspace.id, page.after) : undefined)
    .orderBy(...(page ? [workspace.id] : [workspace.name, workspace.id]));
  return page ? query.limit(page.limit + 1) : query;
};
