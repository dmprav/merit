import type { IntakeApplication } from "@merit/applications/domain";
import type { summarizeAssessments } from "@merit/reviews/domain";

export const applicationFilters = {
  participation: ["active", "withdrawn"],
  readiness: ["preparing", "ready"],
  reviews: ["awaiting", "unassigned"],
  evidence: ["changed", "unknown"],
  recommendation: ["missing"],
} as const;

/** Each selected criterion must match; an omitted dimension accepts any value. */
export type ApplicationFilter = {
  [Key in keyof typeof applicationFilters]?: (typeof applicationFilters)[Key][number];
};

export type ApplicationFilterFacts = {
  withdrawn: boolean;
  intakeStatus: IntakeApplication["intakeStatus"];
  reviews: ReturnType<typeof summarizeAssessments>;
  criteriaChanged: boolean;
  recommendation: { outdated: boolean } | null;
};

const matchesReviews = (
  reviews: ApplicationFilterFacts["reviews"],
  value: ApplicationFilter["reviews"],
) => {
  if (!value) {
    return true;
  }
  return value === "awaiting"
    ? reviews.outstanding > 0
    : reviews.current + reviews.outdated + reviews.outstanding + reviews.unknown === 0;
};

const matchesEvidence = (facts: ApplicationFilterFacts, value: ApplicationFilter["evidence"]) => {
  if (!value) {
    return true;
  }
  return value === "changed"
    ? facts.reviews.outdated > 0 || facts.criteriaChanged || Boolean(facts.recommendation?.outdated)
    : facts.reviews.unknown > 0;
};

export const matchesApplicationCriteria = (
  facts: ApplicationFilterFacts,
  filter: ApplicationFilter,
) =>
  (!filter.participation || facts.withdrawn === (filter.participation === "withdrawn")) &&
  (!filter.readiness ||
    facts.intakeStatus === (filter.readiness === "ready" ? "ready" : "in_preparation")) &&
  matchesReviews(facts.reviews, filter.reviews) &&
  matchesEvidence(facts, filter.evidence) &&
  (!filter.recommendation || facts.recommendation === null);
