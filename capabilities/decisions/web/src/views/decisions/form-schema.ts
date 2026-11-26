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
      const amount = draftAmount(draft);
      let complete = true;

      const reject = (path: string, message: string) => {
        complete = false;
        context.addIssue({ code: "custom", path: path ? [path] : [], message });
      };

      if (amount === null) {
        reject(
          "amount",
          t(draft.amount.trim() ? "validation.amountFormat" : "validation.amountRequired"),
        );
      }
      if (!draft.decisionDate) {
        reject("decisionDate", t("validation.decisionDateRequired"));
      }
      // A missing value is reported once, so the rest of the draft is still checked in the same pass.
      const parsed = prepareDecision(
        current,
        {
          outcome: draft.outcome,
          amount: amount ?? fromMinorUnits(1n),
          conditions: draft.outcome === "Fund with conditions" ? draft.conditions : "",
          reason: draft.reason,
          decidedBy: draft.decidedBy,
          decisionDate: draft.decisionDate || "1970-01-01",
          ...(current && draft.changeExplanation.trim()
            ? { changeExplanation: draft.changeExplanation }
            : {}),
        },
        new Date().toISOString(),
      );
      if (!parsed.ok) {
        for (const issue of parsed.issues) {
          reject(issue.field ?? "", decisionError(t, issue.code));
        }
      }
      if (!complete || !parsed.ok) {
        return z.NEVER;
      }
      // An unchanged save records nothing, so it carries the content it leaves in place.
      return parsed.unchanged
        ? {
            outcome: parsed.current.outcome,
            amount: parsed.current.amount,
            conditions: parsed.current.conditions,
            reason: parsed.current.reason,
            decidedBy: parsed.current.decidedBy,
            decisionDate: parsed.current.decisionDate,
          }
        : parsed.decision;
    });
