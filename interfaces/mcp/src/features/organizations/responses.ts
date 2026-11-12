import { z } from "zod";

import type {
  Organization,
  OrganizationSummary,
  OrganizationDetails,
  AccessRequest,
} from "@merit/organizations/api";

const delivery = z.enum(["pending", "sent", "failed"]);
export const organizationSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  kind: z.enum(["standard", "demo"]),
  demoExpiresAt: z.iso.datetime().nullable(),
  demoSeedVersion: z.number().nullable(),
});
export const organizationSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  hasOwner: z.boolean(),
  invitation: z
    .object({
      organizationId: z.string(),
      email: z.string(),
      acceptedAt: z.iso.datetime().nullable(),
      expiresAt: z.iso.datetime(),
      delivery,
    })
    .nullable(),
});
export const organizationDetailsSchema = organizationSummarySchema.extend({
  owner: z.object({ name: z.string().nullable() }).nullable(),
  invitation: z
    .object({
      id: z.string(),
      email: z.string(),
      createdAt: z.iso.datetime(),
      expiresAt: z.iso.datetime(),
      acceptedAt: z.iso.datetime().nullable(),
      revokedAt: z.iso.datetime().nullable(),
      delivery,
    })
    .nullable(),
});
export const invitationSchema = z.object({
  organization: organizationSchema,
  accepted: z.boolean(),
  administration: z.enum(["none", "administrator", "owner"]),
  role: z.enum(["member", "program_manager"]),
});
export const accessRequestSchema = z.object({
  email: z.string(),
  requestedAt: z.iso.datetime(),
  reviewedAt: z.iso.datetime().nullable(),
  reviewedBy: z.string().nullable(),
});

export const presentOrganization = (value: Organization) => ({
  ...value,
  demoExpiresAt: value.demoExpiresAt?.toISOString() ?? null,
});

export const presentOrganizationSummary = (value: OrganizationSummary) => ({
  ...value,
  invitation: value.invitation && {
    ...value.invitation,
    acceptedAt: value.invitation.acceptedAt?.toISOString() ?? null,
    expiresAt: value.invitation.expiresAt.toISOString(),
  },
});

export const presentOrganizationDetails = (value: OrganizationDetails) => ({
  ...value,
  invitation: value.invitation && {
    ...value.invitation,
    createdAt: value.invitation.createdAt.toISOString(),
    expiresAt: value.invitation.expiresAt.toISOString(),
    acceptedAt: value.invitation.acceptedAt?.toISOString() ?? null,
    revokedAt: value.invitation.revokedAt?.toISOString() ?? null,
  },
});

export const presentAccessRequest = (value: AccessRequest) => ({
  ...value,
  requestedAt: value.requestedAt.toISOString(),
  reviewedAt: value.reviewedAt?.toISOString() ?? null,
});
