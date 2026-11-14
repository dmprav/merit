import { z } from "zod";

import { isWithdrawn, type IntakeApplication } from "@merit/applications/domain";
import { provenanceSchema } from "@merit/auth";
import { calendarDateSchema } from "@merit/dates";
import { add, subtract, fromMinorUnits, type Money } from "@merit/money";

type RecommendationApplication = IntakeApplication & {
  managerRecommendation: Recommendation | null;
};

import { recommendationOutcomeSchema } from "./recommendation-outcome";

export const recommendationLimits = { reasoningLength: 5000 } as const;

export const recommendationSchema = recommendationOutcomeSchema.safeExtend({
  reasoning: z.string().trim().min(1).max(recommendationLimits.reasoningLength),
  author: z
    .object({
      userId: z.string().optional(),
      name: z.string(),
      provenance: provenanceSchema.optional(),
    })
    .optional(),
  // Drafts may omit recording details until they are saved.
  recorded: z
    .object({ date: calendarDateSchema, applicationVersion: z.number().int().positive() })
    .optional(),
});

export type Recommendation = z.infer<typeof recommendationSchema>;

export type RecommendationIssueCode =
  | "reasoning_required"
  | "reasoning_too_long"
  | "deferral_allocation"
  | "positive_allocation"
  | "invalid_recommendation";

type RecommendationIssue = {
  field: keyof Recommendation | null;
  code: RecommendationIssueCode;
};

export type RecommendationUpdateError =
  | "invalid_recommendation"
  | "application_not_found"
  | "allocation_total_too_large"
  | "application_not_ready"
  | "application_withdrawn";

export const parseRecommendation = (input: unknown) => {
  const parsed = recommendationSchema.safeParse(input);
  if (parsed.success) {
    return { ok: true, recommendation: parsed.data } as const;
  }
  return { ok: false, issues: parsed.error.issues.map(toRecommendationIssue) } as const;
};

const toRecommendationIssue = (issue: z.core.$ZodIssue): RecommendationIssue => {
  const field: unknown = issue.path[0];
  if (field === "reasoning") {
    if (issue.code === "too_small") {
      return { field, code: "reasoning_required" };
    }
    if (issue.code === "too_big") {
      return { field, code: "reasoning_too_long" };
    }
  }

  if (field === "allocation" && issue.code === "custom") {
    const reason: unknown = issue.params?.reason;
    if (reason === "deferral_allocation" || reason === "positive_allocation") {
      return { field, code: reason };
    }
  }

  return {
    field: field === "position" || field === "allocation" || field === "reasoning" ? field : null,
    code: "invalid_recommendation",
  };
};

/** A withdrawn application keeps its recommendation readable but accepts no changes. */
export const canChangeRecommendation = (application: Pick<IntakeApplication, "withdrawal">) =>
  !isWithdrawn(application);

export const prepareRecommendation = (
  round: { budget: Money | null; totals: { proposed: Money } },
  application: Pick<
    RecommendationApplication,
    "version" | "managerRecommendation" | "intakeStatus" | "requested" | "withdrawal"
  >,
  input: unknown,
  recordedOn?: string,
) => {
  const parsed = recommendationSchema.safeParse(input);
  const date = calendarDateSchema.optional().safeParse(recordedOn);
  if (!parsed.success || !date.success) {
    return { ok: false, error: "invalid_recommendation" } as const;
  }

  const recommendation =
    date.data === undefined
      ? parsed.data
      : {
          ...parsed.data,
          recorded: { date: date.data, applicationVersion: application.version },
        };

  const preview = previewRecommendation(round, application, recommendation);
  return preview.ok ? { ...preview, recommendation } : preview;
};

// Preview the funding outcome without requiring authored reasoning or recording details.
export const previewRecommendation = (
  round: { budget: Money | null; totals: { proposed: Money } },
  application: Pick<
    RecommendationApplication,
    "managerRecommendation" | "intakeStatus" | "requested" | "withdrawal"
  >,
  input: Pick<Recommendation, "position" | "allocation">,
) => {
  if (!canChangeRecommendation(application)) {
    return { ok: false, error: "application_withdrawn" } as const;
  }
  const outcome = recommendationOutcomeSchema.safeParse({
    position: input.position,
    allocation: input.allocation,
  });
  if (!outcome.success) {
    return { ok: false, error: "invalid_recommendation" } as const;
  }
  if (
    outcome.data.position !== "Defer" &&
    (application.intakeStatus === "in_preparation" || application.requested === null)
  ) {
    return { ok: false, error: "application_not_ready" } as const;
  }

  try {
    const proposed = add(
      subtract(
        round.totals.proposed,
        application.managerRecommendation?.allocation ?? fromMinorUnits(0n),
      ),
      outcome.data.allocation,
    );

    return {
      ok: true,
      totals: {
        proposed,
        remaining: round.budget === null ? null : subtract(round.budget, proposed),
      },
    } as const;
  } catch (error) {
    if (error instanceof RangeError) {
      return { ok: false, error: "allocation_total_too_large" } as const;
    }
    throw error;
  }
};
