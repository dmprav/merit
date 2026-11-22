import { createHash, randomUUID } from "node:crypto";

import { z } from "zod";

const maxFileBytes = 25 * 1024 * 1024;
const fileBytes = z
  .instanceof(Uint8Array)
  .refine((bytes) => bytes.byteLength <= maxFileBytes, "File exceeds 25 MiB.");
export const fileObjectKey = z
  .string()
  .regex(/^files\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
export const fileByteLength = z.int().min(0).max(maxFileBytes);

const fileReference = z.object({
  objectKey: fileObjectKey,
  byteLength: fileByteLength,
  sha256: z.string().regex(/^[0-9a-f]{64}$/u),
});

export type FileReference = z.infer<typeof fileReference>;

export type FileObjects = {
  put(key: string, bytes: Uint8Array<ArrayBuffer>, sha256: string): Promise<void>;
  get(key: string, byteLength: number): Promise<Uint8Array<ArrayBuffer>>;
};

const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

export const createFileStorage = (objects: FileObjects) => ({
  /** Creates an immutable object. Its owner persists the returned reference with the attachment. */
  async writeFile(bytes: Uint8Array): Promise<FileReference> {
    const body = new Uint8Array(fileBytes.parse(bytes));
    const reference = {
      objectKey: `files/${randomUUID()}`,
      byteLength: body.byteLength,
      sha256: digest(body),
    };
    await objects.put(reference.objectKey, body, reference.sha256);
    return reference;
  },

  /** Read a reference resolved from the owner's authorized attachment record. */
  async readFile(reference: FileReference) {
    const { objectKey, byteLength, sha256 } = fileReference.parse(reference);
    const bytes = await objects.get(objectKey, byteLength);
    if (bytes.byteLength !== byteLength || digest(bytes) !== sha256) {
      throw new Error("Stored file content does not match its reference.");
    }
    return bytes;
  },
});
