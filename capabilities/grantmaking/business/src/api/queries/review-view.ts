import { decodeMoney } from "@merit/money";
import { compareReviewBasis } from "@merit/reviews/domain";
import type { FundingRound, CriteriaVersion } from "@merit/rounds/domain";

import type { ApplicationRecord } from "../../domain/model";

export const reviewAssessments = (
  application: ApplicationRecord,
  criteria?: FundingRound["criteria"],
  criteriaVersion: CriteriaVersion | null = null,
) => {
  const current = {
    applicationVersion: application.version,
    criteriaVersion,
    criteria: criteria ?? null,
  };
  const { requests, assessments } = application.reviews;
  const superseded = new Set(
    assessments.flatMap((value) => (value.previousId ? [value.previousId] : [])),
  );

  return [
    ...assessments
      .filter((value) => !superseded.has(value.id))
      .flatMap((value) =>
        value.versions.slice(-1).map((version) => {
          const amount =
            version.content.amount === null ? null : decodeMoney(version.content.amount);

          const basisComparison = compareReviewBasis(
            { ...version.content, criteria: version.criteria },
            current,
          );
          return {
            basisComparison,
            id: value.id,
            contactId: value.contactId,
            reviewer: value.reviewer,
            criteriaChanged: basisComparison.criteriaContent === "different",
            criteriaUnknown: basisComparison.criteriaContent === "unknown",
            submission: {
              applicationVersion: version.content.applicationVersion,
              date: version.content.date,
              reasoning: version.content.reasoning,
              recommendation: {
                position: version.content.position,
                allocation: amount,
              },
            },
          };
        }),
      ),
    ...requests
      .filter((value) => value.status === "outstanding")
      .map((value) => {
        const basisComparison = compareReviewBasis(value, current);
        return {
          basisComparison,
          id: value.id,
          requestId: value.id,
          contactId: value.contactId,
          reviewer: value.reviewer,
          criteriaChanged: basisComparison.criteriaContent === "different",
          criteriaUnknown: basisComparison.criteriaContent === "unknown",
          submission: null,
        };
      }),
  ];
};
