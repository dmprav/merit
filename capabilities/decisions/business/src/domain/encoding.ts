import { z } from "zod";

import { decodeMoney, encodeMoney, moneyDataSchema } from "@merit/money";
import { fundingRoundSchema } from "@merit/rounds/domain";

import { commitmentTotals } from "./commitment";
import { decisionSchema, type Decision } from "./decision";

export const decisionDataSchema = z.strictObject({
  ...decisionSchema.shape,
  amount: moneyDataSchema,
});

export type DecisionData = z.infer<typeof decisionDataSchema>;

export const decisionVersionDataSchema = z.strictObject({
  revision: z.number().int().positive(),
  decision: decisionDataSchema,
});

export type DecisionVersionData = z.infer<typeof decisionVersionDataSchema>;

/** The decision case: its revision, and every version newest first. */
export const decisionStateDataSchema = z.strictObject({
  revision: z.number().int().nonnegative(),
  versions: z.array(decisionVersionDataSchema),
});

export type DecisionStateData = z.infer<typeof decisionStateDataSchema>;

const decisionOutputSchema = z.object(decisionSchema.shape);

export const encodeDecision = (value: Decision): DecisionData => {
  const decision = decisionOutputSchema.parse(value);
  return { ...decision, amount: encodeMoney(decision.amount) };
};

export const decodeDecision = (input: unknown): Decision => {
  const value = decisionDataSchema.parse(input);
  return decisionSchema.parse({ ...value, amount: decodeMoney(value.amount) });
};

/** Stored current commitments become the round's committed total; an absent one adds nothing. */
export const decodeCommitments = (commitments: unknown) =>
  z
    .array(moneyDataSchema)
    .parse(commitments)
    .map((amount) => fundingRoundSchema.shape.budget.unwrap().parse(decodeMoney(amount)));

export const decodeCommitmentContext = (
  budget: unknown,
  commitments: unknown,
  withdrawnApplications: number,
) => {
  const value =
    budget === null ? null : fundingRoundSchema.shape.budget.unwrap().parse(decodeMoney(budget));
  return {
    budget: value,
    totals: { ...commitmentTotals(value, decodeCommitments(commitments)), withdrawnApplications },
  };
};
