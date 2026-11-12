import type { Money } from "@merit/money";
import { assessmentStatus } from "@merit/reviews/domain";
import type { FundingRound, CriteriaVersion } from "@merit/rounds/domain";

import type { ApplicationRecord, FundingRoundOverview } from "../../domain/model";
import { summarizeRound } from "../../domain/summaries";
import { decodeRoundOverview } from "../encoding";
import { reviewAssessments } from "./review-view";

export const applicationView = (
  application: ApplicationRecord,
  criteria?: FundingRound["criteria"],
  criteriaVersion: CriteriaVersion | null = null,
) => ({
  ...application,
  assessments: reviewAssessments(application, criteria, criteriaVersion).map((assessment) => ({
    ...assessment,
    status: assessmentStatus(assessment, application.version),
  })),
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
  totals: { proposed: Money; remaining: Money | null };
};

export const roundView = (round: FundingRoundOverview) => {
  const applications = round.applications.map((application) =>
    applicationView(application, round.criteria, round.criteriaVersion),
  );

  return {
    ...round,
    totals: summarizeRound(round.budget, applications),
    applications,
  };
};

export type RoundView = ReturnType<typeof roundView>;

export const decodeRoundView = (input: unknown): RoundView => roundView(decodeRoundOverview(input));
