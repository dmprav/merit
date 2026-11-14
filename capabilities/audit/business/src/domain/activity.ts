import { z } from "zod";

const identifier = z.string().trim().min(1).max(200);

export type ActivityCursor = { recordedAt: Date; id: string };

const base64Url = { "+": "-", "/": "_", "=": "" } as const;

/** An opaque position in newest-first order; the pair is unique and stable. */
export const encodeActivityCursor = ({ recordedAt, id }: ActivityCursor) =>
  btoa(`${recordedAt.toISOString()}|${id}`).replace(
    /[+/=]/g,
    (character) => base64Url[character as keyof typeof base64Url],
  );

export const decodeActivityCursor = (cursor: string): ActivityCursor | null => {
  let text: string;
  try {
    text = atob(cursor.replaceAll("-", "+").replaceAll("_", "/"));
  } catch {
    return null;
  }
  const [recordedAt, id, ...rest] = text.split("|");
  const parsed = z.iso.datetime().safeParse(recordedAt);
  return rest.length === 0 && parsed.success && z.uuid().safeParse(id).success
    ? { recordedAt: new Date(parsed.data), id: id! }
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
