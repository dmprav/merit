import { expect, it } from "vite-plus/test";

import { encodeMoney, fromMinorUnits } from "@merit/money";

import { budgetFailureSchema, presentDecision, savedDecisionSchema } from "./responses";

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

it("presents a saved decision with exact encoded money", () => {
  const presented = presentDecision(
    {
      status: "ok",
      recorded: true,
      decision: { revision: 1, decision },
      budget: fromMinorUnits(6000000n),
      totals: {
        committed: fromMinorUnits(2400000n),
        available: fromMinorUnits(3600000n),
        withdrawnApplications: 0,
      },
    },
    "0123456789ab",
  );
  expect(savedDecisionSchema.parse(presented)).toMatchObject({
    recorded: true,
    decision: { revision: 1, decision: { amount: encodeMoney(fromMinorUnits(2400000n)) } },
    totals: { available: { minorUnits: "3600000" } },
  });
});

it("presents an unknown budget as null and keeps the committed total", () => {
  const presented = presentDecision(
    {
      status: "ok",
      recorded: false,
      decision: { revision: 1, decision },
      budget: null,
      totals: { committed: fromMinorUnits(0n), available: null, withdrawnApplications: 1 },
    },
    "0123456789ab",
  );
  expect(presented).toMatchObject({ budget: null, totals: { available: null } });
});

it("reports the budget, committed total, and excess when a commitment does not fit", () => {
  const presented = presentDecision(
    {
      status: "invalid",
      error: "commitment_exceeds_budget",
      budget: fromMinorUnits(6000000n),
      committed: fromMinorUnits(6100000n),
      excess: fromMinorUnits(100000n),
    },
    "0123456789ab",
  );
  expect(budgetFailureSchema.parse(presented)).toEqual({
    status: "invalid",
    error: "commitment_exceeds_budget",
    budget: { minorUnits: "6000000", currency: "EUR" },
    committed: { minorUnits: "6100000", currency: "EUR" },
    excess: { minorUnits: "100000", currency: "EUR" },
  });
  expect(
    presentDecision(
      {
        status: "invalid",
        error: "budget_required",
        budget: null,
        committed: fromMinorUnits(1n),
        excess: null,
      },
      "0123456789ab",
    ),
  ).toMatchObject({ budget: null, excess: null });
});

it("passes other failures through unchanged", () => {
  expect(presentDecision({ status: "conflict" }, "0123456789ab")).toEqual({ status: "conflict" });
  expect(
    presentDecision({ status: "invalid", error: "application_withdrawn" }, "0123456789ab"),
  ).toEqual({ status: "invalid", error: "application_withdrawn" });
});
