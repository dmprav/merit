import { z } from "zod";

import { workspaceSlugSchema } from "@merit/organizations/api";

const metadataText = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[^\p{Cc}]+$/u);
const maxFileBytes = 25 * 1024 * 1024;

export const writeFileInput = z.strictObject({
  workspaceSlug: workspaceSlugSchema,
  requestId: z.uuid(),
  originalFilename: metadataText,
  mimeType: metadataText.regex(/^[^\s/;]+\/[^\s/;]+(?: *;.+)?$/u),
  bytes: z
    .instanceof(Uint8Array)
    .refine((bytes) => bytes.byteLength <= maxFileBytes, "File exceeds 25 MiB."),
});

export const readFileInput = z.strictObject({
  workspaceSlug: workspaceSlugSchema,
  fileId: z.uuid(),
});

export type FileObjects = {
  put(key: string, bytes: Uint8Array<ArrayBuffer>, sha256: string): Promise<void>;
  get(key: string, byteLength: number): Promise<Uint8Array<ArrayBuffer>>;
};
