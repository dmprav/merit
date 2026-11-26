import { expect, it } from "vite-plus/test";

import { fromMinorUnits } from "@merit/money";

import { decodeDecision, encodeDecision } from "../domain/encoding";
import { recordDecisionRequestSchema } from "./commands";

const decision = {
  outcome: "Fund with conditions" as const,
  amount: fromMinorUnits(9007199254740993n),
  conditions: "Secure match funding.",
  reason: "Strong plan.",
  decidedBy: "Funding committee",
  decisionDate: "2027-01-19",
  changeExplanation: "Corrected the amount.",
  recorder: {
    userId: "dana",
    name: "Dana Reed",
    provenance: { interface: "mcp" as const, clientId: "client" },
  },
  recordedAt: "2027-01-20T10:00:00.000Z",
  applicationVersion: 2,
};

it("preserves a decision in public and stored JSON", () => {
  expect(decodeDecision(JSON.parse(JSON.stringify(encodeDecision(decision))))).toEqual(decision);
});

it("rejects a stored amount with fractional minor units or a funded Defer", () => {
  expect(() =>
    decodeDecision({ ...encodeDecision(decision), amount: { minorUnits: "1.5", currency: "EUR" } }),
  ).toThrow();
  expect(() => decodeDecision({ ...encodeDecision(decision), outcome: "Defer" })).toThrow();
});

it("leaves fields outside the decision contract out of its encoding", () => {
  expect(
    encodeDecision({ ...decision, internalNote: "private" } as typeof decision),
  ).not.toHaveProperty("internalNote");
});

it("accepts only writable decision fields in a request", () => {
  const request = {
    workspaceSlug: "alder",
    publicId: "0123456789ab",
    expectedRevision: 0,
    decision: {
      outcome: "Fund",
      amount: { minorUnits: "2400000", currency: "EUR" },
      conditions: "",
      reason: "Strong plan.",
      decidedBy: "Funding committee",
      decisionDate: "2027-01-19",
    },
  };
  expect(recordDecisionRequestSchema.safeParse(request).success).toBe(true);
  for (const extra of [{ recorder: { name: "Client" } }, { recordedAt: "2027-01-20" }]) {
    expect(
      recordDecisionRequestSchema.safeParse({
        ...request,
        decision: { ...request.decision, ...extra },
      }).success,
    ).toBe(false);
  }
});
