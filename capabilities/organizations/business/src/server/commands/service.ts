import type { z } from "zod";

import type { Actor } from "@merit/auth";

import {
  accessRequestInput,
  createOrganizationInput,
  renameOrganizationInput,
  replaceInvitationInput,
  inviteMemberInput,
  teamInvitationInput,
  memberInput,
  changeMemberInput,
} from "../../api/commands";
import { organizationIdInput, invitationTokenInput } from "../../api/identifiers";
import type { Dependencies } from "../dependencies";
import { createExecution } from "../execution";
import { hashToken } from "../invitation-token";
import { markAccessRequestReviewed } from "../persistence/commands/access-requests";
import { fail } from "../result";
import { requestWorkspaceAccess } from "./access-requests";
import { createDelivery } from "./delivery";
import * as provisioning from "./provisioning";
import * as team from "./team";

const createProvisioningCommands = (dependencies: Dependencies) => {
  const { run } = createExecution(dependencies);
  const deliver = createDelivery(dependencies);
  return {
    create: (
      actor: Actor,
      input: { requestId: string; name: string; slug: string; email: string },
    ) =>
      run(actor, true, async () => {
        const parsed = createOrganizationInput.safeParse(input);
        if (!parsed.success) {
          return fail("invalid_input");
        }

        const result = await dependencies.database((db) =>
          provisioning.createOrganization(db, parsed.data, actor),
        );
        if (result.invitation) {
          await deliver(result.invitation, parsed.data.name);
        }
        return { organizationId: result.organizationId };
      }),

    rename: (actor: Actor, input: { organizationId: string; name: string }) =>
      run(actor, true, async () => {
        const parsed = renameOrganizationInput.safeParse(input);
        if (!parsed.success) {
          return fail("invalid_input");
        }

        await dependencies.database((db) =>
          provisioning.renameOrganization(db, parsed.data.organizationId, parsed.data.name, actor),
        );

        return null;
      }),

    invite: (actor: Actor, input: { organizationId: string; email: string }) =>
      run(actor, true, async () => {
        const parsed = replaceInvitationInput.safeParse(input);
        if (!parsed.success) {
          return fail("invalid_input");
        }

        const result = await dependencies.database((db) =>
          provisioning.replaceInvitation(db, parsed.data.organizationId, actor, parsed.data.email),
        );
        await deliver(result.invitation, result.organization.name);
        return null;
      }),

    revoke: (actor: Actor, input: { organizationId: string }) =>
      run(actor, true, async () => {
        const parsed = organizationIdInput.safeParse(input);
        if (!parsed.success) {
          return fail("invalid_input");
        }

        await dependencies.database((db) =>
          provisioning.revokeInvitation(db, parsed.data.organizationId, actor),
        );
        return null;
      }),

    accept: (actor: Actor, input: { token: string }) =>
      run(actor, false, async () => {
        const parsed = invitationTokenInput.safeParse(input);
        if (!parsed.success) {
          return fail("not_found");
        }

        const [hash, emails, name] = await Promise.all([
          hashToken(parsed.data.token),
          dependencies.verifiedEmails(actor),
          dependencies.displayName?.(actor),
        ]);

        return dependencies.database((db) =>
          provisioning.acceptInvitation(db, hash, actor, emails, name),
        );
      }),
  };
};

const createTeamCommands = (dependencies: Dependencies) => {
  const { run } = createExecution(dependencies);
  const deliver = createDelivery(dependencies);
  return {
    inviteMember: (actor: Actor, input: z.infer<typeof inviteMemberInput>) =>
      run(actor, false, async () => {
        const parsed = inviteMemberInput.safeParse(input);
        if (!parsed.success) {
          return fail("invalid_input");
        }

        const result = await dependencies.database((db) =>
          team.inviteMember(db, actor, parsed.data),
        );
        if (result.invitation) {
          await deliver(result.invitation, result.organization.name);
        }
        return { invitationId: parsed.data.requestId };
      }),

    resendMemberInvitation: (actor: Actor, input: z.infer<typeof teamInvitationInput>) =>
      run(actor, false, async () => {
        const parsed = teamInvitationInput.safeParse(input);
        if (!parsed.success) {
          return fail("invalid_input");
        }

        const result = await dependencies.database((db) =>
          team.resendTeamInvitation(db, parsed.data.workspaceSlug, actor, parsed.data.invitationId),
        );
        await deliver(result.invitation, result.organization.name);
        return {
          invitationId: result.invitation.record.id,
          replacesInvitationId: parsed.data.invitationId,
        };
      }),

    revokeMemberInvitation: (actor: Actor, input: z.infer<typeof teamInvitationInput>) =>
      run(actor, false, async () => {
        const parsed = teamInvitationInput.safeParse(input);
        if (!parsed.success) {
          return fail("invalid_input");
        }

        await dependencies.database((db) =>
          team.revokeTeamInvitation(db, parsed.data.workspaceSlug, actor, parsed.data.invitationId),
        );
        return { invitationId: parsed.data.invitationId };
      }),

    changeMember: (actor: Actor, input: z.infer<typeof changeMemberInput>) =>
      run(actor, false, async () => {
        const parsed = changeMemberInput.safeParse(input);
        if (!parsed.success) {
          return fail("invalid_input");
        }
        return dependencies.database((db) =>
          team.changeMember(db, actor, parsed.data, dependencies.revokeReviewAccess),
        );
      }),

    removeMember: (actor: Actor, input: z.infer<typeof memberInput>) =>
      run(actor, false, async () => {
        const parsed = memberInput.safeParse(input);
        if (!parsed.success) {
          return fail("invalid_input");
        }
        return dependencies.database((db) =>
          team.changeMember(db, actor, parsed.data, dependencies.revokeReviewAccess),
        );
      }),
  };
};

const createAccessRequestCommands = (dependencies: Dependencies) => {
  const { run } = createExecution(dependencies);
  return {
    requestAccess: (input: { email: string }) => {
      if (!dependencies.networkAddress) {
        return Promise.resolve({ status: "unavailable" } as const);
      }
      return dependencies.database((db) =>
        requestWorkspaceAccess(db, input, dependencies.networkAddress!),
      );
    },

    reviewAccessRequest: (actor: Actor, input: { email: string }) =>
      run(actor, true, async () => {
        const parsed = accessRequestInput.safeParse(input);
        if (!parsed.success) {
          return fail("invalid_input");
        }

        return dependencies.database(
          async (db) =>
            (await db.transaction((tx) =>
              markAccessRequestReviewed(tx, parsed.data.email, actor.userId),
            )) ?? fail("not_found"),
        );
      }),
  };
};

export const createCommands = (dependencies: Dependencies) => ({
  ...createAccessRequestCommands(dependencies),
  ...createProvisioningCommands(dependencies),
  ...createTeamCommands(dependencies),
});
