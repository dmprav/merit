import { z } from "zod";

import { provenanceSchema } from "@merit/auth";
import { organizationProblemSchema } from "@merit/organizations/api";

export const teamErrorSchema = z.object({ status: organizationProblemSchema });
export const invitationWriteSchema = z.object({
  status: z.literal("ok"),
  value: z.object({ invitationId: z.uuid(), replacesInvitationId: z.uuid().optional() }),
});
export const memberWriteSchema = z.object({
  status: z.literal("ok"),
  value: z.object({
    userId: z.string(),
    membershipId: z.uuid(),
    membershipVersion: z.number().int().nonnegative().nullable(),
    removed: z.boolean(),
  }),
});
const subjectSchema = z.object({
  userId: z.string(),
  organizationId: z.string(),
  active: z.boolean(),
  administration: z.enum(["none", "administrator", "owner"]),
  role: z.enum(["member", "program_manager", "reviewer", "committee_reader"]),
});
export const teamOverviewSchema = z.object({
  status: z.literal("ok"),
  value: z.object({
    organization: z.object({
      name: z.string(),
      slug: z.string(),
      kind: z.enum(["standard", "demo"]),
    }),
    subject: subjectSchema,
    canManageMembers: z.boolean(),
  }),
});
export const memberPageSchema = z.object({
  status: z.literal("ok"),
  value: z.object({
    members: z.array(
      subjectSchema.extend({
        membershipId: z.string(),
        name: z.string().nullable(),
        email: z.string().nullable(),
        version: z.number().int().nonnegative(),
      }),
    ),
    nextCursor: z.string().nullable(),
  }),
});
export const invitationPageSchema = z.object({
  status: z.literal("ok"),
  value: z.object({
    invitations: z.array(
      z.object({
        id: z.string(),
        email: z.string(),
        administration: z.enum(["none", "administrator", "owner"]),
        role: z.enum(["member", "program_manager"]),
        expiresAt: z.iso.datetime(),
        delivery: z.enum(["pending", "sent", "failed"]),
        invitedBy: z.string().nullable(),
      }),
    ),
    nextCursor: z.string().nullable(),
  }),
});
export const teamHistoryPageSchema = z.object({
  status: z.literal("ok"),
  value: z.object({
    entries: z.array(
      z.object({
        eventId: z.string(),
        action: z.string(),
        actor: z.string().nullable(),
        provenance: provenanceSchema.nullable(),
        recordedAt: z.iso.datetime(),
      }),
    ),
    nextCursor: z.string().nullable(),
  }),
});
export const teamEventSchema = z.object({
  status: z.literal("ok"),
  value: z.object({
    format: z.literal("json"),
    content: z.string().max(16000),
    offset: z.number().int().nonnegative(),
    nextOffset: z.number().int().nonnegative().nullable(),
    totalCharacters: z.number().int().nonnegative(),
  }),
});
