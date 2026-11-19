import { createServerFn } from "@tanstack/react-start";

import { withActor } from "@merit/auth/request";

export const readAdminContext = createServerFn({ method: "GET" }).handler(({ context }) => {
  return withActor(context.currentIdentity, async (actor) => {
    const canAdminister = await context.organizations.canAdminister(actor);
    const workspaces = await context.organizations.workspaces(actor).catch(() => {
      console.error("Administration workspace discovery failed.");
      return null;
    });

    return {
      status: "ok" as const,
      canAdminister,
      draftScope: actor.userId,
      workspaces: workspaces?.value ?? [],
    };
  });
});
