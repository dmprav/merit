import { createServerFn } from "@tanstack/react-start";

import { withActor } from "@merit/auth/request";
import { teamHistoryInput } from "@merit/organizations/api";
import {
  teamInput,
  inviteMemberInput,
  teamInvitationInput,
  memberInput,
  changeMemberInput,
} from "@merit/organizations/api";

export const readTeam = createServerFn({ method: "GET" })
  .validator(teamInput)
  .handler(({ context, data }) =>
    withActor(context.currentIdentity, (actor) => context.organizations.team(actor, data)),
  );
export const inviteMember = createServerFn({ method: "POST" })
  .validator(inviteMemberInput)
  .handler(({ context, data }) =>
    withActor(context.currentIdentity, (actor) => context.organizations.inviteMember(actor, data)),
  );
export const resendMemberInvitation = createServerFn({ method: "POST" })
  .validator(teamInvitationInput)
  .handler(({ context, data }) =>
    withActor(context.currentIdentity, (actor) =>
      context.organizations.resendMemberInvitation(actor, data),
    ),
  );
export const revokeMemberInvitation = createServerFn({ method: "POST" })
  .validator(teamInvitationInput)
  .handler(({ context, data }) =>
    withActor(context.currentIdentity, (actor) =>
      context.organizations.revokeMemberInvitation(actor, data),
    ),
  );
export const changeMember = createServerFn({ method: "POST" })
  .validator(changeMemberInput)
  .handler(({ context, data }) =>
    withActor(context.currentIdentity, (actor) => context.organizations.changeMember(actor, data)),
  );
export const removeMember = createServerFn({ method: "POST" })
  .validator(memberInput)
  .handler(({ context, data }) =>
    withActor(context.currentIdentity, (actor) => context.organizations.removeMember(actor, data)),
  );

export const readTeamHistory = createServerFn({ method: "GET" })
  .validator(teamHistoryInput)
  .handler(({ context, data }) =>
    withActor(context.currentIdentity, (actor) =>
      context.organizations.teamHistoryPage(actor, data),
    ),
  );
