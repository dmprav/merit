import { z } from "zod";

import { publicIdSchema } from "@merit/db/identifiers";
import { workspaceSlugSchema } from "@merit/organizations/api";

import { sourceDocumentRoles } from "../../domain/documents";

export type {
  ApplicationDocuments,
  DocumentCitation,
  DocumentSlot,
  DocumentVersion,
  SourceDocumentRole,
} from "../../domain/documents";

export const sourceDocumentRoleSchema = z.enum(sourceDocumentRoles);

const address = {
  workspaceSlug: workspaceSlugSchema,
  publicId: publicIdSchema,
};

const recorderSchema = z.strictObject({
  userId: z.string(),
  name: z.string(),
});

export const documentVersionSchema = z.strictObject({
  version: z.number().int().positive(),
  filename: z.string(),
  pageCount: z.number().int().positive(),
  byteSize: z.number().int().positive(),
  recorder: recorderSchema,
  recordedAt: z.iso.datetime(),
});

export const documentCitationSchema = z.strictObject({
  id: publicIdSchema,
  role: sourceDocumentRoleSchema,
  version: z.number().int().positive(),
  page: z.number().int().positive(),
  note: z.string().nullable(),
  recorder: recorderSchema,
  recordedAt: z.iso.datetime(),
  currentVersion: z.number().int().positive(),
});

export const documentSlotSchema = z.strictObject({
  currentVersion: z.number().int().positive().nullable(),
  versions: z.array(documentVersionSchema),
  citations: z.array(documentCitationSchema),
});

export const applicationDocumentsSchema = z.strictObject({
  proposal: documentSlotSchema,
  budget: documentSlotSchema,
});

export const listApplicationDocumentsInputSchema = z.strictObject(address);

export const attachApplicationDocumentInputSchema = z.strictObject({
  ...address,
  role: sourceDocumentRoleSchema,
  filename: z.string(),
  contentBase64: z.string(),
  expectedVersion: z.number().int().nonnegative(),
});

export const citeApplicationDocumentInputSchema = z.strictObject({
  ...address,
  role: sourceDocumentRoleSchema,
  version: z.number(),
  page: z.number(),
  note: z.string().optional(),
});

export const readApplicationDocumentFileInputSchema = z.strictObject({
  ...address,
  role: sourceDocumentRoleSchema,
  version: z.number().int().positive(),
});

export type ListApplicationDocumentsRequest = z.infer<typeof listApplicationDocumentsInputSchema>;

export type AttachApplicationDocumentRequest = z.infer<typeof attachApplicationDocumentInputSchema>;

export type CiteApplicationDocumentRequest = z.infer<typeof citeApplicationDocumentInputSchema>;

export type ReadApplicationDocumentFileRequest = z.infer<
  typeof readApplicationDocumentFileInputSchema
>;

export const applicationDocumentFileSchema = z.strictObject({
  status: z.literal("ok"),
  role: sourceDocumentRoleSchema,
  version: z.number().int().positive(),
  filename: z.string(),
  pageCount: z.number().int().positive(),
  byteSize: z.number().int().positive(),
  contentBase64: z.string(),
});

export type ApplicationDocumentFile = z.infer<typeof applicationDocumentFileSchema>;
