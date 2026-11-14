import { z } from "zod";

import { calendarDateSchema } from "@merit/dates";
import { moneySchema, isNegative } from "@merit/money";

import { materialVersionSchema } from "./versions";

const amount = moneySchema.refine((value) => !isNegative(value), "Amount must be nonnegative");
const version = z.number().int().positive();
export const applicationMaterialSchema = z.object({
  title: z.string(),
  version: materialVersionSchema,
  requested: amount.nullable(),
  submission: z
    .object({
      version,
      organization: z.string().optional(),
      submittedOn: calendarDateSchema.optional(),
      projectPeriod: z.string().optional(),
      answers: z
        .array(z.object({ questionId: z.uuid(), question: z.string(), response: z.string() }))
        .refine(
          (answers) => new Set(answers.map((answer) => answer.questionId)).size === answers.length,
          "Question IDs must be unique.",
        ),
    })
    .optional(),
  evidence: z.array(z.object({ version, passage: z.string() })),
});

export const applicationWithdrawalSchema = z.object({
  withdrawnOn: calendarDateSchema,
  reason: z.string(),
  recorder: z.object({ userId: z.string(), name: z.string(), recordedAt: z.string() }),
});

export type ApplicationWithdrawal = z.infer<typeof applicationWithdrawalSchema>;

export const applicationCaseSchema = z.object({
  id: z.string(),
  intakeStatus: z.enum(["in_preparation", "ready"]),
  // Withdrawal is orthogonal to readiness: the retained intake status and working revision
  // return unchanged on reinstatement.
  withdrawal: applicationWithdrawalSchema.optional(),
  summaryAuthor: z
    .object({ name: z.string(), userId: z.string(), recordedAt: z.string() })
    .optional(),
  summary: z.string(),
  contactId: z.string().nullable(),
  attention: z.array(z.string()),
});

export const intakeApplicationSchema = applicationCaseSchema.extend({
  ...applicationMaterialSchema.shape,
  submission: applicationMaterialSchema.shape.submission
    .unwrap()
    .extend({ contact: z.string().optional(), contactEmail: z.string().optional() })
    .optional(),
});

export type ApplicationMaterial = z.infer<typeof applicationMaterialSchema>;

export type IntakeApplication = z.infer<typeof intakeApplicationSchema>;

/** The one business predicate for work that no longer counts or accepts changes. */
export const isWithdrawn = (application: Pick<IntakeApplication, "withdrawal">) =>
  application.withdrawal !== undefined;

export type ApplicationUsage = { hasReviews: boolean; hasRecommendation: boolean };
