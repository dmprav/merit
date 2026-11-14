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
 * Shared locks allow independent round edits; exclusive locks coordinate creation
 * receipts and contact changes across rounds. Team changes also lock exclusively.
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

  const [actor] = await tx
    .select({ userId: appUsers.id, name: appUsers.name, email: memberships.email })
    .from(memberships)
    .innerJoin(appUsers, eq(appUsers.id, memberships.userId))
    .where(
      and(
        eq(memberships.organizationId, organization.id),
        organizationScope(userId, "work_on_grants", organization.id),
      ),
    )
    .for("share", { of: [memberships, appUsers] });

  return actor ? { organization, actor } : null;
};
