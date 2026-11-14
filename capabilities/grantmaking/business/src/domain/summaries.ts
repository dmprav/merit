import { isWithdrawn, type ApplicationWithdrawal } from "@merit/applications/domain";
import { add, subtract, fromMinorUnits, type Money } from "@merit/money";
import { assessmentStatus } from "@merit/reviews/domain";

export const summarizeRound = (
  budget: Money | null,
  applications: readonly {
    withdrawal?: ApplicationWithdrawal | undefined;
    requested: Money | null;
    managerRecommendation: { allocation: Money } | null;
    version: Parameters<typeof assessmentStatus>[1];
    assessments: readonly Parameters<typeof assessmentStatus>[0][];
  }[],
) => {
  const totals = {
    requested: fromMinorUnits(0n),
    unknownRequests: 0,
    withdrawnApplications: 0,
    proposed: fromMinorUnits(0n),
    reviews: { assigned: 0, submitted: 0, current: 0, outdated: 0, outstanding: 0, unknown: 0 },
  };
  for (const application of applications) {
    // Withdrawn applications are neither funding demand nor active review work.
    if (isWithdrawn(application)) {
      totals.withdrawnApplications++;
      continue;
    }
    if (application.requested === null) {
      totals.unknownRequests++;
    } else {
      totals.requested = add(totals.requested, application.requested);
    }
    if (application.managerRecommendation) {
      totals.proposed = add(totals.proposed, application.managerRecommendation.allocation);
    }

    for (const assessment of application.assessments) {
      const status = assessmentStatus(assessment, application.version);
      totals.reviews.assigned++;
      totals.reviews[status]++;
      if (status !== "outstanding") {
        totals.reviews.submitted++;
      }
    }
  }

  return { ...totals, remaining: budget === null ? null : subtract(budget, totals.proposed) };
};
