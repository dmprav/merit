import type { z } from "zod";

import type { Actor } from "@merit/auth";
import type { DatabaseRunner } from "@merit/db";
import { readWorkspace } from "@merit/organizations/transactions";

import { readFileInput, type FileObjects } from "../../api/files";
import { hashFileBytes } from "../persistence/content";
import { findFile } from "../persistence/queries/files";

export const readFile = async (
  database: DatabaseRunner,
  objects: FileObjects,
  { userId }: Actor,
  input: z.input<typeof readFileInput>,
) => {
  const { workspaceSlug, fileId } = readFileInput.parse(input);
  const file = await database((db) =>
    readWorkspace(db, userId, workspaceSlug, (tx) => findFile(tx, userId, workspaceSlug, fileId)),
  );
  if (!file) {
    return { status: "not_found" } as const;
  }
  const bytes = await objects.get(file.objectKey, file.byteLength);
  if (bytes.byteLength !== file.byteLength || (await hashFileBytes(bytes)) !== file.sha256) {
    throw new Error("Stored file content does not match its metadata.");
  }
  return { status: "ok", file, bytes } as const;
};
