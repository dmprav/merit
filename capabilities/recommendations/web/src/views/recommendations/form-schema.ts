import type { TFunction } from "i18next";
import { z } from "zod";

import { fromMinorUnits } from "@merit/money";
import { parseMoneyInput } from "@merit/money/input";
import { parseRecommendation, recommendationPositions } from "@merit/recommendations/domain";

import { recommendationError } from "./messages";

export const recommendationFormSchema = (t: TFunction<"fundingRecommendations">) =>
  z
    .object({
      position: z.enum(recommendationPositions),
      amount: z.string(),
      reasoning: z.string(),
    })
    .transform((draft, context) => {
      const allocation =
        draft.position === "Defer" ? fromMinorUnits(0n) : parseMoneyInput(draft.amount);
      if (allocation === null) {
        context.addIssue({
          code: "custom",
          path: ["amount"],
          message: t("validation.amountFormat"),
        });
        return z.NEVER;
      }

      const parsed = parseRecommendation({
        position: draft.position,
        allocation,
        reasoning: draft.reasoning,
      });
      if (parsed.ok) {
        return parsed.recommendation;
      }

      for (const issue of parsed.issues) {
        const field = issue.field === "allocation" ? "amount" : issue.field;
        context.addIssue({
          code: "custom",
          path: field === null ? [] : [field],
          message: recommendationError(t, issue.code),
        });
      }

      return z.NEVER;
    });
