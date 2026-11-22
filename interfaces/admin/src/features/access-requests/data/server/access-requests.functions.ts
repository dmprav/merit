import { createServerFn } from "@tanstack/react-start";

import { withActor } from "@merit/auth/request";
import { accessRequestInput, accessRequestPageInput } from "@merit/organizations/api";

export const readAccessRequests = createServerFn({ method: "GET" })
  .validator(accessRequestPageInput)
  .handler(({ context, data }) =>
    withActor(context.currentIdentity, (actor) =>
      context.organizations.accessRequests(actor, data),
    ),
  );

export const reviewAccessRequest = createServerFn({ method: "POST" })
  .validator(accessRequestInput)
  .handler(({ context, data }) =>
    withActor(context.currentIdentity, (actor) =>
      context.organizations.reviewAccessRequest(actor, data),
    ),
  );
