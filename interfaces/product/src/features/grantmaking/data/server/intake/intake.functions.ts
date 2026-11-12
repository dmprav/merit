import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";

import { editApplicationRequestSchema } from "@merit/applications/api";
import { withActor } from "@merit/auth/request";

export const editApplication = createServerFn({ method: "POST" })
  .validator(editApplicationRequestSchema)
  .handler(async ({ data, context }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    return withActor(context.workspace.currentIdentity, (actor) =>
      context.workspace.editApplication(actor, data),
    );
  });
