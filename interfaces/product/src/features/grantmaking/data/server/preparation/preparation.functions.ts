import { createServerFn } from "@tanstack/react-start";

import { withActor } from "@merit/auth/request";
import { editRoundRequestSchema, deleteRoundRequestSchema } from "@merit/rounds/api";

export const editRound = createServerFn({ method: "POST" })
  .validator(editRoundRequestSchema)
  .handler(async ({ data, context }) =>
    withActor(context.currentIdentity, (actor) => context.rounds.editRound(actor, data)),
  );
export const deleteRound = createServerFn({ method: "POST" })
  .validator(deleteRoundRequestSchema)
  .handler(async ({ data, context }) =>
    withActor(context.currentIdentity, (actor) => context.rounds.deleteRound(actor, data)),
  );
