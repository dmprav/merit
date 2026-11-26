import { expect, it } from "vite-plus/test";

import { fromMinorUnits } from "@merit/money";

import { canChangeDecision, prepareDecision, sameDecision, type DecisionContent } from "./decision";

const recordedAt = "2027-01-20T10:00:00.000Z";

const fund: DecisionContent = {
  outcome: "Fund",
  amount: fromMinorUnits(2_400_000n),
  conditions: "",
  reason: "Meets the round's priorities.",
  decidedBy: "Funding committee",
  decisionDate: "2027-01-19",
};

it("accepts a first decision without an explanation and normalizes its text", () => {
  expect(
    prepareDecision(
      null,
      { ...fund, reason: "  Meets the round's priorities.  ", decidedBy: " Funding committee " },
      recordedAt,
    ),
  ).toEqual({ ok: true, unchanged: false, decision: fund });
});

it("ignores a change explanation sent with the first version", () => {
  expect(prepareDecision(null, { ...fund, changeExplanation: "Not needed." }, recordedAt)).toEqual({
    ok: true,
    unchanged: false,
    decision: fund,
  });
});

it.each([
  { outcome: "Fund", amount: 0n, conditions: "", code: "positive_amount" },
  {
    outcome: "Fund with conditions",
    amount: 0n,
    conditions: "Match funding",
    code: "positive_amount",
  },
  { outcome: "Fund with conditions", amount: 100n, conditions: "  ", code: "conditions_required" },
  { outcome: "Fund", amount: 100n, conditions: "Match funding", code: "conditions_not_allowed" },
  { outcome: "Defer", amount: 100n, conditions: "", code: "unfunded_amount" },
  { outcome: "Decline", amount: 100n, conditions: "", code: "unfunded_amount" },
  { outcome: "Decline", amount: 0n, conditions: "Reapply", code: "conditions_not_allowed" },
] as const)(
  "rejects $outcome with amount $amount and conditions '$conditions' as $code",
  ({ outcome, amount, conditions, code }) => {
    const result = prepareDecision(
      null,
      { ...fund, outcome, amount: fromMinorUnits(amount), conditions },
      recordedAt,
    );
    expect(result.ok).toBe(false);
    expect(!result.ok && result.issues.map((issue) => issue.code)).toContain(code);
  },
);

it.each([
  { outcome: "Defer", conditions: "" },
  { outcome: "Decline", conditions: "" },
] as const)("accepts $outcome reserving exactly zero", ({ outcome, conditions }) => {
  expect(
    prepareDecision(null, { ...fund, outcome, amount: fromMinorUnits(0n), conditions }, recordedAt),
  ).toMatchObject({ ok: true });
});

it.each([
  { change: { reason: " " }, issue: { field: "reason", code: "reason_required" } },
  { change: { reason: "a".repeat(5001) }, issue: { field: "reason", code: "reason_too_long" } },
  { change: { decidedBy: " " }, issue: { field: "decidedBy", code: "decided_by_required" } },
  {
    change: { decidedBy: "a".repeat(201) },
    issue: { field: "decidedBy", code: "decided_by_too_long" },
  },
  {
    change: { decisionDate: "2027-02-30" },
    issue: { field: "decisionDate", code: "decision_date_invalid" },
  },
  {
    change: { decisionDate: "2027-01-22" },
    issue: { field: "decisionDate", code: "decision_date_in_future" },
  },
  {
    change: { amount: "100" },
    issue: { field: "amount", code: "invalid_decision" },
  },
  {
    change: { outcome: "Award" },
    issue: { field: "outcome", code: "invalid_decision" },
  },
])("reports $issue.code beside $issue.field", ({ change, issue }) => {
  expect(prepareDecision(null, { ...fund, ...change }, recordedAt)).toEqual({
    ok: false,
    issues: [issue],
  });
});

it("accepts today anywhere on Earth but not a later date", () => {
  // UTC+14 is already on 2027-01-21 when it is 10:00 UTC on 2027-01-20.
  expect(prepareDecision(null, { ...fund, decisionDate: "2027-01-21" }, recordedAt).ok).toBe(true);
  expect(prepareDecision(null, { ...fund, decisionDate: "2027-01-22" }, recordedAt).ok).toBe(false);
});

it("reports a non-object input and an over-long conditions text", () => {
  expect(prepareDecision(null, null, recordedAt)).toEqual({
    ok: false,
    issues: [{ field: null, code: "invalid_decision" }],
  });
  expect(
    prepareDecision(
      null,
      { ...fund, outcome: "Fund with conditions", conditions: "c".repeat(5001) },
      recordedAt,
    ),
  ).toEqual({ ok: false, issues: [{ field: "conditions", code: "conditions_too_long" }] });
});

it("requires an explanation for a change to an existing decision", () => {
  const change = { ...fund, amount: fromMinorUnits(2_000_000n) };
  expect(prepareDecision(fund, change, recordedAt)).toEqual({
    ok: false,
    issues: [{ field: "changeExplanation", code: "change_explanation_required" }],
  });
  expect(prepareDecision(fund, { ...change, changeExplanation: "  " }, recordedAt)).toEqual({
    ok: false,
    issues: [{ field: "changeExplanation", code: "change_explanation_required" }],
  });
  expect(
    prepareDecision(fund, { ...change, changeExplanation: "a".repeat(2001) }, recordedAt),
  ).toEqual({
    ok: false,
    issues: [{ field: "changeExplanation", code: "change_explanation_too_long" }],
  });
  expect(
    prepareDecision(fund, { ...change, changeExplanation: " Budget reduced. " }, recordedAt),
  ).toEqual({
    ok: true,
    unchanged: false,
    decision: { ...change, changeExplanation: "Budget reduced." },
  });
});

it("treats a save that changes nothing as a no-op, with or without an explanation", () => {
  expect(prepareDecision(fund, fund, recordedAt)).toEqual({
    ok: true,
    unchanged: true,
    current: fund,
  });
  expect(prepareDecision(fund, { ...fund, changeExplanation: "Re-saved." }, recordedAt)).toEqual({
    ok: true,
    unchanged: true,
    current: fund,
  });
});

it.each([
  { outcome: "Defer", amount: fromMinorUnits(0n), conditions: "" },
  { outcome: "Fund with conditions", conditions: "Match funding" },
  { amount: fromMinorUnits(2_400_001n) },
  { reason: "Another reason." },
  { decidedBy: "Board" },
  { decisionDate: "2027-01-18" },
] as const)("treats a change to %o as a different decision", (change) => {
  expect(sameDecision(fund, { ...fund, ...change })).toBe(false);
});

it("lets a withdrawn application keep its decision readable but not changeable", () => {
  expect(canChangeDecision({})).toBe(true);
  expect(canChangeDecision({ withdrawal: { withdrawnOn: "2027-01-10" } })).toBe(false);
});
