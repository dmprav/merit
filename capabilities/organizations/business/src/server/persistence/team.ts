import { and, eq, isNull, sql } from "drizzle-orm";

import { appUsers } from "@merit/auth/schema";

import { memberships } from "./membership-schema";
import { invitations } from "./schema";
import { organizationScope } from "./scope";
import type { Transaction } from "./transaction";

export const subjectQuery = (tx: Transaction, organizationId: string, actor: string) => {
  return tx
    .select({
      userId: appUsers.id,
      organizationId: memberships.organizationId,
      active: appUsers.active,
      administration: memberships.administration,
      role: memberships.role,
    })
    .from(memberships)
    .innerJoin(appUsers, eq(appUsers.id, memberships.userId))
    .where(
      and(
        eq(memberships.organizationId, organizationId),
        organizationScope(actor, "read_workspace", organizationId),
      ),
    );
};

export const pending = (organizationId: string) =>
  and(
    eq(invitations.organizationId, organizationId),
    isNull(invitations.revokedAt),
    isNull(invitations.acceptedAt),
  );

export const missingTeamWorkspace = async (tx: Transaction) => {
  const result = await tx.execute<{ present: boolean }>(
    sql`select merit_team_workspace_exists() as present`,
  );
  return result.rows[0]?.present ? "forbidden" : "not_found";
};
