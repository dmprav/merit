import { afterEach, expect, it, vi } from "vite-plus/test";

import { encodeMoney, fromMinorUnits } from "@merit/money";
import * as money from "@merit/money";

import {
  commitmentOf,
  commitmentTotalProblem,
  commitmentTotals,
  previewCommitment,
  readyForFunding,
} from "./commitment";
import { decodeCommitmentContext } from "./encoding";

afterEach(() => vi.restoreAllMocks());

const euros = (amount: number) => fromMinorUnits(BigInt(amount) * 100n);

const maximum = fromMinorUnits(10n ** 30n - 1n);

// A €60,000 round holding a €24,000 award and a €28,000 conditional award leaves €8,000.
const round = { budget: euros(60_000), committed: euros(52_000) };

it("holds funding until the application is past preparation and states a request", () => {
  expect(readyForFunding({ intakeStatus: "in_preparation", requested: euros(10) })).toBe(false);
  expect(readyForFunding({ intakeStatus: "ready", requested: null })).toBe(false);
  expect(readyForFunding({ intakeStatus: "ready", requested: euros(10) })).toBe(true);
});

it("reserves an amount only for decisions that commit funding", () => {
  expect(commitmentOf({ outcome: "Fund", amount: euros(10) })).toEqual(euros(10));
  expect(commitmentOf({ outcome: "Fund with conditions", amount: euros(10) })).toEqual(euros(10));
  expect(commitmentOf({ outcome: "Defer", amount: euros(0) })).toEqual(euros(0));
  expect(commitmentOf({ outcome: "Decline", amount: euros(0) })).toEqual(euros(0));
  expect(commitmentOf(null)).toEqual(euros(0));
});

it("counts conditional awards in full toward the committed total", () => {
  expect(commitmentTotals(euros(60_000), [euros(24_000), euros(28_000)])).toEqual({
    committed: euros(52_000),
    available: euros(8_000),
  });
  expect(commitmentTotals(null, [euros(24_000)])).toEqual({
    committed: euros(24_000),
    available: null,
  });
});

it("accepts an award that fits the available budget", () => {
  expect(previewCommitment(round, null, { outcome: "Fund", amount: euros(8_000) })).toEqual({
    ok: true,
    totals: { committed: euros(60_000), available: euros(0) },
  });
});

it("rejects an award above the available budget with the budget, committed total, and excess", () => {
  expect(previewCommitment(round, null, { outcome: "Fund", amount: euros(9_000) })).toEqual({
    ok: false,
    error: "commitment_exceeds_budget",
    budget: euros(60_000),
    committed: euros(61_000),
    excess: euros(1_000),
  });
});

it("replaces the application's current commitment instead of adding to it", () => {
  const current = { outcome: "Fund" as const, amount: euros(24_000) };
  expect(
    previewCommitment(round, current, { outcome: "Fund with conditions", amount: euros(32_000) }),
  ).toEqual({ ok: true, totals: { committed: euros(60_000), available: euros(0) } });
  expect(previewCommitment(round, current, { outcome: "Decline", amount: euros(0) })).toEqual({
    ok: true,
    totals: { committed: euros(28_000), available: euros(32_000) },
  });
});

it("requires a budget before funding but never blocks Defer or Decline", () => {
  const unbudgeted = { budget: null, committed: euros(0) };
  expect(previewCommitment(unbudgeted, null, { outcome: "Fund", amount: euros(1) })).toEqual({
    ok: false,
    error: "budget_required",
    budget: null,
    committed: euros(1),
    excess: null,
  });
  expect(previewCommitment(unbudgeted, null, { outcome: "Defer", amount: euros(0) })).toEqual({
    ok: true,
    totals: { committed: euros(0), available: null },
  });
  const over = { budget: euros(10), committed: euros(20) };
  expect(previewCommitment(over, null, { outcome: "Decline", amount: euros(0) })).toMatchObject({
    ok: true,
  });
});

it("reports a committed total beyond the money contract", () => {
  expect(
    previewCommitment({ budget: null, committed: maximum }, null, {
      outcome: "Fund",
      amount: euros(1),
    }),
  ).toEqual({ ok: false, error: "committed_total_too_large" });
  expect(commitmentTotalProblem([maximum, euros(1)])).toBe("committed_total_too_large");
  expect(commitmentTotalProblem([maximum])).toBeNull();
});

it("decodes stored commitments into totals and rejects a negative one", () => {
  const context = decodeCommitmentContext(
    encodeMoney(euros(60_000)),
    [encodeMoney(euros(24_000)), encodeMoney(euros(28_000))],
    2,
  );
  expect(context).toEqual({
    budget: euros(60_000),
    totals: { committed: euros(52_000), available: euros(8_000), withdrawnApplications: 2 },
  });
  expect(() => decodeCommitmentContext(null, [encodeMoney(fromMinorUnits(-1n))], 0)).toThrow();
});

it("does not treat unexpected calculation failures as a commitment limit", () => {
  const failure = new Error("unavailable");
  vi.spyOn(money, "sum").mockImplementation(() => {
    throw failure;
  });
  expect(() => commitmentTotalProblem([euros(1)])).toThrow(failure);
  vi.restoreAllMocks();
  vi.spyOn(money, "add").mockImplementation(() => {
    throw failure;
  });
  expect(() => previewCommitment(round, null, { outcome: "Fund", amount: euros(1) })).toThrow(
    failure,
  );
});
