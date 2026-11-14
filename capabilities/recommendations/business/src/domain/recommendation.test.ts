import { afterEach, assert, expect, it, vi } from "vite-plus/test";

import { materialVersionSchema } from "@merit/applications/domain";
import { fromMinorUnits, encodeMoney } from "@merit/money";
import * as money from "@merit/money";

import {
  canChangeRecommendation,
  parseRecommendation,
  prepareRecommendation,
  previewRecommendation,
} from "./index";

afterEach(() => vi.restoreAllMocks());

const recommendationContext = () => ({
  budget: fromMinorUnits(10000n),
  totals: { proposed: fromMinorUnits(5000n) },
});

const application = () =>
  makeApplication({
    version: materialVersionSchema.parse(2),
    intakeStatus: "ready",
    requested: fromMinorUnits(10000n),
    managerRecommendation: {
      position: "Fund",
      allocation: fromMinorUnits(2000n),
      reasoning: "Original recommendation.",
    },
  });

it("propagates an unexpected preview calculation failure without changing the source", () => {
  const round = recommendationContext();
  const selected = application();
  const before = structuredClone({ round, selected });
  const failure = new Error("Money calculation failed");
  vi.spyOn(money, "subtract").mockImplementation(() => {
    throw failure;
  });

  try {
    previewRecommendation(round, selected, {
      position: "Fund",
      allocation: fromMinorUnits(4000n),
    });
    assert.fail("Expected the calculation failure");
  } catch (error) {
    expect(error).toBe(failure);
  }
  expect({ round, selected }).toEqual(before);
});

it("returns a validated recommendation with normalized reasoning", () => {
  const input = {
    position: "Fund",
    allocation: fromMinorUnits(100n),
    reasoning: "  Support the plan.  ",
  };

  expect(parseRecommendation(input)).toEqual({
    ok: true,
    recommendation: { ...input, reasoning: "Support the plan." },
  });
});

it.each([
  { input: null, field: null },
  {
    input: { position: "Unknown", allocation: fromMinorUnits(100n), reasoning: "Support it." },
    field: "position",
  },
  {
    input: { position: "Fund", allocation: fromMinorUnits(100n), reasoning: 42 },
    field: "reasoning",
  },
  {
    input: { position: "Fund", allocation: "100", reasoning: "Support it." },
    field: "allocation",
  },
  {
    input: {
      position: "Fund",
      allocation: fromMinorUnits(100n),
      reasoning: "Support it.",
      recorded: { date: "invalid", applicationVersion: 1 },
    },
    field: null,
  },
])("maps malformed recommendation input to a safe issue for $field", ({ input, field }) => {
  expect(parseRecommendation(input)).toEqual({
    ok: false,
    issues: [{ field, code: "invalid_recommendation" }],
  });
});

it.each([
  { position: "Fund", allocation: fromMinorUnits(0n) },
  { position: "Defer", allocation: fromMinorUnits(1n) },
] as const)("rejects an invalid $position preview", (outcome) => {
  const round = recommendationContext();

  expect(previewRecommendation(round, application(), outcome)).toEqual({
    ok: false,
    error: "invalid_recommendation",
  });
});

it("previews the same totals as a prepared recommendation without requiring reasoning", () => {
  const round = recommendationContext();
  const selected = application();
  const outcome = { position: "Fund" as const, allocation: fromMinorUnits(4001n) };
  const preview = previewRecommendation(round, selected, outcome);
  const saved = prepareRecommendation(round, selected, { ...outcome, reasoning: "Supported." });

  assert.isTrue(preview.ok);
  assert.isTrue(saved.ok);
  expect(preview.totals).toEqual(saved.totals);
  expect(encodeMoney(preview.totals.remaining!).minorUnits).toBe("2999");
});

it("refuses to preview or prepare a recommendation for a withdrawn application", () => {
  const withdrawn = {
    ...application(),
    withdrawal: {
      withdrawnOn: "2027-01-10",
      reason: "The applicant withdrew.",
      recorder: { userId: "manager", name: "Dana Reed", recordedAt: "2027-01-11T09:00:00Z" },
    },
  };
  const outcome = { position: "Fund" as const, allocation: fromMinorUnits(4001n) };

  expect(canChangeRecommendation(withdrawn)).toBe(false);
  expect(canChangeRecommendation(application())).toBe(true);
  expect(previewRecommendation(recommendationContext(), withdrawn, outcome)).toEqual({
    ok: false,
    error: "application_withdrawn",
  });
  expect(
    prepareRecommendation(recommendationContext(), withdrawn, {
      ...outcome,
      reasoning: "Supported.",
    }),
  ).toEqual({ ok: false, error: "application_withdrawn" });
});

it("requires reasoning to prepare a recommendation", () => {
  const round = recommendationContext();

  expect(
    prepareRecommendation(round, application(), {
      position: "Fund",
      allocation: fromMinorUnits(4001n),
      reasoning: "",
    }),
  ).toEqual({
    ok: false,
    error: "invalid_recommendation",
  });
});

