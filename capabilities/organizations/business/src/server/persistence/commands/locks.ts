import { and, eq } from "drizzle-orm";

import { appUsers } from "@merit/auth/schema";

import { organizations, memberships } from "../membership-schema";
import { organizationScope } from "../scope";
import type { Transaction } from "../transaction";

/**
 * Canonical grant-work lock hierarchy:
 * organizations -> funding_rounds -> application_cases -> review_assignments -> memberships / app_users.
 *
 * Lock the organization before grant resources and hold current access through commit.
 * Shared locks allow independent round edits; exclusive locks coordinate round creation
 * receipts, contact creation and archival or restoration across rounds. Team changes also lock exclusively.
 */
export const lockGrantWorkspace = async (
  tx: Transaction,
  userId: string,
  slug: string,
  mode: "share" | "update",
) => {
  const [organization] = await tx
    .select()
    .from(organizations)
    .where(eq(organizations.slug, slug))
    .for(mode);
  if (!organization) {
    return null;
  }

  const actor = await lockGrantActor(tx, userId, organization.id);

  return actor ? { organization, actor } : null;
};

/** Acquired after resource locks, holding the actor's authority through commit. */
export const lockGrantActor = async (tx: Transaction, userId: string, organizationId: string) => {
  const [actor] = await tx
    .select({ userId: appUsers.id, name: appUsers.name, email: memberships.email })
    .from(memberships)
    .innerJoin(appUsers, eq(appUsers.id, memberships.userId))
    .where(
      and(
        eq(memberships.organizationId, organizationId),
        organizationScope(userId, "work_on_grants", organizationId),
      ),
    )
    .for("share", { of: [memberships, appUsers] });
  return actor;
};
