import { createServerFn } from "@tanstack/react-start";

import { createApplicationRequestSchema } from "@merit/applications/api";
import { withActor } from "@merit/auth/request";
import { createRoundRequestSchema } from "@merit/rounds/api";

export const createRound = createServerFn({ method: "POST" })
  .validator(createRoundRequestSchema)
  .handler(async ({ data, context }) =>
    withActor(context.currentIdentity, (actor) => context.rounds.createRound(actor, data)),
  );
export const createApplication = createServerFn({ method: "POST" })
  .validator(createApplicationRequestSchema)
  .handler(async ({ data, context }) =>
    withActor(context.currentIdentity, (actor) =>
      context.applications.createApplication(actor, data),
    ),
  );
