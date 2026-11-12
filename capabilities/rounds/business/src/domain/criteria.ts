import { z } from "zod";

export const reviewCriteriaSchema = z
  .array(
    z.object({
      id: z.uuid(),
      title: z.string().trim().min(1).max(200),
      description: z.string().max(5000).optional(),
    }),
  )
  .max(100)
  .refine((criteria) => {
    const ids = criteria.map((criterion) => criterion.id);
    return new Set(ids).size === ids.length;
  }, "Criterion IDs must be unique.");
