import { z } from "zod";

import { recommendationPositions } from "@merit/recommendations/domain";

const text = z.string();
const revision = z.number().int().nonnegative();
export const recommendationStorage = z.object({
  value: z.object({ position: z.enum(recommendationPositions), amount: text, reasoning: text }),
  baseline: z.object({ expectedRevision: revision, expectedApplicationVersion: revision }),
});
