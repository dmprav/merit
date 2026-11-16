import type { Actor } from "@merit/auth";
import { readTransaction, type Database } from "@merit/db";

import {
  workspaceApplicationsInput,
  workspaceApplicationsPageSize,
  applicationOverviewSchema,
  type WorkspaceApplicationsInput,
} from "../../api/queries/application-overview";
import { readApplicationOverviews } from "../persistence/queries/application-overview";
import { readGrantWorkspaceAccess } from "../persistence/queries/reading";

export const listWorkspaceApplications = (
  db: Database,
  actor: Actor,
  input: WorkspaceApplicationsInput,
) =>
  readTransaction(db, async (tx) => {
    const parsed = workspaceApplicationsInput.safeParse(input);
    if (!parsed.success) {
      return { status: "not_found" } as const;
    }
    const access = await readGrantWorkspaceAccess(tx, actor.userId, parsed.data.workspaceSlug);
    if (!access) {
      return { status: "not_found" } as const;
    }
    if (!access.allowed) {
      return { status: "forbidden" } as const;
    }
    const page = await readApplicationOverviews(
      tx,
      actor.userId,
      parsed.data,
      workspaceApplicationsPageSize,
    );
    return {
      status: "ok",
      ...page,
      applications: page.applications.map((row) =>
        applicationOverviewSchema.parse({ ...row, criteriaChanged: row.reviews.criteriaChanged }),
      ),
    } as const;
  });
