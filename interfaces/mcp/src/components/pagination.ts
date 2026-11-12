import { z } from "zod";

export const pageInput = z.strictObject({
  after: z.string().min(1).max(254).optional(),
  limit: z.number().int().min(1).max(50).default(20),
});

/** Existing authorized services return complete lists; paginate their visible results. */
export const pageItems = <T>(
  items: T[],
  input: z.infer<typeof pageInput>,
  key: (item: T) => string,
) => {
  const sorted = items
    .filter((item) => input.after === undefined || key(item) > input.after)
    .sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
  const page = sorted.slice(0, input.limit);
  return {
    items: page,
    nextCursor: sorted.length > input.limit ? key(page[page.length - 1]!) : null,
  };
};
