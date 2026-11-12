import { z } from "zod";

import { workspaceSlugSchema } from "@merit/organizations/api";

import type { McpActor } from "../../contracts";
import type { WorkspaceOperations } from "./operations";

export const workspaceListSchema = z.object({
  status: z.literal("ok"),
  workspaces: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      slug: workspaceSlugSchema,
      kind: z.enum(["standard", "demo"]),
      demoExpiresAt: z.iso.datetime().nullable(),
      role: z.enum(["member", "program_manager", "reviewer", "committee_reader"]),
      administration: z.enum(["none", "administrator", "owner"]),
      canWorkOnGrants: z.boolean(),
      url: z.url(),
    }),
  ),
  grantedScopes: z.array(z.string()),
  nextCursor: z.string().nullable(),
});

export const presentWorkspaces = (
  result: Awaited<ReturnType<WorkspaceOperations["workspacesPage"]>>,
  actor: McpActor,
  origin: string,
) => ({
  status: "ok" as const,
  workspaces: result.value.map((workspace) => ({
    id: workspace.id,
    name: workspace.name,
    slug: workspace.slug,
    kind: workspace.kind,
    demoExpiresAt: workspace.demoExpiresAt,
    role: workspace.role,
    administration: workspace.administration,
    canWorkOnGrants: workspace.canWorkOnGrants,
    url: new URL(`/app/${workspace.slug}/${workspace.canWorkOnGrants ? "rounds" : "team"}`, origin)
      .href,
  })),
  grantedScopes: [...actor.scopes],
  nextCursor: result.nextCursor,
});
