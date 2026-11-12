import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import { workspaceHomeLocation } from "../../shared/workspace-location";
import { useInvitation } from "./controllers/use-invitation";
import { invitationData } from "./data/invitation";
import { invitationOptions } from "./data/queries";
import { InvitationView } from "./views/invitation-view";

export const WorkspaceInvitation = ({
  token,
  fingerprint,
}: {
  token: string;
  fingerprint: string;
}) => {
  const { data: result } = useSuspenseQuery(invitationOptions(token, fingerprint));
  const client = useQueryClient();
  const navigate = useNavigate();
  const { pending, error, accept } = useInvitation(invitationData(client, token), (workspace) =>
    navigate(workspaceHomeLocation(workspace)),
  );

  return (
    <InvitationView
      result={result}
      token={token}
      pending={pending}
      error={error}
      onAccept={accept}
    />
  );
};
