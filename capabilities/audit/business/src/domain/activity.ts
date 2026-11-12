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

const activityPageSize = 50;

/** Records whose events a reader may return; the owning capability resolves membership. */
const activityTargetsSchema = z
  .array(z.strictObject({ type: identifier, ids: z.array(identifier).max(10_000) }))
  .max(8);

/** Narrowing and paging for a workspace's events; the reader adds the workspace. */
export const activityInputSchema = z.strictObject({
  actorUserId: identifier.optional(),
  /** When present, only events on these records; an empty selection matches nothing. */
  targets: activityTargetsSchema.optional(),
  after: z
    .string()
    .max(200)
    .refine((cursor) => decodeActivityCursor(cursor) !== null, "Invalid activity cursor.")
    .optional(),
  limit: z.number().int().min(1).max(activityPageSize).default(activityPageSize),
});

export type ActivityInput = z.input<typeof activityInputSchema>;
