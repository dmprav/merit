import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";

import { withActor } from "@merit/auth/request";
import { encodeBudgetTotals } from "@merit/grantmaking/api";
import { encodeMoney } from "@merit/money";
import { saveRecommendationRequestSchema, encodeRecommendation } from "@merit/recommendations/api";

export const saveRecommendation = createServerFn({ method: "POST" })
  .validator(saveRecommendationRequestSchema)
  .handler(async ({ data, context }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const result = await withActor(context.workspace.currentIdentity, (actor) =>
      context.workspace.saveRecommendation(actor, data),
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
