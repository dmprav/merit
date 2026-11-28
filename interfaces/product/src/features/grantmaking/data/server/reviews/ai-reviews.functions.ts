import { createServerFn } from "@tanstack/react-start";

import { withActor } from "@merit/auth/request";
import { aiReviewRunRequestSchema } from "@merit/reviews/api";

export const runAiReview = createServerFn({ method: "POST" })
  .validator(aiReviewRunRequestSchema)
  .handler(({ data, context }) =>
    withActor(context.currentIdentity, (actor) => context.reviews.runAiReview(actor, data)),
  );
