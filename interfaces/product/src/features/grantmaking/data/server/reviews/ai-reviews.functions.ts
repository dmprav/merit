import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { withActor } from "@merit/auth/request";
import { aiReviewRequestSchema } from "@merit/reviews/api";

export const runAiReview = createServerFn({ method: "POST" })
  .validator(aiReviewRequestSchema.extend({ runId: z.uuid() }))
  .handler(({ data, context }) =>
    withActor(context.currentIdentity, (actor) => context.reviews.runAiReview(actor, data)),
  );
