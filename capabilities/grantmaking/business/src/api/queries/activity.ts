import { z } from "zod";

import { provenanceSchema } from "@merit/auth";
import { workspaceSlugSchema } from "@merit/organizations/api";

import { publicIdSchema } from "../identifiers";

export const workspaceActivityInput = z.strictObject({
  workspaceSlug: workspaceSlugSchema,
  /** Matches the round, its applications, and their assessments and recommendations. */
  roundId: publicIdSchema.optional(),
  /** The recorded person's user ID; interfaces send it in a request body, never a URL. */
  personId: z.string().min(1).max(200).optional(),
  after: z.string().min(1).max(200).optional(),
  limit: z.number().int().min(1).max(50).default(50),
});

const activityRecordSchema = z.object({
  kind: z.enum(["application", "round"]),
  id: publicIdSchema,
  title: z.string(),
});

export const activityEntrySchema = z.object({
  id: z.uuid(),
  recordedAt: z.iso.datetime(),
  /** The name recorded with the event; null when none was recorded. */
  actor: z.string().nullable(),
  provenance: provenanceSchema,
  /** A stored action name such as `application.create`; interfaces label unknown names generically. */
  action: z.string(),
  /** The record's current identity, or null when it no longer exists. */
  record: activityRecordSchema.nullable(),
});

const activityPersonSchema = z.object({ id: z.string(), name: z.string().nullable() });

export const workspaceActivitySchema = z.object({
  status: z.literal("ok"),
  entries: z.array(activityEntrySchema),
  /** Everyone with recorded activity in the workspace, for filtering. */
  people: z.array(activityPersonSchema),
  nextCursor: z.string().nullable(),
});

export type ActivityEntry = z.infer<typeof activityEntrySchema>;

export type ActivityPerson = z.infer<typeof activityPersonSchema>;

export type WorkspaceActivity = z.infer<typeof workspaceActivitySchema>;
