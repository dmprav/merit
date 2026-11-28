import type { z } from "zod";

import type { Identity } from "@merit/auth";
import { withActor } from "@merit/auth/request";
import type {
  GrantmakingQueries,
  ApplicationRequest,
  PublicRoundRequest,
  workspaceActivityInput,
  workspaceSearchInput,
  WorkspaceApplicationsInput,
} from "@merit/grantmaking/api";

type WithIdentity<T> = T & { currentIdentity: () => Promise<Identity> };

const workspaceFailure = (status: "not_found" | "forbidden") =>
  status === "not_found"
    ? ({ status: "workspace_not_found" } as const)
    : ({ status: "not_found" } as const);

export const loadFundingRounds = (
  workspaceSlug: string,
  services: WithIdentity<Pick<GrantmakingQueries, "listRounds">>,
) =>
  withActor(services.currentIdentity, async (actor) => {
    const result = await services.listRounds(actor, workspaceSlug);
    return result.status === "ok" ? result : workspaceFailure(result.status);
  });

export const loadFundingRoundPage = (
  input: PublicRoundRequest,
  services: WithIdentity<Pick<GrantmakingQueries, "readRoundPage">>,
) =>
  withActor(services.currentIdentity, async (actor) => {
    const page = await services.readRoundPage(actor, input);
    return page ? ({ status: "ok", ...page } as const) : ({ status: "not_found" } as const);
  });

export const loadFundingApplicationPage = (
  input: ApplicationRequest,
  services: WithIdentity<Pick<GrantmakingQueries, "readApplicationPage">>,
) =>
  withActor(services.currentIdentity, async (actor) => {
    const page = await services.readApplicationPage(actor, input);
    return page ? ({ status: "ok", ...page } as const) : ({ status: "not_found" } as const);
  });

export const loadWorkspaceApplications = (
  input: WorkspaceApplicationsInput,
  services: WithIdentity<Pick<GrantmakingQueries, "listWorkspaceApplications">>,
) =>
  withActor(services.currentIdentity, async (actor) => {
    const result = await services.listWorkspaceApplications(actor, input);
    return result.status === "ok" ? result : workspaceFailure(result.status);
  });

export const loadWorkspaceActivity = (
  input: z.input<typeof workspaceActivityInput>,
  services: WithIdentity<Pick<GrantmakingQueries, "listWorkspaceActivity">>,
) =>
  withActor(services.currentIdentity, async (actor) => {
    const result = await services.listWorkspaceActivity(actor, input);
    if (result.status === "invalid") {
      return { status: "unavailable" } as const;
    }
    return result.status === "ok" ? result : workspaceFailure(result.status);
  });

export const loadWorkspaceSearch = (
  input: z.input<typeof workspaceSearchInput>,
  services: WithIdentity<Pick<GrantmakingQueries, "searchWorkspace">>,
) =>
  withActor(services.currentIdentity, async (actor) => {
    const result = await services.searchWorkspace(actor, input);
    return result.status === "ok" ? result : workspaceFailure(result.status);
  });
