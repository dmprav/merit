import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";

import { withActor } from "@merit/auth/request";
import { saveReviewRequestSchema } from "@merit/reviews/api";

export const saveReview = createServerFn({ method: "POST" })
  .validator(saveReviewRequestSchema)
  .handler(({ data, context }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    return withActor(context.currentIdentity, (actor) => context.workspace.saveReview(actor, data));
  });
