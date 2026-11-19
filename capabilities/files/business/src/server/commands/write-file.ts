import type { z } from "zod";

import type { Actor } from "@merit/auth";
import type { Database } from "@merit/db";
import { lockGrantWorkspace } from "@merit/organizations/locks";
import { writeWorkspace } from "@merit/organizations/transactions";

import { writeFileInput, type FileObjects } from "../../api/files";
import { claimFile } from "../persistence/commands/files";
import { hashFileBytes } from "../persistence/content";

export const writeFile = (
  db: Database,
  objects: FileObjects,
  actor: Actor,
  input: z.input<typeof writeFileInput>,
) => {
  const { workspaceSlug, requestId, originalFilename, mimeType, bytes } =
    writeFileInput.parse(input);
  // The caller can reuse its buffer while authorization and I/O are in flight.
  const body = new Uint8Array(bytes);
  return writeWorkspace(db, actor.userId, workspaceSlug, async (tx) => {
    const access = await lockGrantWorkspace(tx, actor.userId, workspaceSlug, "share");
    if (!access) {
      return { status: "not_found" } as const;
    }

    const sha256 = await hashFileBytes(body);
    const claim = await claimFile(tx, {
      organizationId: access.organization.id,
      requestId,
      originalFilename,
      mimeType,
      byteLength: body.byteLength,
      sha256,
      uploadedBy: access.actor.userId,
    });
    if (claim.status === "conflict") {
      return claim;
    }
    if (claim.status === "created") {
      await objects.put(claim.file.objectKey, body, sha256);
    }
    return { status: "ok", file: claim.file } as const;
  });
};
