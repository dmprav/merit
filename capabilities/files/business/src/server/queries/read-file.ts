import type { z } from "zod";

import type { Actor } from "@merit/auth";
import type { Database } from "@merit/db";
import { readWorkspace } from "@merit/organizations/transactions";

import { readFileInput, type FileObjects } from "../../api/files";
import { hashFileBytes } from "../persistence/content";
import { findFile } from "../persistence/queries/files";

export const readFile = async (
  db: Database,
  objects: FileObjects,
  actor: Actor,
  input: z.input<typeof readFileInput>,
) => {
  const { workspaceSlug, fileId } = readFileInput.parse(input);
  const file = await readWorkspace(db, actor.userId, workspaceSlug, (tx) =>
    findFile(tx, actor.userId, workspaceSlug, fileId),
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
