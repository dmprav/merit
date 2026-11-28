import { and, eq, sql } from "drizzle-orm";

import type { LockedApplicationCase } from "@merit/applications/locks";
import { applicationCases } from "@merit/applications/schema";
import { fundingRounds } from "@merit/rounds/schema";

import { reviewStatuses } from "../overview";

export const isCurrentAssessment = async (
  { tx, caseId }: LockedApplicationCase,
  expected: { id: string; version: number },
) => {
  const [match] = await tx
    .select({ id: applicationCases.id })
    .from(applicationCases)
    .innerJoin(fundingRounds, eq(fundingRounds.id, applicationCases.roundId))
    .where(
      and(
        eq(applicationCases.id, caseId),
        sql`exists (select 1 from ${reviewStatuses(
          applicationCases.id,
          applicationCases.materialVersion,
          fundingRounds.id,
          fundingRounds.criteriaVersion,
        )} where statuses.id = ${expected.id} and statuses.assessment_version = ${expected.version} and statuses.status = 'current')`,
      ),
    );
  return match !== undefined;
};
