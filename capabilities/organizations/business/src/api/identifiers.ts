import { z } from "zod";

export const workspaceSlugSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  .refine((value) => !["sign-in", "organizations"].includes(value), {
    params: { reason: "reserved_workspace_slug" },
  });

export const organizationIdInput = z.object({ organizationId: z.string().min(1).max(100) });

export const invitationTokenInput = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) });

export const teamInput = z.object({ workspaceSlug: workspaceSlugSchema });
