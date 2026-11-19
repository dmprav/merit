import { z } from "zod";

import { publicIdSchema } from "@merit/db/identifiers";
import { isNegative, parseMoney } from "@merit/money";
import { workspaceSlugSchema } from "@merit/organizations/api";

import {
  roundChangeSchema,
  roundTitleSchema,
  type prepareRoundChange,
} from "../../domain/preparation";

export type PreparationSaveError =
  | Extract<ReturnType<typeof prepareRoundChange>, { ok: false }>["error"]
  | "invalid_round"
  | "manager_unavailable"
  | "round_not_empty";

export const createRoundRequestSchema = z.strictObject({
  workspaceSlug: workspaceSlugSchema,
  requestId: z.uuid(),
  title: roundTitleSchema,
  purpose: roundChangeSchema.options[0].shape.purpose.optional(),
  meetingDate: roundChangeSchema.options[0].shape.meetingDate.optional(),
  budget: z
    .string()
    .trim()
    .max(32)
    .refine((value) => {
      if (!value) {
        return true;
      }
      const parsed = parseMoney(value);
      return parsed.ok && !isNegative(parsed.value);
    }, "Enter a nonnegative amount with at most two decimal places.")
    .optional(),
});
export const editRoundInputSchema = z.strictObject({
  workspaceSlug: workspaceSlugSchema,
  publicId: publicIdSchema,
  expectedRevision: z.number().int().nonnegative().optional(),
  change: roundChangeSchema,
});
export const editRoundRequestSchema = editRoundInputSchema.superRefine((request, ctx) => {
  const needsRevision =
    request.change.section === "criteria" ||
    request.change.section === "budget" ||
    (request.change.section === "details" && request.change.purpose !== undefined);
  if (needsRevision && request.expectedRevision === undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["expectedRevision"],
      message: "expectedRevision is required for this change.",
    });
  }
});
export const deleteRoundRequestSchema = z.strictObject({
  workspaceSlug: workspaceSlugSchema,
  publicId: publicIdSchema,
  expectedRevision: z.number().int().nonnegative(),
});

export type CreateRoundRequest = z.infer<typeof createRoundRequestSchema>;

export type EditRoundRequest = z.infer<typeof editRoundRequestSchema>;

export type DeleteRoundRequest = z.infer<typeof deleteRoundRequestSchema>;
