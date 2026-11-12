import { z } from "zod";

import { workspaceSlugSchema } from "@merit/organizations/api";

import {
  intakeChangeSchema,
  intakeContentSchema,
  type IntakeChangeError,
} from "../../domain/intake";

export type IntakeSaveError =
  | IntakeChangeError
  | "invalid_application"
  | "contact_unavailable"
  | "request_total_too_large";

const address = {
  workspaceSlug: workspaceSlugSchema,
  publicId: z.string().regex(/^[0-9a-hjkmnp-tv-z]{12}$/),
};
export const createApplicationRequestSchema = z.strictObject({
  ...address,
  requestId: z.uuid(),
  title: intakeContentSchema.shape.title,
  applicant: intakeContentSchema.shape.applicant.optional(),
  requested: intakeContentSchema.shape.requested.optional(),
  answers: intakeContentSchema.shape.answers.optional(),
});
export const editApplicationRequestSchema = z.strictObject({
  ...address,
  expectedRevision: z.number().int().nonnegative(),
  change: intakeChangeSchema,
});

export type CreateApplicationRequest = z.infer<typeof createApplicationRequestSchema>;

export type EditApplicationRequest = z.infer<typeof editApplicationRequestSchema>;