it("rejects a recommendation recorded on an invalid calendar date", () => {
  expect(
    prepareRecommendation(
      recommendationContext(),
      application(),
      {
        position: "Fund",
        allocation: fromMinorUnits(4000n),
        reasoning: "Supported.",
      },
      "2027-02-30",
    ),
  ).toEqual({ ok: false, error: "invalid_recommendation" });
});

it("releases a saved allocation when the recommendation is deferred", () => {
  expect(
    previewRecommendation(recommendationContext(), application(), {
      position: "Defer",
      allocation: fromMinorUnits(0n),
    }),
  ).toEqual({
    ok: true,
    totals: { proposed: fromMinorUnits(3000n), remaining: fromMinorUnits(7000n) },
  });
});

it("leaves the remaining budget unknown when no budget has been set", () => {
  const round = recommendationContext();

  expect(
    previewRecommendation({ ...round, budget: null }, application(), {
      position: "Fund",
      allocation: fromMinorUnits(4001n),
    }),
  ).toEqual({
    ok: true,
    totals: { proposed: fromMinorUnits(7001n), remaining: null },
  });
});

it("refuses a funding preview for an application still in preparation", () => {
  const round = recommendationContext();

  expect(
    previewRecommendation(
      round,
      { ...application(), intakeStatus: "in_preparation" },
      {
        position: "Fund",
        allocation: fromMinorUnits(4001n),
      },
    ),
  ).toEqual({
    ok: false,
    error: "application_not_ready",
  });
});

it.each([
  {
    scenario: "a blank explanation and zero funding",
    input: {
      position: "Fund",
      allocation: fromMinorUnits(0n),
      reasoning: "  ",
    },
    issues: [
      { field: "reasoning", code: "reasoning_required" },
      { field: "allocation", code: "positive_allocation" },
    ],
  },
  {
    scenario: "funding allocated to a deferral",
    input: {
      position: "Defer",
      allocation: fromMinorUnits(100n),
      reasoning: "Wait.",
    },
    issues: [{ field: "allocation", code: "deferral_allocation" }],
  },
  {
    scenario: "a negative allocation",
    input: {
      position: "Fund",
      allocation: fromMinorUnits(-1n),
      reasoning: "Proceed.",
    },
    issues: [{ field: "allocation", code: "invalid_recommendation" }],
  },
  {
    scenario: "an explanation longer than 5,000 characters",
    input: {
      position: "Fund",
      allocation: fromMinorUnits(100n),
      reasoning: "a".repeat(5001),
    },
    issues: [{ field: "reasoning", code: "reasoning_too_long" }],
  },
])("reports typed field issues for $scenario", ({ input, issues }) => {
  expect(parseRecommendation(input)).toEqual({ ok: false, issues });
});

it("replaces an allocation at the money limit without double-counting it", () => {
  const maximum = fromMinorUnits(10n ** 30n - 1n);
  const recommendation = {
    position: "Fund" as const,
    allocation: maximum,
    reasoning: "Supported.",
  };
  const result = prepareRecommendation(
    { budget: maximum, totals: { proposed: maximum } },
    {
      version: materialVersionSchema.parse(2),
      managerRecommendation: recommendation,
      intakeStatus: "ready",
      requested: maximum,
    },
    recommendation,
    "2027-01-19",
  );

  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(result.error);
  }
  expect(encodeMoney(result.totals.proposed)).toEqual(encodeMoney(maximum));
  expect(encodeMoney(result.totals.remaining!).minorUnits).toBe("0");
  expect(result.recommendation.recorded).toEqual({ date: "2027-01-19", applicationVersion: 2 });
});

it("rejects funding an application whose material is still in preparation", () => {
  expect(
    prepareRecommendation(
      { budget: null, totals: { proposed: fromMinorUnits(0n) } },
      makeApplication({ intakeStatus: "in_preparation", requested: null }),
      { position: "Fund", allocation: fromMinorUnits(100n), reasoning: "Support it." },
    ),
  ).toEqual({ ok: false, error: "application_not_ready" });
});

it("allows an explained deferral while an application is still in preparation", () => {
  const recommendation = {
    position: "Defer",
    allocation: fromMinorUnits(0n),
    reasoning: "Await the requested amount.",
  };

  const result = prepareRecommendation(
    { budget: null, totals: { proposed: fromMinorUnits(0n) } },
    makeApplication({ intakeStatus: "in_preparation", requested: null }),
    recommendation,
  );

  expect(result).toEqual({
    ok: true,
    recommendation,
    totals: { proposed: fromMinorUnits(0n), remaining: null },
  });
});

const makeApplication = (
  overrides: Partial<Parameters<typeof prepareRecommendation>[1]> = {},
): Parameters<typeof prepareRecommendation>[1] => ({
  version: materialVersionSchema.parse(1),
  intakeStatus: "in_preparation",
  requested: null,
  managerRecommendation: null,
  ...overrides,
});

it("rejects a proposal that would overflow total allocations", () => {
  const maximum = fromMinorUnits(10n ** 30n - 1n);
  expect(
    previewRecommendation(
      { budget: null, totals: { proposed: maximum } },
      makeApplication({ intakeStatus: "ready", requested: fromMinorUnits(1n) }),
      { position: "Fund", allocation: fromMinorUnits(1n) },
    ),
  ).toEqual({ ok: false, error: "allocation_total_too_large" });
});
