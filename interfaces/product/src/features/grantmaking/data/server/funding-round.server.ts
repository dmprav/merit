import type { z } from "zod";

import { withActor } from "@merit/auth/request";
import type {
  ApplicationRequest,
  PublicRoundRequest,
  workspaceActivityInput,
} from "@merit/grantmaking/api";

import type { WorkspaceServices } from "../../../../shared/request-context";

export const loadFundingRounds = (
  workspaceSlug: string,
  services: Pick<WorkspaceServices, "currentIdentity" | "listRounds">,
) =>
  withActor(services.currentIdentity, async (actor) => {
    const result = await services.listRounds(actor, workspaceSlug);
    if (result.status === "not_found") {
      return { status: "workspace_not_found" } as const;
    }
    if (result.status === "forbidden") {
      return { status: "not_found" } as const;
    }
    return result;
  });

export const loadFundingRoundPage = (
  input: PublicRoundRequest,
  services: Pick<WorkspaceServices, "currentIdentity" | "readRoundPage">,
) =>
  withActor(services.currentIdentity, async (actor) => {
    const page = await services.readRoundPage(actor, input);
    return page ? ({ status: "ok", ...page } as const) : ({ status: "not_found" } as const);
  });

export const loadFundingApplicationPage = (
  input: ApplicationRequest,
  services: WorkspaceServices,
) =>
  withActor(services.currentIdentity, async (actor) => {
    const page = await services.readApplicationPage(actor, input);
    return page ? ({ status: "ok", ...page } as const) : ({ status: "not_found" } as const);
  });

export const loadWorkspaceApplications = (
  workspaceSlug: string,
  services: Pick<WorkspaceServices, "currentIdentity" | "listWorkspaceApplications">,
) =>
  withActor(services.currentIdentity, async (actor) => {
    const result = await services.listWorkspaceApplications(actor, workspaceSlug);
    if (result.status === "not_found") {
      return { status: "workspace_not_found" } as const;
    }
    if (result.status === "forbidden") {
      return { status: "not_found" } as const;
    }
    return result;
  });

export const loadWorkspaceActivity = (
  input: z.input<typeof workspaceActivityInput>,
  services: Pick<WorkspaceServices, "currentIdentity" | "listWorkspaceActivity">,
) =>
  withActor(services.currentIdentity, async (actor) => {
    const result = await services.listWorkspaceActivity(actor, input);
    if (result.status === "invalid") {
      return { status: "unavailable" } as const;
    }
    if (result.status === "not_found") {
      return { status: "workspace_not_found" } as const;
    }
    if (result.status === "forbidden") {
      return { status: "not_found" } as const;
    }
    return result;
  });
