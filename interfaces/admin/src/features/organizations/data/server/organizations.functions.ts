import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";

import type { Actor } from "@merit/auth";
import { withActor } from "@merit/auth/request";
import {
  createOrganizationInput,
  organizationIdInput,
  renameOrganizationInput,
  replaceInvitationInput,
} from "@merit/organizations/api";

import type { AdminRequestContext } from "../../../../app/context";

const run = <T>(context: AdminRequestContext, operation: (actor: Actor) => Promise<T>) => {
  setResponseHeader("Cache-Control", "private, no-store");
  return withActor(context.currentIdentity, operation);
};

export const listOrganizations = createServerFn({ method: "GET" }).handler(({ context }) =>
  run(context, (actor) => context.organizations.list(actor)),
);
export const readOrganization = createServerFn({ method: "GET" })
  .validator(organizationIdInput)
  .handler(({ context, data }) =>
    run(context, async (actor) => {
      const organizations = context.organizations;
      const result = await organizations.read(actor, data);
      if (result.status !== "ok") {
        return result;
      }

      const workspaces = await organizations.workspaces(actor).catch(() => {
        console.error("Organization workspace discovery failed.");
        return null;
      });

      return {
        status: "ok" as const,
        value: {
          ...result.value,
          canOpenWorkspace:
            workspaces?.status === "ok" &&
            workspaces.value.some((workspace) => workspace.id === result.value.id),
        },
      };
    }),
  );
export const createOrganization = createServerFn({ method: "POST" })
  .validator(createOrganizationInput)
  .handler(({ context, data }) =>
    run(context, (actor) => context.organizations.create(actor, data)),
  );
export const renameOrganization = createServerFn({ method: "POST" })
  .validator(renameOrganizationInput)
  .handler(({ context, data }) =>
    run(context, (actor) => context.organizations.rename(actor, data)),
  );
export const inviteAdministrator = createServerFn({ method: "POST" })
  .validator(replaceInvitationInput)
  .handler(({ context, data }) =>
    run(context, (actor) => context.organizations.invite(actor, data)),
  );
export const revokeInvitation = createServerFn({ method: "POST" })
  .validator(organizationIdInput)
  .handler(({ context, data }) =>
    run(context, (actor) => context.organizations.revoke(actor, data)),
  );
