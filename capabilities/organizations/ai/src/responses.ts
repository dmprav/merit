import { z } from "zod";

import { cursorPage } from "@merit/ai/contracts";
import { teamPageInput, workspacePageInput, workspaceSlugSchema } from "@merit/organizations/api";

import type { WorkspaceOperations } from "./operations";

const subjectSchema = z.object({
  userId: z.string(),
  organizationId: z.string(),
  active: z.boolean(),
  administration: z.enum(["none", "administrator", "owner"]),
  role: z.enum(["member", "program_manager", "reviewer", "committee_reader"]),
});
export const memberPageSchema = z.object({
  status: z.literal("ok"),
  members: z.array(
    subjectSchema.extend({
      membershipId: z.string(),
      name: z.string().nullable(),
      email: z.string().nullable(),
      version: z.number().int().nonnegative(),
    }),
  ),
  nextPage: teamPageInput.required({ after: true }).nullable(),
});

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
      canViewTeam: z.boolean(),
      url: z.url(),
    }),
  ),
  nextPage: workspacePageInput.required({ after: true }).nullable(),
});

export const presentWorkspaces = (
  input: z.output<typeof workspacePageInput>,
  result: Awaited<ReturnType<WorkspaceOperations["workspacesPage"]>>,
  workspaceHomeUrl: WorkspaceOperations["workspaceHomeUrl"],
) =>
  cursorPage(input, {
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
      canViewTeam: workspace.canViewTeam,
      url: workspaceHomeUrl(workspace),
    })),
    nextCursor: result.nextCursor,
  });
