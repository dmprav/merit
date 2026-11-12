import { expect, it } from "vite-plus/test";

import { fromMinorUnits, encodeMoney } from "@merit/money";

import * as stored from "../server/persistence/encoding";
import { saveRecommendationRequestSchema } from "./commands";
import { encodeRecommendation, decodeRecommendation } from "./encoding";

it.each(["Fund", "Defer"] as const)(
  "preserves a %s recommendation in public and stored JSON",
  (position) => {
    const recommendation = {
      position,
      allocation: fromMinorUnits(position === "Fund" ? 9007199254740993n : 0n),
      reasoning: "Proceed after discussion.",
      recorded: { date: "2027-01-18", applicationVersion: 1 },
    };
    for (const codec of [{ encodeRecommendation, decodeRecommendation }, stored]) {
      expect(
        codec.decodeRecommendation(
          JSON.parse(JSON.stringify(codec.encodeRecommendation(recommendation))),
        ),
      ).toEqual(recommendation);
      expect(() =>
        codec.decodeRecommendation({
          ...codec.encodeRecommendation(recommendation),
          allocation: { minorUnits: "1.5", currency: "EUR" },
        }),
      ).toThrow();
    }
    const withInternalNote = { ...recommendation, internalNote: "private" };
    expect(encodeRecommendation(withInternalNote)).not.toHaveProperty("internalNote");
    expect(
      saveRecommendationRequestSchema.safeParse({
        workspaceSlug: "alder",
        publicId: "0123456789ab",
        expectedRevision: 0,
        expectedApplicationVersion: 1,
        recommendation: encodeRecommendation(recommendation),
      }).success,
    ).toBe(true);
  },
);

it.each([null, fromMinorUnits(10000n)])("preserves unknown and exceeded budgets: %s", (budget) => {
  const context = stored.decodeBudgetContext(budget && encodeMoney(budget), [
    encodeMoney(fromMinorUnits(12001n)),
    null,
    encodeMoney(fromMinorUnits(0n)),
  ]);
  expect(context.budget).toEqual(budget);
  expect(context.totals).toEqual({
    proposed: fromMinorUnits(12001n),
    remaining: budget === null ? null : fromMinorUnits(-2001n),
  });
});
it("rejects negative and overflowing persisted allocation totals", () => {
  expect(() => stored.decodeBudgetContext(null, [encodeMoney(fromMinorUnits(-1n))])).toThrow();
  expect(() =>
    stored.decodeBudgetContext(null, [
      encodeMoney(fromMinorUnits(10n ** 30n - 1n)),
      encodeMoney(fromMinorUnits(1n)),
    ]),
  ).toThrow(RangeError);
});
