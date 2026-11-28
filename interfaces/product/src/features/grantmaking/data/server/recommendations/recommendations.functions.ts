import { createServerFn } from "@tanstack/react-start";

import { withActor } from "@merit/auth/request";
import {
  encodeRecommendationResult,
  saveRecommendationRequestSchema,
} from "@merit/recommendations/api";

export const saveRecommendation = createServerFn({ method: "POST" })
  .validator(saveRecommendationRequestSchema)
  .handler(({ data, context }) =>
    withActor(context.currentIdentity, async (actor) =>
      encodeRecommendationResult(await context.recommendations.saveRecommendation(actor, data)),
    ),
  );
