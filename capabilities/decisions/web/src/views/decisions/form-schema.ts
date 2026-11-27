import type { TFunction } from "i18next";
import { z } from "zod";

import { decisionOutcomes, prepareDecision, type DecisionContent } from "@merit/decisions/domain";
import { fromMinorUnits } from "@merit/money";
import { parseMoneyInput } from "@merit/money/input";

import { decisionError } from "./messages";

type Draft = {
  outcome: (typeof decisionOutcomes)[number];
  amount: string;
  conditions: string;
  reason: string;
  decidedBy: string;
  decisionDate: string;
  changeExplanation: string;
};

/** The amount only a funding outcome carries; every other outcome commits exactly nothing. */
const draftAmount = (draft: Draft) =>
  draft.outcome === "Fund" || draft.outcome === "Fund with conditions"
    ? parseMoneyInput(draft.amount)
    : fromMinorUnits(0n);

type DraftIssue = { path: string; message: string };

/** Missing or malformed inputs the decision rules cannot judge, reported once each. */
const draftIssues = (t: TFunction<"committeeDecisions">, draft: Draft): DraftIssue[] => {
  const issues: DraftIssue[] = [];
  if (draftAmount(draft) === null) {
    issues.push({
      path: "amount",
      message: t(draft.amount.trim() ? "validation.amountFormat" : "validation.amountRequired"),
    });
  }
  if (!draft.decisionDate) {
    issues.push({ path: "decisionDate", message: t("validation.decisionDateRequired") });
  }
  return issues;
};

/**
 * The draft as decision content. A missing value is reported once by `draftIssues`, so a
 * placeholder stands in for it and the rest of the draft is still checked in the same pass.
 */
const draftContent = (draft: Draft, amending: boolean) => ({
  outcome: draft.outcome,
  amount: draftAmount(draft) ?? fromMinorUnits(1n),
  conditions: draft.outcome === "Fund with conditions" ? draft.conditions : "",
  reason: draft.reason,
  decidedBy: draft.decidedBy,
  decisionDate: draft.decisionDate || "1970-01-01",
  ...(amending && draft.changeExplanation.trim()
    ? { changeExplanation: draft.changeExplanation }
    : {}),
});

const unchangedContent = (current: DecisionContent) => ({
  outcome: current.outcome,
  amount: current.amount,
  conditions: current.conditions,
  reason: current.reason,
  decidedBy: current.decidedBy,
  decisionDate: current.decisionDate,
});

/**
 * The editable draft as a decision. Once a decision exists, a change to it needs an explanation
 * and an unchanged save needs none; the unused fields of an outcome are ignored, not rejected.
 */
export const decisionFormSchema = (
  t: TFunction<"committeeDecisions">,
  current: DecisionContent | null,
) =>
  z
    .object({
      outcome: z.enum(decisionOutcomes),
      amount: z.string(),
      conditions: z.string(),
      reason: z.string(),
      decidedBy: z.string(),
      decisionDate: z.string(),
      changeExplanation: z.string(),
    })
    .transform((draft, context) => {
      const issues = draftIssues(t, draft);
      const parsed = prepareDecision(
        current,
        draftContent(draft, current !== null),
        new Date().toISOString(),
      );
      if (!parsed.ok) {
        issues.push(
          ...parsed.issues.map((issue) => ({
            path: issue.field ?? "",
            message: decisionError(t, issue.code),
          })),
        );
      }
      for (const { path, message } of issues) {
        context.addIssue({ code: "custom", path: path ? [path] : [], message });
      }
      if (issues.length > 0 || !parsed.ok) {
        return z.NEVER;
      }
      // An unchanged save records nothing, so it carries the content it leaves in place.
      return parsed.unchanged ? unchangedContent(parsed.current) : parsed.decision;
    });
