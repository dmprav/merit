import { and, eq, sql } from "drizzle-orm";

import { applicationCases } from "@merit/applications/schema";
import type { ApplicationWork } from "@merit/applications/server/grant-work";
import { recommendationVersions } from "@merit/recommendations/schema";
import { reviewRequests, assessments } from "@merit/reviews/schema";

export const applicationWork: ApplicationWork = {
  usage: async (tx, organizationId, caseId) => {
    const [row] = await tx
      .select({
        hasReviews: sql<boolean>`exists(select 1 from ${reviewRequests} where ${reviewRequests.caseId} = ${caseId}) or exists(select 1 from ${assessments} where ${assessments.caseId} = ${caseId})`,
        hasRecommendation: sql<boolean>`exists(select 1 from ${recommendationVersions} where ${recommendationVersions.caseId} = ${caseId})`,
      })
      .from(applicationCases)
      .where(
        and(eq(applicationCases.organizationId, organizationId), eq(applicationCases.id, caseId)),
      );
    if (!row) {
      throw new Error("Application lock must remain held while checking usage");
    }
    return row;
  },
};
