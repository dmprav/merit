import { appUsers } from "@merit/auth/schema";
import type { Database } from "@merit/db";

import { memberships, organizations } from "../src/server/persistence/membership-schema";

export const seedWorkspace = async (
  db: Database,
  input: {
    organization: typeof organizations.$inferInsert;
    user: typeof appUsers.$inferInsert;
    membership: Pick<typeof memberships.$inferInsert, "role" | "administration">;
  },
) => {
  await db.transaction(async (tx) => {
    await tx.insert(organizations).values(input.organization);
    await tx.insert(appUsers).values(input.user);
    await tx.insert(memberships).values({
      organizationId: input.organization.id,
      userId: input.user.id,
      ...input.membership,
    });
  });
};
