import { z } from "zod";

import { workspaceSlugSchema, organizationIdInput, teamInput } from "./identifiers";

export const organizationName = z.string().trim().min(1).max(160);

export const invitationEmail = z.string().trim().toLowerCase().max(254).pipe(z.email());

export const accessRequestInput = z.strictObject({ email: invitationEmail });

export const createOrganizationInput = z.object({
  requestId: z.uuid(),
  name: organizationName,
  slug: workspaceSlugSchema,
  email: invitationEmail,
});

export const renameOrganizationInput = organizationIdInput.extend({ name: organizationName });

export const replaceInvitationInput = organizationIdInput.extend({ email: invitationEmail });

export const suggestSlug = (name: string) =>
  name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80)
    .replace(/-$/, "");

export const teamAccess = z.object({
  administration: z.enum(["none", "administrator"]),
  role: z.enum(["member", "program_manager"]),
});

export const inviteMemberInput = teamInput
  .extend({
    requestId: z.uuid(),
    email: invitationEmail,
    ...teamAccess.shape,
  })
  .refine((value) => value.administration !== "none" || value.role === "program_manager", {
    message: "Choose at least one responsibility.",
  });

export const teamInvitationInput = teamInput.extend({ invitationId: z.uuid() });

export const memberInput = teamInput.extend({
  userId: z.string().min(1),
  expectedMembershipId: z.uuid(),
  expectedVersion: z.number().int().min(0),
  expectedInvitationIds: z.array(z.string()),
});

export const changeMemberInput = memberInput.extend(teamAccess.shape);

export type RequestAccessResult = { status: "ok" | "limited" | "invalid_input" | "unavailable" };

export type MemberChange = {
  userId: string;
  membershipId: string;
  membershipVersion: number | null;
  removed: boolean;
};
