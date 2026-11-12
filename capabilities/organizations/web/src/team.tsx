import type { Team, TeamTransport } from "./contracts/team";
import { useWorkspaceTeam } from "./data/workspace-data";
import { TeamView } from "./views/team-view";

export const TeamWork = ({
  initial,
  draftScope,
  transport,
  revalidateAccess,
}: {
  initial: Team;
  draftScope?: string;
  transport: TeamTransport;
  revalidateAccess: () => Promise<void>;
}) => {
  const data = useWorkspaceTeam(initial, transport, revalidateAccess);
  return <TeamView data={data} draftScope={draftScope} />;
};
