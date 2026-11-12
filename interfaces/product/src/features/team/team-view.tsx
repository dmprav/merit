import { useRouter } from "@tanstack/react-router";
import { useContext } from "react";

import { TeamWork } from "@merit/organizations-web/team";
import type { Team } from "@merit/organizations/api";

import { WorkspaceNavigationContext } from "../workspace/workspace-navigation";
import { teamTransport } from "./data/transport";

export const TeamView = ({ initial }: { initial: Team }) => {
  const router = useRouter();
  const { draftScope } = useContext(WorkspaceNavigationContext);

  return (
    <TeamWork
      initial={initial}
      draftScope={draftScope}
      transport={teamTransport}
      revalidateAccess={() =>
        router.invalidate({
          filter: (match) => match.routeId !== "/_product/app/$workspaceSlug/settings/members",
        })
      }
    />
  );
};
