import { isWithdrawn } from "@merit/applications/domain";
import type { ApplicationOverview, RoundView } from "@merit/grantmaking/api";

import { applicationFilters, type ApplicationFilter } from "../../contracts/pages";

export { applicationFilters, type ApplicationFilter };

type RoundApplication = RoundView["applications"][number];

type Application = RoundApplication | ApplicationOverview;

type WorkFilter = Exclude<ApplicationFilter, "all" | "withdrawn">;

const matchesRoundApplicationFilter = (application: RoundApplication, filter: WorkFilter) => {
  switch (filter) {
    case "preparing":
      return application.intakeStatus === "in_preparation";
    case "awaiting":
      return application.assessments.some((review) => review.status === "outstanding");
    case "unassigned":
      return application.assessments.length === 0;
    case "changed":
      return (
        application.assessments.some(
          (review) => review.status === "outdated" || review.criteriaChanged,
        ) ||
        Boolean(
          application.managerRecommendation?.recorded &&
          application.managerRecommendation.recorded.applicationVersion !== application.version,
        )
      );
    case "unknown":
      return application.assessments.some((review) => review.status === "unknown");
    case "unwritten":
      return application.managerRecommendation === null;
  }
};

const matchesOverviewApplicationFilter = (application: ApplicationOverview, filter: WorkFilter) => {
  switch (filter) {
    case "preparing":
      return application.intakeStatus === "in_preparation";
    case "awaiting":
      return application.reviews.outstanding > 0;
    case "unassigned":
      return (
        application.reviews.current +
          application.reviews.outdated +
          application.reviews.outstanding +
          application.reviews.unknown ===
        0
      );
    case "changed":
      return (
        application.reviews.outdated > 0 ||
        application.criteriaChanged ||
        Boolean(application.recommendation?.outdated)
      );
    case "unknown":
      return application.reviews.unknown > 0;
    case "unwritten":
      return application.recommendation === null;
  }
};

export const matchesApplicationFilter = (application: Application, filter: ApplicationFilter) => {
  // Work filters describe active work; only "All" and "Withdrawn" include withdrawn applications.
  const withdrawn = "assessments" in application ? isWithdrawn(application) : application.withdrawn;
  if (filter === "all") {
    return true;
  }
  if (filter === "withdrawn") {
    return withdrawn;
  }
  if (withdrawn) {
    return false;
  }
  return "assessments" in application
    ? matchesRoundApplicationFilter(application, filter)
    : matchesOverviewApplicationFilter(application, filter);
};

export const matchesApplicationSearch = (application: Application, query: string) => {
  const applicant =
    "assessments" in application ? application.submission?.organization : application.applicant;
  return `${application.title} ${applicant ?? ""}`
    .toLocaleLowerCase("en")
    .includes(query.trim().toLocaleLowerCase("en"));
};
