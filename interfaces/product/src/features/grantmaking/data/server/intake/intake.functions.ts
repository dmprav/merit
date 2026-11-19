import { createServerFn } from "@tanstack/react-start";

import { editApplicationRequestSchema } from "@merit/applications/api";
import { withActor } from "@merit/auth/request";

export const editApplication = createServerFn({ method: "POST" })
  .validator(editApplicationRequestSchema)
  .handler(async ({ data, context }) =>
    withActor(context.currentIdentity, (actor) =>
      context.applications.editApplication(actor, data),
    ),
  );
