import { expect, it } from "vite-plus/test";

import { fromMinorUnits } from "@merit/money";

import { decodeRoundSummary, encodeRoundSummary, type RoundSummary } from "./round-summary";

const summary: RoundSummary = {
  organizationId: "organization",
  organizationName: "Foundation",
  workspaceSlug: "foundation",
  publicId: "0123456789ab",
  title: "Round",
  decisionStatus: "Preparation",
  applicationCount: 0,
  meetingDate: null,
  budget: null,
};

it.each([null, 0n, 9007199254740993n])("preserves summary budget %s through JSON", (amount) => {
  const encoded = encodeRoundSummary({
    ...summary,
    budget: amount === null ? null : fromMinorUnits(amount),
  });

  expect(encoded.budget).toEqual(
    amount === null ? null : { minorUnits: amount.toString(), currency: "EUR" },
  );
  expect(encodeRoundSummary(decodeRoundSummary(JSON.parse(JSON.stringify(encoded))))).toEqual(
    encoded,
  );
});

it.each([
  { minorUnits: "1.5", currency: "EUR" },
  { minorUnits: "100", currency: "USD" },
])("rejects invalid monetary data in a summary: %j", (budget) => {
  expect(() => decodeRoundSummary({ ...summary, budget })).toThrow();
});
