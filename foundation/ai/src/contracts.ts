import { z } from "zod";

export const writeErrorSchema = z.union([
  z.object({ status: z.enum(["not_found", "conflict"]) }),
  z.object({ status: z.literal("invalid"), error: z.string().min(1) }),
]);

export const revision = z.number().int().nonnegative();

/** A tool continuation can be passed directly back to the same tool, including its filters. */
export const cursorPage = <Input, Page extends { nextCursor: string | null }>(
  input: Input,
  { nextCursor, ...page }: Page,
) => ({ ...page, nextPage: nextCursor === null ? null : { ...input, after: nextCursor } });

export const revisionPage = <Input, Page extends { nextRevision: number | null }>(
  input: Input,
  { nextRevision, ...page }: Page,
) => ({
  ...page,
  nextPage: nextRevision === null ? null : { ...input, afterRevision: nextRevision },
});
