import { z } from "zod";

import type { OrganizationSubject } from "@merit/access";
import { auditPageInput } from "@merit/audit/api";
import type { Provenance } from "@merit/auth";

import { workspaceSlugSchema } from "./identifiers";
import type { Organization } from "./records";

/** Initial onboarding status, independent of the email sender's delivery outcome. */
export const administratorInvitationState = (
  invitation: {
    acceptedAt: Date | string | null;
    revokedAt?: Date | string | null;
    expiresAt: Date | string;
  } | null,
  now: Date,
  hasOwner = false,
) => {
  if (hasOwner) {
    return "joined";
  }
  if (!invitation || invitation.revokedAt) {
    return "needsAdmin";
  }
  if (invitation.acceptedAt) {
    return "joined";
  }

  return new Date(invitation.expiresAt) <= now ? "expired" : "pending";
};

export type Team = {
  organization: Organization;
  subject: OrganizationSubject;
  members: (OrganizationSubject & {
    membershipId: string;
    name: string | null;
    email: string | null;
    version: number;
  })[];
  invitations: {
    id: string;
    email: string;
    administration: "none" | "administrator" | "owner";
    role: "member" | "program_manager";
    expiresAt: Date;
    delivery: "pending" | "sent" | "failed";
    invitedBy: string | null;
  }[];
};

export const workspacePageInput = z.strictObject({
  after: z.string().min(1).max(100).optional(),
  limit: z.number().int().min(1).max(50).default(20),
});

export const teamPageInput = workspacePageInput.extend({
  workspaceSlug: workspaceSlugSchema,
  after: z.uuid().optional(),
});

export const invitationPageInput = teamPageInput.extend({
  issuedBy: z.string().min(1).max(100).optional(),
});

export const teamEventInput = z.strictObject({
  workspaceSlug: workspaceSlugSchema,
  eventId: z.uuid(),
  offset: z.number().int().min(0).max(2147483646).default(0),
  length: z.number().int().min(1).max(8000).default(8000),
});

export type OrganizationSummary = {
  id: string;
  name: string;
  slug: string;
  hasOwner: boolean;
  invitation: {
    organizationId: string;
    email: string;
    acceptedAt: Date | null;
    expiresAt: Date;
    delivery: "pending" | "sent" | "failed";
  } | null;
};

export type OrganizationDetails = Omit<OrganizationSummary, "invitation"> & {
  owner: { name: string | null } | null;
  invitation: {
    id: string;
    email: string;
    createdAt: Date;
    expiresAt: Date;
    acceptedAt: Date | null;
    revokedAt: Date | null;
    delivery: "pending" | "sent" | "failed";
  } | null;
};

export type InvitationDetails = {
  organization: Organization;
  accepted: boolean;
  administration: "none" | "administrator" | "owner";
  role: "member" | "program_manager";
};

export type Workspace = {
  id: string;
  name: string;
  slug: string;
  kind: "standard" | "demo";
  demoExpiresAt: string | null;
  role: OrganizationSubject["role"];
  administration: OrganizationSubject["administration"];
  canWorkOnGrants: boolean;
};

export type TeamOverview = {
  organization: Pick<Organization, "name" | "slug" | "kind">;
  subject: OrganizationSubject;
  canManageMembers: boolean;
};

export type MemberPage = { members: Team["members"]; nextCursor: string | null };

export type InvitationPage = {
  invitations: (Omit<Team["invitations"][number], "expiresAt"> & { expiresAt: string })[];
  nextCursor: string | null;
};

export type TeamHistoryPage = {
  entries: {
    eventId: string;
    action: string;
    actor: string | null;
    provenance: Provenance | null;
    recordedAt: string;
    details: z.infer<ReturnType<typeof z.json>>;
  }[];
  nextCursor: string | null;
};

export type TeamEventContent = {
  content: string;
  totalCharacters: number;
  format: "json";
  offset: number;
  nextOffset: number | null;
};

export const teamHistoryInput = auditPageInput.extend({ workspaceSlug: workspaceSlugSchema });
