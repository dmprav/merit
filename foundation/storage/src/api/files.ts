import { z } from "zod";

const metadataText = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[^\p{Cc}\p{Cs}]+$/u);
const maxFileBytes = 25 * 1024 * 1024;

export const writeFileInput = z.strictObject({
  requestId: z.uuid(),
  originalFilename: metadataText,
  mimeType: metadataText.regex(/^[^\s/;]+\/[^\s/;]+(?: *;.+)?$/u),
  bytes: z
    .instanceof(Uint8Array)
    .refine((bytes) => bytes.byteLength <= maxFileBytes, "File exceeds 25 MiB."),
});

export type FileObjects = {
  put(key: string, bytes: Uint8Array<ArrayBuffer>, sha256: string): Promise<void>;
  get(key: string, byteLength: number): Promise<Uint8Array<ArrayBuffer>>;
};
