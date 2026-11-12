import { assert, expect, it } from "vite-plus/test";

import { encodeMoney, fromMinorUnits } from "@merit/money";
import { decodeBudgetContext } from "@merit/recommendations/domain";

import {
  makeRound,
  makeReviewedApplication,
  makeApplication,
  makeAssessment,
  makeReviewRequest,
} from "../../../tests/fixtures";
import {
  decodeApplicationContext,
  decodeApplicationDetail,
  encodeApplicationDetail,
} from "./application-detail";
import { roundView } from "./round-view";

it("preserves unknown budgets, balances, and assessment allocations through application detail JSON", () => {
  const round = roundView(makeRound({ applications: [makeReviewedApplication()] }));
  const application = round.applications[0];
  assert.isDefined(application);

  const encoded = encodeApplicationDetail({ round, application });
  const decoded = decodeApplicationDetail(JSON.parse(JSON.stringify(encoded)));

  expect(encoded.round.budget).toBeNull();
  expect(encoded.round.totals.remaining).toBeNull();
  expect(encoded.application).not.toHaveProperty("assessments");
  expect(decoded.round.budget).toBeNull();
  expect(decoded.round.totals.remaining).toBeNull();
  expect(
    decoded.application.assessments.map(
      (assessment) => assessment.submission?.recommendation.allocation,
    ),
  ).toEqual([null, null]);
  expect(encodeApplicationDetail(decoded)).toEqual(encoded);
});

it.each([null, 10000n])(
  "decodes application context with budget %s and recomputes allocation totals",
  (budget) => {
    const round = makeRound();
    const context = decodeApplicationContext(
      {
        ...round,
        budget: budget === null ? null : encodeMoney(fromMinorUnits(budget)),
        totals: { proposed: { minorUnits: "0", currency: "EUR" } },
      },
      [encodeMoney(fromMinorUnits(12001n)), null],
    );

    expect(context.budget).toEqual(budget === null ? null : fromMinorUnits(budget));
    expect(encodeMoney(context.totals.proposed).minorUnits).toBe("12001");
    expect(context.totals.remaining).toEqual(budget === null ? null : fromMinorUnits(-2001n));
    expect(context.criteria).toEqual(round.criteria);
    expect(context.title).toBe(round.title);
  },
);

it("rejects application context with criteria version zero", () => {
  expect(() => decodeApplicationContext({ ...makeRound(), criteriaVersion: 0 }, [])).toThrowError(
    /criteriaVersion/,
  );
});

it("rejects application context containing a negative allocation", () => {
  expect(() =>
    decodeApplicationContext(makeRound(), [{ minorUnits: "-1", currency: "EUR" }]),
  ).toThrow();
});

it("round-trips selected evidence, review freshness and exact round-wide totals without siblings", () => {
  const round = roundView(
    makeRound({
      budget: fromMinorUnits(6000000n),
      applications: [
        makeApplication({
          version: 2,
          reviews: {
            revision: 2,
            assessments: [makeAssessment()],
            requests: [
              makeReviewRequest({
                id: "pending",
                contactId: "jules",
                reviewer: "Jules",
                applicationVersion: 2,
              }),
            ],
          },
        }),
        { ...makeReviewedApplication(), id: "sibling" },
      ],
    }),
  );
  const application = round.applications[0];

  assert.isDefined(application);

  const encoded = encodeApplicationDetail({ round, application });
  const parsed: unknown = JSON.parse(JSON.stringify(encoded));
  const decoded = decodeApplicationDetail(parsed);

  expect(encoded.round).not.toHaveProperty("applications");
  expect(Object.keys(encoded.round).sort()).toEqual([
    "budget",
    "criteria",
    "criteriaHistory",
    "criteriaVersion",
    "foundation",
    "id",
    "manager",
    "title",
    "totals",
  ]);
  expect(decoded.round.id).toBe(round.id);
  expect(encodeApplicationDetail(decoded)).toEqual(encoded);
  expect(decoded.application.assessments.map((assessment) => assessment.status)).toEqual([
    "outdated",
    "outstanding",
  ]);
  expect(decoded.application.assessments).toEqual(application.assessments);
  expect(encodeMoney(decoded.round.totals.proposed)).toEqual(encodeMoney(round.totals.proposed));
});

it("calculates an exact balance including zero and missing allocations", () => {
  const money = (minorUnits: bigint) => encodeMoney(fromMinorUnits(minorUnits));

  const context = decodeBudgetContext(money(10000n), [money(12001n), null, money(0n)]);

  expect(context.totals.remaining).toEqual(fromMinorUnits(-2001n));
});

it.each([
  { reason: "a negative budget", budget: { minorUnits: "-1", currency: "EUR" }, allocations: [] },
  {
    reason: "a negative allocation",
    budget: { minorUnits: "10000", currency: "EUR" },
    allocations: [{ minorUnits: "-1", currency: "EUR" }],
  },
  {
    reason: "fractional minor units",
    budget: { minorUnits: "10000", currency: "EUR" },
    allocations: [{ minorUnits: "1.5", currency: "EUR" }],
  },
])("rejects compact budget context with $reason", ({ budget, allocations }) => {
  expect(() => decodeBudgetContext(budget, allocations)).toThrow();
});

it.each([null, {}, { round: null }, { round: {}, application: {} }])(
  "rejects malformed detail envelopes: %j",
  (input) => {
    expect(() => decodeApplicationDetail(input)).toThrow();
  },
);
