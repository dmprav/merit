import { z } from "zod";

import type { Provenance } from "@merit/auth";

const identifier = z.string().trim().min(1).max(200);

export type ActivityCursor = { recordedAt: Date; id: string };

/** An opaque position in newest-first order; the pair is unique and stable. */
export const encodeActivityCursor = ({ recordedAt, id }: ActivityCursor) =>
  btoa(`${recordedAt.toISOString()}|${id}`)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");

export const decodeActivityCursor = (cursor: string): ActivityCursor | null => {
  let text: string;
  try {
    text = atob(cursor.replaceAll("-", "+").replaceAll("_", "/"));
  } catch {
    return null;
  }
  const [recordedAt, id, ...rest] = text.split("|");
  const parsed = z.iso.datetime().safeParse(recordedAt);
  const parsedId = z.uuid().safeParse(id);
  return rest.length === 0 && parsed.success && parsedId.success
    ? { recordedAt: new Date(parsed.data), id: parsedId.data }
    : null;
};

/** Shared newest-first paging for feeds and subject histories. */
export const auditPageInput = z.strictObject({
  after: z
    .string()
    .max(200)
    .refine((cursor) => decodeActivityCursor(cursor) !== null, "Invalid audit cursor.")
    .optional(),
  limit: z.number().int().min(1).max(50).default(20),
});

/** Narrowing and paging for a workspace's events; the reader adds the workspace. */
export const activityInputSchema = auditPageInput.extend({
  actorUserId: identifier.optional(),
  roundId: identifier.optional(),
  targetTypes: z.array(identifier).min(1).max(20),
  /** Actions whose recorded reason the feed carries; other details are never selected. */
  reasonActions: z.array(identifier).max(20).default([]),
  limit: z.number().int().min(1).max(50).default(50),
});

export type ActivityInput = z.input<typeof activityInputSchema>;

/** One recorded change to a subject, with the owner's before and after values. */
export type RecordedChange<T> = {
  revision: number;
  action: string;
  reason: string | null;
  recordedAt: string;
  actor: string | null;
  provenance: Provenance | null;
  before: T | null;
  after: T | null;
};
