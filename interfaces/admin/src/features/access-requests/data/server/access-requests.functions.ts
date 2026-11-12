import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";

import { withActor } from "@merit/auth/request";
import { accessRequestInput } from "@merit/organizations/api";

export const readAccessRequests = createServerFn({ method: "GET" }).handler(({ context }) => {
  setResponseHeader("Cache-Control", "private, no-store");
  return withActor(context.currentIdentity, (actor) => context.organizations.accessRequests(actor));
});

export const reviewAccessRequest = createServerFn({ method: "POST" })
  .validator(accessRequestInput)
  .handler(({ context, data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    return withActor(context.currentIdentity, (actor) =>
      context.organizations.reviewAccessRequest(actor, data),
    );
  });
