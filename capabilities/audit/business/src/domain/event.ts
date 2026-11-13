import { z } from "zod";

import { provenanceSchema } from "@merit/auth";

const identifier = z.string().trim().min(1).max(200);

const auditTargetSchema = z.strictObject({
  type: identifier,
  id: identifier,
  revision: z.number().int().nonnegative().nullable(),
});

export const auditRecordSchema = z.strictObject({
  organizationId: identifier,
  actor: z.strictObject({
    userId: identifier,
    name: z.string().nullable(),
    provenance: provenanceSchema,
  }),
  action: z
    .string()
    .regex(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/)
    .max(128),
  target: auditTargetSchema,
});

export type AuditRecord = z.infer<typeof auditRecordSchema>;
