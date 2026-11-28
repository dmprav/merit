import { sql } from "drizzle-orm";

import type { ApplicationRecommendationWork } from "@merit/applications/server/grant-work";

import { allocationTotalProblem } from "../../../domain/budget";
import { decodeAllocations } from "../../../domain/encoding";
import { hasRecommendation, readRoundAllocations } from "../projections";

export const applicationRecommendationWork: ApplicationRecommendationWork = {
  hasRecommendation: async ({ tx, caseId }) => {
    const { rows } = await tx.execute<{ recommended: boolean }>(
      sql`select ${hasRecommendation(caseId)} as recommended`,
    );
    return rows[0]?.recommended === true;
  },
  // Reinstatement counts the still-withdrawn case's current allocation again.
  allocationTotalProblem: async ({ tx, organizationId, roundId, caseId }) =>
    allocationTotalProblem(
      decodeAllocations(await readRoundAllocations(tx, organizationId, roundId, caseId)),
    ),
};
