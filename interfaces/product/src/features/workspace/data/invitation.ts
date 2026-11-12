import type { QueryClient } from "@tanstack/react-query";

import { privateKey } from "@merit/query";

import type { InvitationData } from "../contracts";
import { acceptInvitation } from "./server/organization.functions";

export const invitationData = (client: QueryClient, token: string): InvitationData => ({
  accept: () => acceptInvitation({ data: { token } }),
  refreshAccess: () => client.invalidateQueries({ queryKey: privateKey, refetchType: "none" }),
});
