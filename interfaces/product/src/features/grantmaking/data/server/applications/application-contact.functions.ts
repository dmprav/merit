import { createServerFn } from "@tanstack/react-start";

import { selectContactRequestSchema } from "@merit/applications/api";
import { withActor } from "@merit/auth/request";

export const selectContact = createServerFn({ method: "POST" })
  .validator(selectContactRequestSchema)
  .handler(({ data, context }) =>
    withActor(context.currentIdentity, (actor) => context.applications.selectContact(actor, data)),
  );
