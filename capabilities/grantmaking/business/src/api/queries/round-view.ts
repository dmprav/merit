import type { Money } from "@merit/money";
import { reviewAssessments } from "@merit/reviews/domain";
import type { FundingRound, CriteriaVersion } from "@merit/rounds/domain";

import { decodeRoundOverview } from "../../domain/encoding";
import type { ApplicationRecord, FundingRoundOverview } from "../../domain/model";
import { summarizeRound } from "../../domain/summaries";

export const applicationView = (
  application: ApplicationRecord,
  criteria?: FundingRound["criteria"],
  criteriaVersion: CriteriaVersion | null = null,
) => ({
  ...application,
  assessments: reviewAssessments(application.reviews, {
    applicationVersion: application.version,
    criteria: criteria ?? null,
    criteriaVersion,
  }),
});

export type ApplicationView = ReturnType<typeof applicationView>;

export type ApplicationRoundContext = Pick<
  FundingRound,
  | "id"
  | "title"
  | "foundation"
  | "manager"
  | "budget"
  | "criteria"
  | "criteriaVersion"
  | "criteriaHistory"
> & {
  totals: {
    proposed: Money;
    remaining: Money | null;
    withdrawnApplications: number;
    committed: Money;
    available: Money | null;
  };
};

export const roundView = (round: FundingRoundOverview, committed?: Money) => {
  const applications = round.applications.map((application) =>
    applicationView(application, round.criteria, round.criteriaVersion),
  );

  return {
    ...round,
    applicationCount: applications.length,
    criteriaImpact: {
      assessments: applications.reduce(
        (count, application) =>
          count +
          application.assessments.filter((review) => review.submission && !review.criteriaUnknown)
            .length,
        0,
      ),
      requests: applications.reduce(
        (count, application) =>
          count +
          application.assessments.filter((review) => !review.submission && !review.criteriaUnknown)
            .length,
        0,
      ),
    },
    totals: summarizeRound(round.budget, applications, committed),
    applications,
  };
};

export type RoundView = ReturnType<typeof roundView>;

export const decodeRoundView = (input: unknown): RoundView => roundView(decodeRoundOverview(input));
