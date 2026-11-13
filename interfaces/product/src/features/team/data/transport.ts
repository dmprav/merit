import type { TeamTransport } from "@merit/organizations-web/contracts/team";
import { available, privateKey } from "@merit/query";

import {
  readTeam,
  readTeamHistory,
  inviteMember,
  changeMember,
  removeMember,
  resendMemberInvitation,
  revokeMemberInvitation,
} from "./server/team.functions";

export const teamTransport: TeamTransport = {
  history: (workspaceSlug) => ({
    queryKey: [...privateKey, "workspace", workspaceSlug, "team", "history"],
    read: async (after, signal) => {
      const result = available(await readTeamHistory({ data: { workspaceSlug, after }, signal }));
      return result.status === "ok"
        ? {
            ...result.value,
            entries: result.value.entries.map(({ eventId, ...entry }) => ({
              ...entry,
              id: eventId,
            })),
          }
        : null;
    },
  }),
  read: (workspaceSlug, signal) => readTeam({ signal, data: { workspaceSlug } }),
  invite: (data) => inviteMember({ data }),
  changeMember: (data) => changeMember({ data }),
  removeMember: (data) => removeMember({ data }),
  resend: (data) => resendMemberInvitation({ data }),
  revoke: (data) => revokeMemberInvitation({ data }),
};
