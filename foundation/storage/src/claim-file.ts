import { and, eq } from "drizzle-orm";

import type { Transaction } from "@merit/db";

import { workspaceFiles } from "./schema";

export const claimFile = async (tx: Transaction, input: typeof workspaceFiles.$inferInsert) => {
  const [created] = await tx
    .insert(workspaceFiles)
    .values(input)
    .onConflictDoNothing({
      target: [workspaceFiles.organizationId, workspaceFiles.requestId],
    })
    .returning();
  if (created) {
    return { status: "created", file: created } as const;
  }

  const [previous] = await tx
    .select()
    .from(workspaceFiles)
    .where(
      and(
        eq(workspaceFiles.organizationId, input.organizationId),
        eq(workspaceFiles.requestId, input.requestId),
      ),
    );
  if (
    previous &&
    previous.uploadedBy === input.uploadedBy &&
    previous.sha256 === input.sha256 &&
    previous.originalFilename === input.originalFilename &&
    previous.mimeType === input.mimeType
  ) {
    return { status: "replay", file: previous } as const;
  }
  return { status: "conflict" } as const;
};
