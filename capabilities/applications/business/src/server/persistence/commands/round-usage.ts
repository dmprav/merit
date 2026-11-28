import { and, eq } from "drizzle-orm";

import type { RoundApplications } from "@merit/rounds/server/grant-work";

import { applicationCases } from "../schema";

export const roundHasApplications: RoundApplications = async ({ tx, organizationId, roundId }) => {
  const rows = await tx
    .select({ publicId: applicationCases.id })
    .from(applicationCases)
    .where(
      and(
        eq(applicationCases.organizationId, organizationId),
        eq(applicationCases.roundId, roundId),
      ),
    )
    .limit(1);
  return rows.length > 0;
};
