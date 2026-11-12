import { afterEach, assert, expect, it, vi } from "vite-plus/test";

import { materialVersionSchema } from "@merit/applications/domain";
import { fromMinorUnits, encodeMoney } from "@merit/money";
import * as money from "@merit/money";
import { criteriaVersionSchema } from "@merit/rounds/domain";

import { makeApplication, makeRound } from "../../../tests/fixtures";
import type { ApplicationRecord } from "../../domain/model";
import { updateRecommendation } from "./recommendation-preview";
import { roundView } from "./round-view";

afterEach(() => vi.restoreAllMocks());

const application = (id: string, allocation: bigint): ApplicationRecord =>
  makeApplication({
    id,
    title: id,
    version: 2,
    requested: fromMinorUnits(10000n),
    intakeStatus: "ready",
    managerRecommendation: {
      position: "Fund",
      allocation: fromMinorUnits(allocation),
      reasoning: "Original recommendation.",
      recorded: { date: "2027-01-18", applicationVersion: 2 },
    },
  });

const recommendationRound = () => {
  const selected = application("selected", 2000n);
  selected.reviews.assessments.push({
    id: "assessment",
    contactId: "reviewer",
    reviewer: "Sam",
    requestId: null,
    previousId: null,
    versions: [
      {
        content: {
          applicationVersion: materialVersionSchema.parse(1),
          criteriaVersion: criteriaVersionSchema.parse(1),
          date: null,
          position: "Fund",
          amount: "20.00",
          reasoning: "Original assessment.",
          observations: [],
        },
        criteria: [],
        recorder: null,
        note: "",
      },
    ],
  });

  return roundView(
    makeRound({
      budget: fromMinorUnits(10000n),
      applications: [selected, application("sibling", 3000n)],
    }),
  );
};

it("propagates an unexpected round calculation failure without changing recommendations", () => {
  const round = recommendationRound();
  const before = structuredClone(round);
  const failure = new Error("Round calculation failed");
  vi.spyOn(money, "subtract").mockImplementation(() => {
    throw failure;
  });

  try {
    updateRecommendation(round, "selected", {
      position: "Fund",
      allocation: fromMinorUnits(4000n),
      reasoning: "Support the plan.",
    });
    assert.fail("Expected the calculation failure");
  } catch (error) {
    expect(error).toBe(failure);
  }
  expect(round).toEqual(before);
});

it("maps an overflowing round calculation to an allocation error and leaves every application unchanged", () => {
  const source = makeRound({
    applications: [
      { ...application("selected", 2000n), requested: fromMinorUnits(10n ** 30n - 1n) },
      { ...application("sibling", 3000n), requested: fromMinorUnits(1n) },
    ],
  });
  const before = structuredClone(source.applications);

  expect(
    updateRecommendation(source, "selected", {
      position: "Fund",
      allocation: fromMinorUnits(100n),
      reasoning: "Support it.",
    }),
  ).toEqual({ ok: false, error: "allocation_total_too_large" });
  expect(source.applications).toEqual(before);
});

it.each([
  [4000n, "7000", "3000"],
  [8001n, "11001", "-1001"],
])(
  "replaces €20 with %s cents, preserving sibling allocations, evidence and the source",
  (allocation, proposed, remaining) => {
    const source = recommendationRound();
    const before = structuredClone(source);

    const result = updateRecommendation(source, "selected", {
      position: "Fund with a condition",
      allocation: fromMinorUnits(allocation),
      reasoning: "  Confirm the venue.  ",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error);
    }
    expect(encodeMoney(result.round.totals.proposed).minorUnits).toBe(proposed);
    expect(encodeMoney(result.round.totals.remaining!).minorUnits).toBe(remaining);
    assert.isDefined(result.round.applications[0]);
    assert.isDefined(source.applications[0]);
    expect(result.round.applications[0].managerRecommendation!.reasoning).toBe(
      "Confirm the venue.",
    );
    expect(result.round.applications[0].assessments).toEqual(source.applications[0].assessments);
    expect(result.round.applications[0].submission).toEqual(source.applications[0].submission);
    expect(result.round.applications[0].reviews).toEqual(source.applications[0].reviews);
    expect(result.round.applications[1]).toEqual(source.applications[1]);
    expect(source).toEqual(before);
  },
);

it("returns the domain error for an invalid recommendation and leaves the round unchanged", () => {
  const round = recommendationRound();
  const before = structuredClone(round);

  expect(
    updateRecommendation(round, "selected", {
      position: "Defer",
      allocation: fromMinorUnits(100n),
      reasoning: "Wait.",
    }),
  ).toEqual({ ok: false, error: "invalid_recommendation" });
  expect(round).toEqual(before);
});

it("rejects an unknown application", () => {
  expect(
    updateRecommendation(recommendationRound(), "missing", {
      position: "Defer",
      allocation: fromMinorUnits(0n),
      reasoning: "Wait.",
    }),
  ).toEqual({ ok: false, error: "application_not_found" });
});

it("dates the updated recommendation against current material without changing review provenance", () => {
  const round = recommendationRound();

  assert.isDefined(round.applications[0]);

  const recommendation = round.applications[0].managerRecommendation!;
  const result = updateRecommendation(
    round,
    "selected",
    {
      ...recommendation,
      recorded: { date: "2027-01-14", applicationVersion: 1 },
    },
    "2027-01-19",
  );

  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(result.error);
  }
  assert.isDefined(result.round.applications[0]);
  expect(result.round.applications[0].managerRecommendation!.recorded).toEqual({
    date: "2027-01-19",
    applicationVersion: 2,
  });
  expect(result.round.applications[0].assessments).toEqual(round.applications[0].assessments);
  expect(round.applications[0].managerRecommendation!.recorded).toEqual({
    date: "2027-01-18",
    applicationVersion: 2,
  });
});

it("rejects a recommendation recorded on an invalid calendar date", () => {
  const round = recommendationRound();

  expect(
    updateRecommendation(
      round,
      "selected",
      {
        position: "Fund",
        allocation: fromMinorUnits(4000n),
        reasoning: "Supported.",
      },
      "2027-02-30",
    ),
  ).toEqual({
    ok: false,
    error: "invalid_recommendation",
  });
});
