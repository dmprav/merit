import { eq } from "drizzle-orm";

import { applicationCases } from "@merit/applications/schema";
import type { Transaction } from "@merit/db";
import { authorizedWorkspaces } from "@merit/organizations/scope";

/** The workspace of an application, only when the actor works on grants there. */
export const readAiReviewWorkspace = async (
  db: Transaction,
  userId: string,
  workspaceSlug: string,
  caseId: string,
) => {
  const workspace = authorizedWorkspaces(db, userId, "work_on_grants", workspaceSlug);
  const [row] = await db
    .select({ organizationId: workspace.id })
    .from(applicationCases)
    .innerJoin(workspace, eq(workspace.id, applicationCases.organizationId))
    .where(eq(applicationCases.id, caseId));
  return row;
};
