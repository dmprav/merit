import { and, eq, sql } from "drizzle-orm";

import { applicationCases } from "@merit/applications/schema";
import { activeCase } from "@merit/applications/scope";
import type { ApplicationWork } from "@merit/applications/server/grant-work";
import { recommendationVersions } from "@merit/recommendations/schema";
import { reviewRequests, assessments } from "@merit/reviews/schema";
import { closeReviewsForWithdrawal } from "@merit/reviews/server/integrations";

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
  allocationTotalProblem: async (tx, { organizationId, roundId, caseId }) => {
    // Matches the money limit `sum` enforces when totals are read.
    const result = await tx.execute<{ too_large: boolean }>(sql`
      select coalesce(sum((r.content->'allocation'->>'minorUnits')::numeric), 0) > 999999999999999999999999999999 as too_large
      from ${applicationCases} a
      join ${recommendationVersions} r on r.case_id = a.id
        and r.revision = (select max(v.revision) from ${recommendationVersions} v where v.case_id = a.id)
      where a.organization_id = ${organizationId} and a.round_id = ${roundId}
        and (${activeCase("a")} or a.id = ${caseId})`);
    return result.rows[0]?.too_large ? "allocation_total_too_large" : null;
  },
  closeReviewsForWithdrawal: (tx, { caseId, actor, name }) =>
    closeReviewsForWithdrawal(tx, caseId, actor, name),
};
