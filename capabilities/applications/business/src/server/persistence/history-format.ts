import { z } from "zod";

// Frozen initial storage contract. Do not derive from live models.
const version = z.number().int().positive();
const date = z.iso.date().regex(/^(?!0000)/);
const amount = z.strictObject({
  minorUnits: z.string().regex(/^(?:0|[1-9]\d{0,29})$/),
  currency: z.literal("EUR"),
});
const answers = z
  .array(z.object({ questionId: z.uuid(), question: z.string(), response: z.string() }))
  .refine(
    (items) => new Set(items.map((item) => item.questionId)).size === items.length,
    "Question IDs must be unique.",
  );
const application = z.object({
  id: z.string(),
  title: z.string(),
  version: version.brand<"MaterialVersion">(),
  requested: amount.nullable(),
  intakeStatus: z.enum(["in_preparation", "ready"]),
  withdrawal: z
    .object({
      withdrawnOn: date,
      reason: z.string(),
      recorder: z.object({ userId: z.string(), name: z.string(), recordedAt: z.string() }),
    })
    .optional(),
  summaryAuthor: z
    .object({ name: z.string(), userId: z.string(), recordedAt: z.string() })
    .optional(),
  summary: z.string(),
  contactId: z.string().nullable(),
  attention: z.array(z.string()),
  submission: z
    .object({
      version,
      organization: z.string().optional(),
      submittedOn: date.optional(),
      projectPeriod: z.string().optional(),
      answers,
      contact: z.string().optional(),
      contactEmail: z.string().optional(),
    })
    .optional(),
  evidence: z.array(z.object({ version, passage: z.string() })),
});

export const applicationHistorySchema = z.object({
  formatVersion: z.literal(1),
  application,
  workingRevision: z
    .object({
      kind: z.enum(["correction", "revision"]),
      reason: z.string(),
      content: z.object({
        title: z.string(),
        applicant: z.string(),
        projectPeriod: z.string().optional(),
        requested: z.string(),
        answers,
      }),
    })
    .nullable(),
});
