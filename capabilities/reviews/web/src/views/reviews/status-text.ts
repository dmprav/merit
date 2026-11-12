export const reviewStatusText = (
  t: (
    key:
      | "reviews.unknownCount"
      | "reviews.currentCount"
      | "reviews.outdatedCount"
      | "reviews.awaitingCount"
      | "assessments.none",
    options?: { count: number },
  ) => string,
  {
    current,
    outdated,
    outstanding,
    unknown = 0,
  }: { current: number; outdated: number; outstanding: number; unknown?: number },
) =>
  [
    unknown > 0 && t("reviews.unknownCount", { count: unknown }),
    current > 0 && t("reviews.currentCount", { count: current }),
    outdated > 0 && t("reviews.outdatedCount", { count: outdated }),
    outstanding > 0 && t("reviews.awaitingCount", { count: outstanding }),
  ]
    .filter(Boolean)
    .join(", ") || t("assessments.none");
