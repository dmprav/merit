import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";

import { createApplicationRequestSchema } from "@merit/applications/api";
import { withActor } from "@merit/auth/request";
import { createRoundRequestSchema } from "@merit/rounds/api";

export const createRound = createServerFn({ method: "POST" })
  .validator(createRoundRequestSchema)
  .handler(async ({ data, context }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    return withActor(context.workspace.currentIdentity, (actor) =>
      context.workspace.createRound(actor, data),
    );
  });
export const createApplication = createServerFn({ method: "POST" })
  .validator(createApplicationRequestSchema)
  .handler(async ({ data, context }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    return withActor(context.workspace.currentIdentity, (actor) =>
      context.workspace.createApplication(actor, data),
    );
  });
