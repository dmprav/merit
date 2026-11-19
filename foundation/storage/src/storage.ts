import type { z } from "zod";

import type { Transaction } from "@merit/db";

import { writeFileInput, type FileObjects } from "./api/files";
import { claimFile } from "./claim-file";
import type { workspaceFiles } from "./schema";

export type { FileObjects } from "./api/files";

type StoredFile = typeof workspaceFiles.$inferSelect;

const hashBytes = async (bytes: Uint8Array<ArrayBuffer>) =>
  Buffer.from(await crypto.subtle.digest("SHA-256", bytes)).toString("hex");

export const createFileStorage = (objects: FileObjects) => ({
  /** Call after authorizing the resource. Await each write in the transaction before starting the next. */
  async writeFile(
    tx: Transaction,
    { organizationId, uploadedBy }: Pick<StoredFile, "organizationId" | "uploadedBy">,
    input: z.input<typeof writeFileInput>,
  ) {
    const { requestId, originalFilename, mimeType, bytes } = writeFileInput.parse(input);
    const body = new Uint8Array(bytes);
    const sha256 = await hashBytes(body);
    // Roll back the receipt even when the owner handles an upload failure inside its transaction.
    return tx.transaction(async (savepoint) => {
      const claim = await claimFile(savepoint, {
        organizationId,
        uploadedBy,
        requestId,
        originalFilename,
        mimeType,
        byteLength: body.byteLength,
        sha256,
      });
      if (claim.status === "conflict") {
        return claim;
      }
      if (claim.status === "created") {
        await objects.put(claim.file.objectKey, body, sha256);
      }
      return { status: "ok", file: claim.file } as const;
    });
  },

  /** Supply the persisted row selected through the authorized attachment. */
  async readFile(file: StoredFile) {
    const bytes = await objects.get(file.objectKey, file.byteLength);
    if (bytes.byteLength !== file.byteLength || (await hashBytes(bytes)) !== file.sha256) {
      throw new Error("Stored file content does not match its metadata.");
    }
    return bytes;
  },
});
