import { decodeMoney } from "@merit/money";

import { compareReviewBasis, type ReviewBasis } from "./basis";
import type { ReviewState } from "./reviews";
import { assessmentStatus } from "./summaries";

/** Follow-ups replace earlier judgments. Requests awaiting a response remain visible. */
export const currentReviewEntries = ({ assessments, requests }: ReviewState) => {
  const superseded = new Set(
    assessments.flatMap((assessment) => (assessment.previousId ? [assessment.previousId] : [])),
  );
  return {
    latest: assessments.filter((assessment) => !superseded.has(assessment.id)),
    pending: requests.filter((request) => request.status === "outstanding"),
  };
};

export const reviewAssessments = (state: ReviewState, current: ReviewBasis) => {
  const { latest, pending } = currentReviewEntries(state);
  return [
    ...latest.flatMap((value) =>
      value.versions.slice(-1).map((version) => {
        const amount = version.content.amount === null ? null : decodeMoney(version.content.amount);

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
    ...pending.map((value) => {
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
  ].map((assessment) => ({
    ...assessment,
    status: assessmentStatus(assessment, current.applicationVersion),
  }));
};

export type ReviewAssessment = ReturnType<typeof reviewAssessments>[number];
