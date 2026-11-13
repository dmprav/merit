import type { Actor } from "@merit/auth";
import { readTransaction, type Database } from "@merit/db";
import { workspaceSlugSchema } from "@merit/organizations/api";

import {
  activityInputSchema,
  decodeActivityCursor,
  encodeActivityCursor,
  type ActivityInput,
} from "../../domain/activity";
import {
  readActivityAccess,
  readActivityEvents,
  readActivityPeople,
} from "../persistence/queries/activity";

/** Newest-first events for current program managers. Capabilities resolve record titles
 * and membership; audit carries only the compact event and the recorded person. */
export const readWorkspaceActivity = (
  db: Database,
  actor: Actor,
  input: ActivityInput & { workspaceSlug: string },
) =>
  readTransaction(db, async (tx) => {
    const { workspaceSlug, ...filter } = input;
    const parsed = activityInputSchema.safeParse(filter);
    if (!parsed.success) {
      return { status: "invalid" } as const;
    }
    const request = parsed.data;
    const access = await readActivityAccess(
      tx,
      actor.userId,
      workspaceSlugSchema.parse(workspaceSlug),
    );
    if (!access) {
      return { status: "not_found" } as const;
    }
    if (!access.allowed) {
      return { status: "forbidden" } as const;
    }

    const rows = await readActivityEvents(tx, access.organizationId, {
      ...request,
      after: request.after ? decodeActivityCursor(request.after) : null,
    });
    const events = rows.slice(0, request.limit);
    const last = events.at(-1);
    // People are for choosing a filter, so only the first page carries them.
    const people = (request.after ? [] : await readActivityPeople(tx, access.organizationId)).sort(
      (left, right) =>
        (left.name ?? "").localeCompare(right.name ?? "", "en") ||
        left.userId.localeCompare(right.userId, "en"),
    );
    return {
      status: "ok",
      events,
      people,
      nextCursor:
        rows.length > request.limit && last
          ? encodeActivityCursor({ recordedAt: last.recordedAt, id: last.id })
          : null,
    } as const;
  });
