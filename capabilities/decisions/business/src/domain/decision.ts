import { z } from "zod";

import { latestWithdrawalDate } from "@merit/applications/domain";
import { provenanceSchema } from "@merit/auth";
import { calendarDateSchema } from "@merit/dates";
import { compare } from "@merit/money";

import { decisionLimits, decisionOutcomeSchema } from "./decision-outcome";

export const decisionContentSchema = decisionOutcomeSchema.safeExtend({
  reason: z.string().trim().min(1).max(decisionLimits.reasonLength),
  decidedBy: z.string().trim().min(1).max(decisionLimits.decidedByLength),
  decisionDate: calendarDateSchema,
});

export type DecisionContent = z.infer<typeof decisionContentSchema>;

const changeExplanationSchema = z
  .string()
  .trim()
  .min(1)
  .max(decisionLimits.changeExplanationLength);

/** A saved version: what the committee decided, plus how Merit recorded it. */
export const decisionSchema = decisionContentSchema.safeExtend({
  changeExplanation: changeExplanationSchema.optional(),
  recorder: z.object({
    userId: z.string().optional(),
    name: z.string(),
    provenance: provenanceSchema.optional(),
  }),
  recordedAt: z.iso.datetime(),
  /** The application's recorded material version when this version was saved. */
  applicationVersion: z.number().int().positive().nullable(),
});

export type Decision = z.infer<typeof decisionSchema>;

/** A decision case: versions newest first. The head defines the current decision. */
export type DecisionVersion = { revision: number; decision: Decision };

export type DecisionIssueCode =
  | "reason_required"
  | "reason_too_long"
  | "decided_by_required"
  | "decided_by_too_long"
  | "decision_date_invalid"
  | "decision_date_in_future"
  | "conditions_required"
  | "conditions_not_allowed"
  | "conditions_too_long"
  | "positive_amount"
  | "unfunded_amount"
  | "change_explanation_required"
  | "change_explanation_too_long"
  | "invalid_decision";

export type DecisionIssue = { field: string | null; code: DecisionIssueCode };

const issueFields = [
  "outcome",
  "amount",
  "conditions",
  "reason",
  "decidedBy",
  "decisionDate",
  "changeExplanation",
] as const;

const toDecisionIssue = (issue: z.core.$ZodIssue): DecisionIssue => {
  const field = issueFields.find((name) => name === issue.path[0]) ?? null;
  if (issue.code === "custom") {
    const reason: unknown = issue.params?.reason;
    if (
      reason === "positive_amount" ||
      reason === "unfunded_amount" ||
      reason === "conditions_required" ||
      reason === "conditions_not_allowed"
    ) {
      return { field, code: reason };
    }
  }
  const size = issue.code === "too_small" ? "required" : issue.code === "too_big" ? "too_long" : "";
  const sized: Record<string, DecisionIssueCode | undefined> = {
    reason_required: "reason_required",
    reason_too_long: "reason_too_long",
    decidedBy_required: "decided_by_required",
    decidedBy_too_long: "decided_by_too_long",
    conditions_too_long: "conditions_too_long",
    changeExplanation_required: "change_explanation_required",
    changeExplanation_too_long: "change_explanation_too_long",
  };
  const code = field && size ? sized[`${field}_${size}`] : undefined;
  if (code) {
    return { field, code };
  }
  return { field, code: field === "decisionDate" ? "decision_date_invalid" : "invalid_decision" };
};

const decisionInputSchema = decisionContentSchema.safeExtend({
  changeExplanation: changeExplanationSchema.optional(),
});

export type DecisionInput = z.infer<typeof decisionInputSchema>;

/** Whether saving would leave the current version as it is: no new version, no audit. */
export const sameDecision = (current: DecisionContent, next: DecisionContent) =>
  current.outcome === next.outcome &&
  compare(current.amount, next.amount) === 0 &&
  current.conditions === next.conditions &&
  current.reason === next.reason &&
  current.decidedBy === next.decidedBy &&
  current.decisionDate === next.decisionDate;

/**
 * Validates what the person entered. The date may name today anywhere on Earth, as a
 * withdrawal date may (`withdrawal_date_in_future`). Whether an explanation is needed depends
 * on the current decision, so `prepareDecision` decides that.
 */
export const parseDecision = (input: unknown, recordedAt: string) => {
  const parsed = decisionInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, issues: parsed.error.issues.map(toDecisionIssue) } as const;
  }
  if (parsed.data.decisionDate > latestWithdrawalDate(recordedAt)) {
    return {
      ok: false,
      issues: [{ field: "decisionDate", code: "decision_date_in_future" }],
    } as const;
  }
  return { ok: true, decision: parsed.data } as const;
};

/**
 * Checks a save against the current decision. A change to an existing decision needs an
 * explanation; an unchanged save needs none because it records nothing, and returns the
 * current version it leaves as it is.
 */
export const prepareDecision = <Current extends DecisionContent>(
  current: Current | null,
  input: unknown,
  recordedAt: string,
) => {
  const parsed = parseDecision(input, recordedAt);
  if (!parsed.ok) {
    return parsed;
  }
  const { changeExplanation, ...content } = parsed.decision;
  if (current && sameDecision(current, content)) {
    return { ok: true, unchanged: true, current } as const;
  }
  if (current && changeExplanation === undefined) {
    return {
      ok: false,
      issues: [{ field: "changeExplanation", code: "change_explanation_required" }],
    } as const;
  }
  return {
    ok: true,
    unchanged: false,
    decision: {
      ...content,
      ...(current && changeExplanation !== undefined ? { changeExplanation } : {}),
    },
  } as const;
};

/** A withdrawn application keeps its decision readable but accepts no changes. */
export const canChangeDecision = (application: { withdrawal?: unknown }) =>
  application.withdrawal === undefined;
