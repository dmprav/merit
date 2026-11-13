import { z } from "zod";

import { provenanceSchema } from "@merit/auth";

const identifier = z.string().trim().min(1).max(200);

const auditTargetSchema = z.strictObject({
  type: identifier,
  id: identifier,
  revision: z.number().int().nonnegative().nullable(),
  name: z.string().optional(),
});

export const auditRecordSchema = z.strictObject({
  organizationId: identifier,
  actor: z.strictObject({
    userId: identifier,
    name: z.string().nullable().optional(),
    provenance: provenanceSchema.nullable(),
  }),
  action: z
    .string()
    .regex(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/)
    .max(128),
  target: auditTargetSchema,
  context: z
    .strictObject({
      roundId: identifier.nullable().optional(),
      applicationId: identifier.nullable().optional(),
      assignmentId: identifier.nullable().optional(),
    })
    .optional(),
  /** Owned and validated by the recording capability; never selected for an activity page. */
  details: z.record(z.string(), z.unknown()).optional(),
  recordedAt: z.date().optional(),
  formatVersion: z.number().int().positive().optional(),
});

export type AuditRecord = z.infer<typeof auditRecordSchema>;
