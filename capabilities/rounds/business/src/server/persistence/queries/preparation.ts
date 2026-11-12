import { and, eq } from "drizzle-orm";

import { appUsers } from "@merit/auth/schema";
import type { Database } from "@merit/db";
import { memberships } from "@merit/organizations/schema";
import { membershipScope } from "@merit/organizations/scope";

export const readManagerCandidates = (db: Database, organizationId: string) =>
  db
    .select({ userId: appUsers.id, name: appUsers.name, email: memberships.email })
    .from(memberships)
    .innerJoin(appUsers, eq(appUsers.id, memberships.userId))
    .where(
      and(
        eq(memberships.organizationId, organizationId),
        membershipScope("work_on_grants", organizationId),
      ),
    )
    .orderBy(appUsers.name, memberships.email, appUsers.id);
