import { expect, it } from "vite-plus/test";

import { fromMinorUnits, encodeMoney } from "@merit/money";

import {
  decodeBudgetContext,
  encodeRecommendation,
  decodeRecommendation,
} from "../domain/encoding";
import { saveRecommendationRequestSchema } from "./commands";

const recorded = (position: "Fund" | "Defer") => ({
  position,
  allocation: fromMinorUnits(position === "Fund" ? 9007199254740993n : 0n),
  reasoning: "Proceed after discussion.",
  recorded: { date: "2027-01-18", applicationVersion: 1 },
});

it.each(["Fund", "Defer"] as const)(
  "preserves a %s recommendation in public and stored JSON",
  (position) => {
    const recommendation = recorded(position);

    expect(
      decodeRecommendation(JSON.parse(JSON.stringify(encodeRecommendation(recommendation)))),
    ).toEqual(recommendation);
  },
);

it("rejects a stored allocation with fractional minor units", () => {
  expect(() =>
    decodeRecommendation({
      ...encodeRecommendation(recorded("Fund")),
      allocation: { minorUnits: "1.5", currency: "EUR" },
    }),
  ).toThrow();
});

it("leaves fields outside the recommendation contract out of its encoding", () => {
  const withInternalNote = { ...recorded("Fund"), internalNote: "private" };

  expect(encodeRecommendation(withInternalNote)).not.toHaveProperty("internalNote");
});

it.each(["Fund", "Defer"] as const)(
  "accepts an encoded %s recommendation in a save request",
  (position) => {
    expect(
      saveRecommendationRequestSchema.safeParse({
        workspaceSlug: "alder",
        publicId: "0123456789ab",
        expectedRevision: 0,
        expectedApplicationVersion: 1,
        recommendation: encodeRecommendation(recorded(position)),
      }).success,
    ).toBe(true);
  },
);

it.each([null, fromMinorUnits(10000n)])("preserves unknown and exceeded budgets: %s", (budget) => {
  const context = decodeBudgetContext(
    budget && encodeMoney(budget),
    [encodeMoney(fromMinorUnits(12001n)), null, encodeMoney(fromMinorUnits(0n))],
    0,
  );
  expect(context.budget).toEqual(budget);
  expect(context.totals).toEqual({
    proposed: fromMinorUnits(12001n),
    remaining: budget === null ? null : fromMinorUnits(-2001n),
    withdrawnApplications: 0,
  });
});

it("rejects a negative persisted allocation", () => {
  expect(() => decodeBudgetContext(null, [encodeMoney(fromMinorUnits(-1n))], 0)).toThrow(
    /Amount must be nonnegative/,
  );
});

it("rejects persisted allocations whose total exceeds the money limit", () => {
  expect(() =>
    decodeBudgetContext(
      null,
      [encodeMoney(fromMinorUnits(10n ** 30n - 1n)), encodeMoney(fromMinorUnits(1n))],
      0,
    ),
  ).toThrow(RangeError);
});
