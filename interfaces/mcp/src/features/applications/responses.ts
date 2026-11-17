import { z } from "zod";

import { applicationDocumentsSchema, sourceDocumentRoleSchema } from "@merit/applications/api";
import { publicIdSchema } from "@merit/db/identifiers";

export const applicationCreatedSchema = z.object({
  status: z.literal("ok"),
  applicationId: publicIdSchema,
});
export const applicationSavedSchema = z.object({
  status: z.literal("ok"),
  applicationId: publicIdSchema,
  intakeRevision: z.number().int().nonnegative(),
});

export const applicationDocumentsResultSchema = z.object({
  status: z.literal("ok"),
  documents: applicationDocumentsSchema,
});

export const attachedDocumentSchema = z.object({
  status: z.literal("ok"),
  version: z.number().int().positive(),
});

export const citedDocumentSchema = z.object({
  status: z.literal("ok"),
  citationId: publicIdSchema,
});

export const applicationDocumentFileSchema = z.object({
  status: z.literal("ok"),
  role: sourceDocumentRoleSchema,
  version: z.number().int().positive(),
  filename: z.string(),
  pageCount: z.number().int().positive(),
  byteSize: z.number().int().positive(),
  contentBase64: z.string(),
});

export const documentReadErrorSchema = z.union([
  z.object({ status: z.literal("not_found") }),
  z.object({ status: z.literal("invalid"), error: z.string().min(1) }),
]);
