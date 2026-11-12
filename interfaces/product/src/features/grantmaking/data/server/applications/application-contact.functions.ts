import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";

import { selectContactRequestSchema } from "@merit/applications/api";
import { withActor } from "@merit/auth/request";

export const selectContact = createServerFn({ method: "POST" })
  .validator(selectContactRequestSchema)
  .handler(({ data, context }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    return withActor(context.currentIdentity, (actor) =>
      context.workspace.selectContact(actor, data),
    );
  });
