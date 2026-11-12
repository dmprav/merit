import { fromMinorUnits, toDecimal, type Money } from "@merit/money";
import type { Recommendation } from "@merit/recommendations/domain";

import type { RecommendationDraft } from "../../contracts/recommendations";

export const recommendationDraft = (
  recommendation: Recommendation | null,
  requested: Money | null = null,
): RecommendationDraft => ({
  position: recommendation?.position ?? ("Fund" as const),
  amount: toDecimal(recommendation?.allocation ?? requested ?? fromMinorUnits(0n)),
  reasoning: recommendation?.reasoning ?? "",
});
