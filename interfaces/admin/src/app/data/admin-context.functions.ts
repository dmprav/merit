import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";

import { withActor } from "@merit/auth/request";

export const readAdminContext = createServerFn({ method: "GET" }).handler(({ context }) => {
  setResponseHeader("Cache-Control", "private, no-store");
  return withActor(context.currentIdentity, async (actor) => {
    const canAdminister = context.organizations.canAdminister(actor);
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
