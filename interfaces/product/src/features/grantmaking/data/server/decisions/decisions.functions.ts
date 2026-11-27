import { createServerFn } from "@tanstack/react-start";

import { withActor } from "@merit/auth/request";
import { encodeDecisionResult, recordDecisionRequestSchema } from "@merit/decisions/api";

export const recordDecision = createServerFn({ method: "POST" })
  .validator(recordDecisionRequestSchema)
  .handler(async ({ data, context }) =>
    encodeDecisionResult(
      await withActor(context.currentIdentity, (actor) =>
        context.decisions.recordDecision(actor, data),
      ),
    ),
  );
