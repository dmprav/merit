import { type RoundView } from "@merit/grantmaking/api";
import { summarizeAssessments } from "@merit/reviews/domain";

export const createLandingPreview = (round: RoundView) => {
  if (round.budget === null || round.totals.remaining === null) {
    throw new Error("The landing preview requires a round budget");
  }

  const applications = round.applications.map((application) => {
    const recommendation = application.managerRecommendation;
    if (!recommendation) {
      throw new Error(`The landing preview requires a recommendation for ${application.id}`);
    }
    return {
      id: application.id,
      title: application.title,
      reviews: summarizeAssessments(application.assessments),
      recommendation,
    };
  });

  const workshop = round.applications.find((application) => application.id === "A3");
  if (!workshop) {
    throw new Error("The landing preview requires Workshop Saturdays (A3)");
  }
  const evidence = workshop.evidence.find((item) => item.version === workshop.version);
  if (!evidence) {
    throw new Error("The landing preview requires evidence from the current application version");
  }
  const assessment = workshop.assessments.find(
    (item) => item.submission && item.status === "outdated",
  );
  const review = assessment?.submission;
  if (
    !assessment ||
    !review ||
    review.applicationVersion === null ||
    review.applicationVersion >= workshop.version
  ) {
    throw new Error("The landing preview requires a review of an earlier application version");
  }

  return {
    round: {
      foundation: round.foundation,
      title: round.title,
      decisionStatus: round.decisionStatus,
      budget: round.budget,
      totals: {
        requested: round.totals.requested,
        proposed: round.totals.proposed,
        remaining: round.totals.remaining,
      },
      applications,
    },
    comparison: {
      application: { title: workshop.title, version: workshop.version, passage: evidence.passage },
      assessment: {
        reviewer: assessment.reviewer,
        applicationVersion: review.applicationVersion,
        recommendation: review.recommendation,
        reasoning: review.reasoning,
      },
    },
  };
};

export type LandingPreview = ReturnType<typeof createLandingPreview>;
