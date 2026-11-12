import { z } from "zod";

import { calendarDateSchema } from "@merit/dates";
import { compare, parseMoney, isNegative, type Money } from "@merit/money";

import type { FundingRound } from "./model";
import { criteriaVersionSchema } from "./versions";

export const roundPreparationLimits = {
  titleLength: 200,
  amountLength: 32,
  purposeLength: 10000,
  criterionTitleLength: 200,
  criterionDescriptionLength: 5000,
  criteriaCount: 100,
  budgetReasonLength: 2000,
} as const;

export const roundTitleSchema = z.string().trim().min(1).max(roundPreparationLimits.titleLength);
export const roundChangeSchema = z.discriminatedUnion("section", [
  z
    .strictObject({
      section: z.literal("details"),
      title: roundTitleSchema.optional(),
      purpose: z.string().trim().max(roundPreparationLimits.purposeLength).optional(),
      meetingDate: calendarDateSchema.nullable().optional(),
    })
    .refine(
      (change) =>
        change.title !== undefined ||
        change.purpose !== undefined ||
        change.meetingDate !== undefined,
      "Choose a preparation field to change.",
    ),
  z.strictObject({
    section: z.literal("criteria"),
    criteria: z
      .array(
        z.strictObject({
          id: z
            .uuid()
            .describe(
              "Preserve this criterion ID across edits and reordering. Generate a new UUID only for a new criterion.",
            ),
          title: z.string().trim().min(1).max(roundPreparationLimits.criterionTitleLength),
          description: z.string().trim().max(roundPreparationLimits.criterionDescriptionLength),
        }),
      )
      .max(roundPreparationLimits.criteriaCount)
      .refine(
        (criteria) => new Set(criteria.map((criterion) => criterion.id)).size === criteria.length,
        "Criterion IDs must be unique.",
      ),
  }),
  z.strictObject({
    section: z.literal("budget"),
    amount: z.string().max(roundPreparationLimits.amountLength),
    reason: z.string().trim().max(roundPreparationLimits.budgetReasonLength),
  }),
  z.strictObject({ section: z.literal("manager"), userId: z.string().min(1).max(100) }),
]);

export type RoundChange = z.infer<typeof roundChangeSchema>;

type ManagerDetails = { name: string | null; email: string | null };

/** Inputs have passed creation validation; identity and date come from the caller. */
export const newPreparedRound = (
  input: { title: string; purpose?: string; budget?: string; meetingDate?: string | null },
  context: { id: string; foundation: string; manager: ManagerDetails; snapshotDate: string },
): FundingRound => {
  const budget = input.budget ? parseMoney(input.budget) : null;
  return {
    id: context.id,
    title: input.title,
    foundation: context.foundation,
    purpose: input.purpose ?? "",
    manager: context.manager.name ?? context.manager.email ?? "",
    currency: "EUR",
    budget: budget?.ok ? budget.value : null,
    meetingDate: input.meetingDate ?? null,
    snapshotDate: context.snapshotDate,
    decisionStatus: "Preparing",
    criteria: [],
    criteriaVersion: criteriaVersionSchema.parse(1),
    criteriaHistory: [{ version: criteriaVersionSchema.parse(1), criteria: [] }],
  };
};

/** Capture the responsible person's identity after the caller establishes eligibility. */
export const withRoundManager = (
  round: FundingRound,
  manager: ManagerDetails & { userId: string },
): FundingRound => ({
  ...round,
  managerUserId: manager.userId,
  manager: manager.name ?? manager.email ?? "",
});

export const budgetChangeRequirements = (
  current: Money | null,
  next: Money | null,
  previouslySet = false,
) => {
  const changed = current === null ? next !== null : next === null || compare(current, next) !== 0;

  return { changed, reasonRequired: changed && (current !== null || previouslySet) };
};

const prepareBudgetChange = (
  round: FundingRound,
  change: Extract<RoundChange, { section: "budget" }>,
  budgetPreviouslySet: boolean,
) => {
  const parsed = change.amount === "" ? null : parseMoney(change.amount);
  if (parsed && (!parsed.ok || isNegative(parsed.value))) {
    return { ok: false, error: "invalid_budget" } as const;
  }

  const budget = parsed?.ok ? parsed.value : null;
  const { changed, reasonRequired } = budgetChangeRequirements(
    round.budget,
    budget,
    budgetPreviouslySet,
  );
  if (reasonRequired && !change.reason) {
    return { ok: false, error: "budget_reason_required" } as const;
  }

  return {
    ok: true,
    action: change.section,
    reason: change.reason || null,
    changed,
    round: { ...round, budget },
  } as const;
};

export const prepareRoundChange = (
  round: FundingRound,
  change: RoundChange,
  budgetPreviouslySet = false,
) => {
  switch (change.section) {
    case "details": {
      const title = change.title ?? round.title;
      const purpose = change.purpose ?? round.purpose;
      const meetingDate = change.meetingDate === undefined ? round.meetingDate : change.meetingDate;
      return {
        ok: true,
        action: change.section,
        reason: null,
        changed:
          round.title !== title || round.purpose !== purpose || round.meetingDate !== meetingDate,
        round: { ...round, title, purpose, meetingDate },
      } as const;
    }
    case "criteria": {
      const changed =
        JSON.stringify(
          round.criteria.map((criterion) => ({
            id: criterion.id,
            title: criterion.title,
            description: criterion.description ?? "",
          })),
        ) !== JSON.stringify(change.criteria);
      const current = round.criteriaVersion;

      return {
        ok: true,
        action: change.section,
        reason: null,
        changed,
        round: changed
          ? {
              ...round,
              criteria: change.criteria,
              criteriaVersion: criteriaVersionSchema.parse(current + 1),
              criteriaHistory: [
                ...round.criteriaHistory,
                { version: criteriaVersionSchema.parse(current + 1), criteria: change.criteria },
              ],
            }
          : round,
      } as const;
    }
    case "budget":
      return prepareBudgetChange(round, change, budgetPreviouslySet);
    case "manager":
      return {
        ok: true,
        action: change.section,
        reason: null,
        changed: round.managerUserId !== change.userId,
        round,
      } as const;
  }
};
