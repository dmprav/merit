import type { z } from "zod";

import { readWorkspaceActivity } from "@merit/audit/server/read";
import type { Actor } from "@merit/auth";
import { readTransaction, type Database } from "@merit/db";

import {
  workspaceActivityInput,
  workspaceActivitySchema,
  type ActivityEntry,
} from "../../api/queries/activity";
import { readActivityRecords } from "../persistence/queries/activity";
import { readGrantWorkspaceAccess } from "../persistence/queries/reading";

/** Who changed shared grant work, newest first. Audit owns the events; this composes
 * the records they point at, since audit imports no capability. */
export const listWorkspaceActivity = (
  db: Database,
  actor: Actor,
  input: z.input<typeof workspaceActivityInput>,
) =>
  readTransaction(db, async (tx) => {
    const parsed = workspaceActivityInput.safeParse(input);
    if (!parsed.success) {
      return { status: "invalid" } as const;
    }
    const request = parsed.data;
    const access = await readGrantWorkspaceAccess(tx, actor.userId, request.workspaceSlug);
    if (!access) {
      return { status: "not_found" } as const;
    }
    if (!access.allowed) {
      return { status: "forbidden" } as const;
    }

    const activity = await readWorkspaceActivity(tx, {
      organizationId: access.organizationId,
      targetTypes: [
        "round",
        "application",
        "assessment",
        "recommendation",
        "review_request",
        "review_assignment",
      ],
      actorUserId: request.personId,
      roundId: request.roundId,
      after: request.after,
      limit: request.limit,
    });
    if (activity.status !== "ok") {
      return activity;
    }

    const records = await readActivityRecords(tx, access.organizationId, activity.events);

    const resolve = (event: (typeof activity.events)[number]): ActivityEntry["record"] => {
      if (event.targetType === "round") {
        const title = records.rounds.get(event.targetId);
        return title === undefined ? null : { kind: "round", id: event.targetId, title };
      }
      const id = event.applicationId ?? undefined;
      const title = id === undefined ? undefined : records.applications.get(id);
      return id === undefined || title === undefined ? null : { kind: "application", id, title };
    };

    return workspaceActivitySchema.parse({
      status: "ok",
      entries: activity.events.map((event) => ({
        id: event.id,
        recordedAt: event.recordedAt.toISOString(),
        actor: event.actorName,
        provenance: event.provenance,
        action: event.action,
        subject: {
          type: event.targetType,
          id: event.targetId,
          revision: event.targetRevision,
          name: event.targetName,
          roundId: event.roundId,
          applicationId: event.applicationId,
        },
        record: resolve(event),
      })),
      people: activity.people.map((person) => ({ id: person.userId, name: person.name })),
      nextCursor: activity.nextCursor,
    });
  });
