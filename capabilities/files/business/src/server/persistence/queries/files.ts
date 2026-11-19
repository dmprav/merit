import { eq } from "drizzle-orm";

import type { Transaction } from "@merit/db";
import { authorizedWorkspaces } from "@merit/organizations/scope";

import { workspaceFiles } from "../schema";

export const findFile = async (tx: Transaction, userId: string, slug: string, fileId: string) => {
  const workspace = authorizedWorkspaces(tx, userId, "work_on_grants", slug);
  const [result] = await tx
    .select({ file: workspaceFiles })
    .from(workspaceFiles)
    .innerJoin(workspace, eq(workspaceFiles.organizationId, workspace.id))
    .where(eq(workspaceFiles.id, fileId));
  return result?.file;
};
