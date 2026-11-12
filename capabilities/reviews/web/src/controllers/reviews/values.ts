import type { z } from "zod";

import type { assessmentInputSchema, AssessmentInput } from "@merit/reviews/domain";

import type { ReviewFormValues } from "./drafts";

export const contentFromValues = (
  value: ReviewFormValues,
): z.input<typeof assessmentInputSchema> => ({
  applicationVersion:
    value.applicationVersion === "unknown" ? null : Number(value.applicationVersion),
  criteriaVersion: value.criteriaVersion === "unknown" ? null : Number(value.criteriaVersion),
  date: value.date || null,
  position: value.position === "unknown" ? null : (value.position as AssessmentInput["position"]),
  amount: value.amount === "" ? null : value.amount,
  reasoning: value.reasoning,
  observations: value.observations,
});

export const valuesFromContent = (value: AssessmentInput, contactId: string): ReviewFormValues => ({
  contactId,
  applicationVersion: value.applicationVersion?.toString() ?? "unknown",
  criteriaVersion: value.criteriaVersion?.toString() ?? "unknown",
  date: value.date ?? "",
  position: value.position ?? "unknown",
  amount: value.amount ?? "",
  reasoning: value.reasoning,
  observations: value.observations,
  note: "",
});
