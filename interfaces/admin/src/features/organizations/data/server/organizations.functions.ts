import { createServerFn } from "@tanstack/react-start";

import { withActor } from "@merit/auth/request";
import {
  createOrganizationInput,
  organizationIdInput,
  renameOrganizationInput,
  replaceInvitationInput,
} from "@merit/organizations/api";

export const listOrganizations = createServerFn({ method: "GET" }).handler(({ context }) =>
  withActor(context.currentIdentity, (actor) => context.organizations.list(actor)),
);
export const readOrganization = createServerFn({ method: "GET" })
  .validator(organizationIdInput)
  .handler(({ context, data }) =>
    withActor(context.currentIdentity, async (actor) => {
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
    withActor(context.currentIdentity, (actor) => context.organizations.create(actor, data)),
  );
export const renameOrganization = createServerFn({ method: "POST" })
  .validator(renameOrganizationInput)
  .handler(({ context, data }) =>
    withActor(context.currentIdentity, (actor) => context.organizations.rename(actor, data)),
  );
export const inviteAdministrator = createServerFn({ method: "POST" })
  .validator(replaceInvitationInput)
  .handler(({ context, data }) =>
    withActor(context.currentIdentity, (actor) => context.organizations.invite(actor, data)),
  );
export const revokeInvitation = createServerFn({ method: "POST" })
  .validator(organizationIdInput)
  .handler(({ context, data }) =>
    withActor(context.currentIdentity, (actor) => context.organizations.revoke(actor, data)),
  );
