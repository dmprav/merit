import { z } from "zod";

import { moneySchema, isNegative, isZero } from "@merit/money";

export const recommendationPositions = ["Fund", "Fund with a condition", "Defer"] as const;
export const recommendationOutcomeSchema = z
  .strictObject({
    position: z.enum(recommendationPositions),
    allocation: moneySchema.refine((value) => !isNegative(value), "Allocation must be nonnegative"),
  })
  .superRefine((value, context) => {
    if (value.position === "Defer" && !isZero(value.allocation)) {
      context.addIssue({
        code: "custom",
        path: ["allocation"],
        params: { reason: "deferral_allocation" },
      });
    }
    if (value.position !== "Defer" && isZero(value.allocation)) {
      context.addIssue({
        code: "custom",
        path: ["allocation"],
        params: { reason: "positive_allocation" },
      });
    }
  });
