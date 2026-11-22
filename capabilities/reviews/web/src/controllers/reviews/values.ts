import type { z } from "zod";

import { decodeMoney, toDecimal } from "@merit/money";
import {
  assessmentPositionSchema,
  type assessmentEntrySchema,
  type AssessmentInput,
} from "@merit/reviews/domain";

import type { ReviewFormValues } from "./drafts";

export const contentFromValues = (
  value: ReviewFormValues,
): z.input<typeof assessmentEntrySchema> => {
  const parsedPosition =
    value.position === "unknown" ? null : assessmentPositionSchema.safeParse(value.position);
  return {
    applicationVersion:
      value.applicationVersion === "unknown" ? null : Number(value.applicationVersion),
    criteriaVersion: value.criteriaVersion === "unknown" ? null : Number(value.criteriaVersion),
    date: value.date || null,
    position: parsedPosition?.success ? parsedPosition.data : null,
    amount: value.amount === "" ? null : value.amount,
    reasoning: value.reasoning,
    observations: value.observations,
  };
};

export const valuesFromContent = (value: AssessmentInput, contactId: string): ReviewFormValues => ({
  contactId,
  applicationVersion: value.applicationVersion?.toString() ?? "unknown",
  criteriaVersion: value.criteriaVersion?.toString() ?? "unknown",
  date: value.date ?? "",
  position: value.position ?? "unknown",
  amount: value.amount === null ? "" : toDecimal(decodeMoney(value.amount)),
  reasoning: value.reasoning,
  observations: value.observations,
  note: "",
});
