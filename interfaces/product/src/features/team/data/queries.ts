import { teamOptions as createTeamOptions } from "@merit/organizations-web/data/team";

import { teamTransport } from "./transport";

export const teamOptions = (workspaceSlug: string) =>
  createTeamOptions(workspaceSlug, teamTransport.read);
