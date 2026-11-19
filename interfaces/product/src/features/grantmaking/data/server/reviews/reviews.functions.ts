import { createServerFn } from "@tanstack/react-start";

import { withActor } from "@merit/auth/request";
import { saveReviewRequestSchema } from "@merit/reviews/api";

export const saveReview = createServerFn({ method: "POST" })
  .validator(saveReviewRequestSchema)
  .handler(({ data, context }) =>
    withActor(context.currentIdentity, (actor) => context.reviews.saveReview(actor, data)),
  );
