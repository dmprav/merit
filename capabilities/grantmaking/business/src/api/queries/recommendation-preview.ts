import {
  prepareRecommendation,
  type RecommendationUpdateError,
} from "@merit/recommendations/domain";

import type { FundingRoundOverview } from "../../domain/model";
import { roundView, type RoundView } from "./round-view";

type RecommendationUpdateResult =
  | { ok: true; round: RoundView }
  | { ok: false; error: RecommendationUpdateError };

export const updateRecommendation = (
  round: FundingRoundOverview,
  applicationId: string,
  input: unknown,
  recordedOn?: string,
): RecommendationUpdateResult => {
  const application = round.applications.find((item) => item.id === applicationId);
  if (!application) {
    return { ok: false, error: "application_not_found" };
  }

  try {
    const result = prepareRecommendation(roundView(round), application, input, recordedOn);
    if (!result.ok) {
      return result;
    }

    return {
      ok: true,
      round: roundView({
        ...round,
        applications: round.applications.map((item) =>
          item.id === applicationId
            ? { ...item, managerRecommendation: result.recommendation }
            : item,
        ),
      }),
    };
  } catch (error) {
    if (error instanceof RangeError) {
      return { ok: false, error: "allocation_total_too_large" };
    }
    throw error;
  }
};
