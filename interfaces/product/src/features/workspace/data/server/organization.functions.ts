import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";

import { withActor } from "@merit/auth/request";
import { invitationTokenInput } from "@merit/organizations/api";

export const readWorkspaces = createServerFn({ method: "GET" }).handler(({ context }) => {
  setResponseHeader("Cache-Control", "private, no-store");

  return withActor(context.currentIdentity, async (actor) => {
    const result = await context.organizations.workspaces(actor);
    return {
      ...result,
      draftScope: actor.userId,
      canAdminister: context.organizations.canAdminister(actor),
    };
  });
});
export const readInvitation = createServerFn({ method: "GET" })
  .validator(invitationTokenInput)
  .handler(({ context, data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    return withActor(context.currentIdentity, (actor) =>
      context.organizations.invitation(actor, data),
    );
  });
export const acceptInvitation = createServerFn({ method: "POST" })
  .validator(invitationTokenInput)
  .handler(({ context, data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    return withActor(context.currentIdentity, (actor) => context.organizations.accept(actor, data));
  });
