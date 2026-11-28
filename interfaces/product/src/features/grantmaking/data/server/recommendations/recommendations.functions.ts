import { createServerFn } from "@tanstack/react-start";

import { withActor } from "@merit/auth/request";
import { encodeMoney } from "@merit/money";
import {
  saveRecommendationRequestSchema,
  encodeBudgetTotals,
  encodeRecommendation,
} from "@merit/recommendations/api";

export const saveRecommendation = createServerFn({ method: "POST" })
  .validator(saveRecommendationRequestSchema)
  .handler(async ({ data, context }) => {
    const result = await withActor(context.currentIdentity, (actor) =>
      context.recommendations.saveRecommendation(actor, data),
    );

    return result.status === "ok"
      ? {
          ...result,
          recommendation: encodeRecommendation(result.recommendation),
          budget: result.budget === null ? null : encodeMoney(result.budget),
          totals: encodeBudgetTotals(result.totals),
        }
      : result;
  });
