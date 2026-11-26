import { expect, it } from "vite-plus/test";

import { fromMinorUnits } from "@merit/money";

import { budgetFailureDataSchema, encodeDecisionResult, savedDecisionDataSchema } from "./results";

const decision = {
  outcome: "Fund" as const,
  amount: fromMinorUnits(2400000n),
  conditions: "",
  reason: "Strong plan.",
  decidedBy: "Funding committee",
  decisionDate: "2027-01-19",
  recorder: { userId: "dana", name: "Dana Reed", provenance: { interface: "web" as const } },
  recordedAt: "2027-01-20T10:00:00.000Z",
  applicationVersion: 1,
};

it("encodes a saved decision with exact money", () => {
  const encoded = encodeDecisionResult({
    status: "ok",
    recorded: true,
    decision: { revision: 1, decision },
    budget: fromMinorUnits(6000000n),
    totals: {
      committed: fromMinorUnits(2400000n),
      available: fromMinorUnits(3600000n),
      withdrawnApplications: 0,
    },
  });
  expect(savedDecisionDataSchema.parse(JSON.parse(JSON.stringify(encoded)))).toMatchObject({
    decision: { revision: 1, decision: { amount: { minorUnits: "2400000" } } },
    budget: { minorUnits: "6000000" },
    totals: { available: { minorUnits: "3600000" } },
  });
});

it("encodes an unknown budget and available amount as null", () => {
  expect(
    encodeDecisionResult({
      status: "ok",
      recorded: false,
      decision: { revision: 1, decision },
      budget: null,
      totals: { committed: fromMinorUnits(0n), available: null, withdrawnApplications: 0 },
    }),
  ).toMatchObject({ budget: null, totals: { available: null } });
});

it("encodes the figures that explain a budget failure", () => {
  const exceeded = encodeDecisionResult({
    status: "invalid",
    error: "commitment_exceeds_budget",
    budget: fromMinorUnits(6000000n),
    committed: fromMinorUnits(6100000n),
    excess: fromMinorUnits(100000n),
  });
  expect(budgetFailureDataSchema.parse(JSON.parse(JSON.stringify(exceeded)))).toEqual({
    status: "invalid",
    error: "commitment_exceeds_budget",
    budget: { minorUnits: "6000000", currency: "EUR" },
    committed: { minorUnits: "6100000", currency: "EUR" },
    excess: { minorUnits: "100000", currency: "EUR" },
  });
  expect(
    encodeDecisionResult({
      status: "invalid",
      error: "budget_required",
      budget: null,
      committed: fromMinorUnits(1n),
      excess: null,
    }),
  ).toMatchObject({ budget: null, excess: null });
});

it("passes other outcomes and transport failures through unchanged", () => {
  expect(encodeDecisionResult({ status: "conflict" })).toEqual({ status: "conflict" });
  expect(encodeDecisionResult({ status: "invalid", error: "application_withdrawn" })).toEqual({
    status: "invalid",
    error: "application_withdrawn",
  });
  expect(encodeDecisionResult({ status: "signed_out" })).toEqual({ status: "signed_out" });
  expect(encodeDecisionResult({ status: "unavailable" })).toEqual({ status: "unavailable" });
});
