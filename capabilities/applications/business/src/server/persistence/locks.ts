import { and, eq } from "drizzle-orm";

import { appUsers } from "@merit/auth/schema";
import type { Database } from "@merit/db";
import { memberships, organizations } from "@merit/organizations/schema";
import { organizationScope } from "@merit/organizations/scope";
import { fundingRounds } from "@merit/rounds/schema";

import { applicationCases } from "./schema";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

// Lock lifecycle, round coordination, case, and current membership in that order.
export const lockApplicationCase = async (
  db: Transaction,
  userId: string,
  input: { workspaceSlug: string; publicId: string },
  roundMode: "share" | "update" = "share",
) => {
  const [workspace] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, input.workspaceSlug))
    .for("share");
  if (!workspace) {
    return null;
  }
  const [identity] = await db
    .select({ roundId: applicationCases.roundId })
    .from(applicationCases)
    .where(
      and(
        eq(applicationCases.id, input.publicId),
        eq(applicationCases.organizationId, workspace.id),
      ),
    );
  if (!identity) {
    return null;
  }
  if (identity.roundId !== null) {
    await db
      .select({ id: fundingRounds.id })
      .from(fundingRounds)
      .where(
        and(eq(fundingRounds.organizationId, workspace.id), eq(fundingRounds.id, identity.roundId)),
      )
      .for(roundMode);
  }

  const authorized = () =>
    db
      .select({ userId: appUsers.id, name: appUsers.name, email: memberships.email })
      .from(applicationCases)
      .innerJoin(memberships, eq(memberships.organizationId, applicationCases.organizationId))
      .innerJoin(appUsers, eq(appUsers.id, memberships.userId))
      .where(
        and(
          eq(applicationCases.id, input.publicId),
          eq(applicationCases.organizationId, workspace.id),
          organizationScope(userId, "work_on_grants", applicationCases.organizationId),
        ),
      );

  if (!(await authorized().for("update", { of: applicationCases }))[0]) {
    return null;
  }
  const [actor] = await authorized().for("share", { of: [memberships, appUsers] });
  return actor ? { organizationId: workspace.id, roundId: identity.roundId, actor } : null;
};
