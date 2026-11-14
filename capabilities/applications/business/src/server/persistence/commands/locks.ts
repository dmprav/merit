import { and, eq } from "drizzle-orm";

import { appUsers } from "@merit/auth/schema";
import type { Database } from "@merit/db";
import { memberships, organizations } from "@merit/organizations/schema";
import { organizationScope } from "@merit/organizations/scope";
import { fundingRounds } from "@merit/rounds/schema";

import { applicationCases } from "../schema";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/**
 * Canonical grant-work lock hierarchy:
 * organizations -> funding_rounds -> application_cases -> review_assignments -> memberships / app_users.
 * Every grant-work transaction must acquire locks in this order to avoid deadlocks.
 */
export const lockApplicationCase = async (
  db: Transaction,
  userId: string,
  input: { workspaceSlug: string; publicId: string },
  roundMode: "share" | "update" = "share",
  organizationMode: "share" | "update" = "share",
) => {
  const [workspace] = await db
    .select({ id: organizations.id, kind: organizations.kind })
    .from(organizations)
    .where(eq(organizations.slug, input.workspaceSlug))
    .for(organizationMode);
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

  const [lockedCase] = await db
    .select({ id: applicationCases.id })
    .from(applicationCases)
    .innerJoin(memberships, eq(memberships.organizationId, applicationCases.organizationId))
    .innerJoin(appUsers, eq(appUsers.id, memberships.userId))
    .where(
      and(
        eq(applicationCases.id, input.publicId),
        eq(applicationCases.organizationId, workspace.id),
        organizationScope(userId, "work_on_grants", applicationCases.organizationId),
      ),
    )
    .for("update", { of: applicationCases });

  if (!lockedCase) {
    return null;
  }
  const [actor] = await db
    .select({ userId: appUsers.id, name: appUsers.name, email: memberships.email })
    .from(memberships)
    .innerJoin(appUsers, eq(appUsers.id, memberships.userId))
    .where(
      and(
        eq(memberships.organizationId, workspace.id),
        organizationScope(userId, "work_on_grants", workspace.id),
      ),
    )
    .for("share", { of: [memberships, appUsers] });
  return actor
    ? {
        organizationId: workspace.id,
        organizationKind: workspace.kind,
        roundId: identity.roundId,
        actor,
      }
    : null;
};
