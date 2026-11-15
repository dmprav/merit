import type { readIntakeApplicationsMap } from "@merit/applications/scope";
import type { readCurrentRecommendationsMap } from "@merit/recommendations/scope";
import { reviewRevisionSchema } from "@merit/reviews/domain";
import type { readReviewsByCasesMap } from "@merit/reviews/scope";

type IntakeRecord = NonNullable<
  ReturnType<Awaited<ReturnType<typeof readIntakeApplicationsMap>>["get"]>
>;

type ReviewsRecord = NonNullable<
  ReturnType<Awaited<ReturnType<typeof readReviewsByCasesMap>>["get"]>
>;

type RecommendationEntry = ReturnType<
  Awaited<ReturnType<typeof readCurrentRecommendationsMap>>["get"]
>;

export const assembleApplicationRecord = (
  intake: IntakeRecord,
  reviews: ReviewsRecord | undefined,
  recommendation: RecommendationEntry | undefined,
) => ({
  ...intake,
  reviews: reviews ?? {
    revision: reviewRevisionSchema.parse(0),
    requests: [],
    assessments: [],
  },
  managerRecommendation: recommendation?.recommendation ?? null,
});
