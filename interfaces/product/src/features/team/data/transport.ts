import type { TeamTransport } from "@merit/organizations-web/contracts/team";

import {
  readTeam,
  inviteMember,
  changeMember,
  removeMember,
  resendMemberInvitation,
  revokeMemberInvitation,
} from "./server/team.functions";

export const teamTransport: TeamTransport = {
  read: (workspaceSlug, signal) => readTeam({ signal, data: { workspaceSlug } }),
  invite: (data) => inviteMember({ data }),
  changeMember: (data) => changeMember({ data }),
  removeMember: (data) => removeMember({ data }),
  resend: (data) => resendMemberInvitation({ data }),
  revoke: (data) => revokeMemberInvitation({ data }),
};
