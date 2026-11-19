import { createServerFn } from "@tanstack/react-start";

import { withActor } from "@merit/auth/request";
import { accessRequestInput } from "@merit/organizations/api";

export const readAccessRequests = createServerFn({ method: "GET" }).handler(({ context }) =>
  withActor(context.currentIdentity, (actor) => context.organizations.accessRequests(actor)),
);

export const reviewAccessRequest = createServerFn({ method: "POST" })
  .validator(accessRequestInput)
  .handler(({ context, data }) =>
    withActor(context.currentIdentity, (actor) =>
      context.organizations.reviewAccessRequest(actor, data),
    ),
  );
