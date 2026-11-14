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
  manager: "Dana Reed",
  managerNeedsReassignment: false,
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
  { manager: "Dana Reed", managerNeedsReassignment: false },
  { manager: "Dana Reed", managerNeedsReassignment: true },
  { manager: "", managerNeedsReassignment: true },
  { manager: "", managerNeedsReassignment: false },
])(
  "preserves manager %j through transport encoding and decoding",
  ({ manager, managerNeedsReassignment }) => {
    const encoded = encodeRoundSummary({
      ...summary,
      manager,
      managerNeedsReassignment,
    });

    expect(encoded).toMatchObject({ manager, managerNeedsReassignment });
    expect(decodeRoundSummary(JSON.parse(JSON.stringify(encoded)))).toEqual({
      ...summary,
      manager,
      managerNeedsReassignment,
    });
  },
);

it.each([
  { minorUnits: "1.5", currency: "EUR" },
  { minorUnits: "100", currency: "USD" },
])("rejects invalid monetary data in a summary: %j", (budget) => {
  expect(() => decodeRoundSummary({ ...summary, budget })).toThrow();
});

it.each([
  { manager: null },
  { manager: 42 },
  { managerNeedsReassignment: "true" },
  { managerNeedsReassignment: undefined },
])("rejects invalid manager metadata in a summary: %j", (override) => {
  expect(() => decodeRoundSummary({ ...summary, ...override })).toThrow();
});
