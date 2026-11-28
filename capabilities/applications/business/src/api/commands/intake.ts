import { z } from "zod";

import { publicIdSchema } from "@merit/db/identifiers";
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
  | "request_total_too_large"
  | "allocation_total_too_large";

const address = {
  workspaceSlug: workspaceSlugSchema,
  publicId: publicIdSchema,
};
export const createApplicationRequestSchema = z.strictObject({
  ...address,
  requestId: z.uuid(),
  title: intakeContentSchema.shape.title,
  applicant: intakeContentSchema.shape.applicant.optional(),
  requested: intakeContentSchema.shape.requested.optional(),
  pdfs: intakeContentSchema.shape.pdfs,
  answers: intakeContentSchema.shape.answers.optional(),
});
export const editApplicationRequestSchema = z
  .strictObject({
    ...address,
    expectedRevision: z.number().int().nonnegative().optional(),
    change: intakeChangeSchema,
  })
  .superRefine((request, ctx) => {
    if (request.change.action !== "details" && request.expectedRevision === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["expectedRevision"],
        message: "expectedRevision is required for this change.",
      });
    }
  });

export type CreateApplicationRequest = z.infer<typeof createApplicationRequestSchema>;

export type EditApplicationRequest = z.infer<typeof editApplicationRequestSchema>;
