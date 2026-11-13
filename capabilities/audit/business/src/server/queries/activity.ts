import { readTransaction, type Database } from "@merit/db";

import { activityInputSchema, type ActivityInput } from "../../domain/activity";
import { readActivityEvents, readActivityPeople } from "../persistence/queries/activity";
import { auditPage } from "../persistence/queries/paging";

/** Trusted read integration. The caller authorizes the workspace and selected record types. */
export const readWorkspaceActivity = (
  db: Database,
  input: ActivityInput & { organizationId: string },
) =>
  readTransaction(db, async (tx) => {
    const { organizationId, ...filter } = input;
    const parsed = activityInputSchema.safeParse(filter);
    if (!parsed.success) {
      return { status: "invalid" } as const;
    }
    const request = parsed.data;
    const rows = await readActivityEvents(tx, organizationId, request);
    const { entries: events, nextCursor } = auditPage(rows, request.limit);
    // People are for choosing a filter, so only the first page carries them.
    const people = (
      request.after ? [] : await readActivityPeople(tx, organizationId, request.targetTypes)
    ).sort(
      (left, right) =>
        (left.name ?? "").localeCompare(right.name ?? "", "en") ||
        left.userId.localeCompare(right.userId, "en"),
    );
    return {
      status: "ok",
      events,
      people,
      nextCursor,
    } as const;
  });
