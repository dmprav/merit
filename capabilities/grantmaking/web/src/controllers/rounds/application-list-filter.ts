import type { RoundView } from "@merit/grantmaking/api";

export const applicationFilters = [
  "all",
  "preparing",
  "awaiting",
  "unassigned",
  "changed",
  "unknown",
  "unwritten",
] as const;

export type ApplicationFilter = (typeof applicationFilters)[number];

type Application = RoundView["applications"][number];

export const matchesApplicationFilter = (application: Application, filter: ApplicationFilter) => {
  switch (filter) {
    case "all":
      return true;
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

export const matchesApplicationSearch = (application: Application, query: string) =>
  `${application.title} ${application.submission?.organization ?? ""}`
    .toLocaleLowerCase("en")
    .includes(query.trim().toLocaleLowerCase("en"));
