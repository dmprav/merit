import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";

import { withActor } from "@merit/auth/request";
import { editRoundRequestSchema, deleteRoundRequestSchema } from "@merit/rounds/api";

export const editRound = createServerFn({ method: "POST" })
  .validator(editRoundRequestSchema)
  .handler(async ({ data, context }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    return withActor(context.currentIdentity, (actor) => context.rounds.editRound(actor, data));
  });
export const deleteRound = createServerFn({ method: "POST" })
  .validator(deleteRoundRequestSchema)
  .handler(async ({ data, context }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    return withActor(context.currentIdentity, (actor) => context.rounds.deleteRound(actor, data));
  });
