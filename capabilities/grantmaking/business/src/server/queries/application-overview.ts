import type { Actor } from "@merit/auth";
import type { Database } from "@merit/db";
import { readWorkspace } from "@merit/organizations/transactions";

import {
  workspaceApplicationsInput,
  workspaceApplicationsPageSize,
  applicationOverviewSchema,
  type WorkspaceApplicationsInput,
} from "../../api/queries/application-overview";
import { readApplicationOverviews } from "../persistence/queries/application-overview";

export const listWorkspaceApplications = (
  db: Database,
  actor: Actor,
  input: WorkspaceApplicationsInput,
) =>
  readWorkspace(db, actor.userId, input?.workspaceSlug, async (tx) => {
    const parsed = workspaceApplicationsInput.safeParse(input);
    if (!parsed.success) {
      return { status: "not_found" } as const;
    }
    const page = await readApplicationOverviews(
      tx,
      actor.userId,
      parsed.data,
      workspaceApplicationsPageSize,
    );
    if (!page) {
      return { status: "not_found" } as const;
    }
    if (!page.allowed) {
      return { status: "forbidden" } as const;
    }
    return {
      status: "ok",
      total: page.total,
      matching: page.matching,
      offset: page.offset,
      applications: page.applications.map((row) => applicationOverviewSchema.parse(row)),
    } as const;
  });
