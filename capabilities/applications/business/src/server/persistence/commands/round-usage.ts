import { and, eq } from "drizzle-orm";

import type { Transaction } from "@merit/db";

import { applicationCases } from "../schema";

export const roundHasApplications = async (
  tx: Transaction,
  organizationId: string,
  roundId: string,
) => {
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
