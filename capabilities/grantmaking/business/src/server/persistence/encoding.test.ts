import { assert, expect, it } from "vite-plus/test";

import { materialVersionSchema } from "@merit/applications/domain";
import { decodeApplicationMaterial, encodeApplicationMaterial } from "@merit/applications/encoding";
import { encodeMoney, fromMinorUnits } from "@merit/money";
import {
  decodeBudgetContext,
  decodeRecommendation,
  encodeRecommendation,
} from "@merit/recommendations/encoding";
import { decodeRound, encodeRound } from "@merit/rounds/encoding";

import { makeApplication, makeRound, makeReviewedApplication } from "../../../tests/fixtures";
import {
  decodeApplication,
  decodeRoundOverview,
  encodeApplication,
  encodeRoundOverview,
} from "./encoding";

const money = (minorUnits: bigint) => encodeMoney(fromMinorUnits(minorUnits));

it("preserves amounts, evidence and versioned review history through stored round JSON", () => {
  const application = makeReviewedApplication();
  const assessment = application.reviews.assessments[0];
  assert.isDefined(assessment);
  const original = assessment.versions[0];
  assert.isDefined(original);
  original.recorder = { userId: "dana", name: "Dana", recordedAt: "2027-01-18T12:00:00Z" };
  application.evidence = [{ version: 1, passage: "The application describes weekly meals." }];
  assessment.versions.push({
    ...original,
    note: "Corrected transcription",
    content: { ...original.content, reasoning: "The corrected assessment." },
  });
  application.requested = fromMinorUnits(9007199254740995n);
  const round = makeRound({
    budget: fromMinorUnits(9007199254740993n),
    applications: [application],
  });

  const stored = encodeRoundOverview(round);
  const restored = decodeRoundOverview(JSON.parse(JSON.stringify(stored)));

  expect(encodeRoundOverview(restored)).toEqual(stored);
  expect(stored.budget).toEqual(money(9007199254740993n));
  expect(stored.applications[0]?.requested).toEqual(money(9007199254740995n));
  expect(restored.applications[0]?.reviews.assessments[0]?.versions).toEqual(assessment.versions);
  expect(restored.applications[0]?.evidence).toEqual(application.evidence);
  expect(restored.applications[0]?.managerRecommendation?.recorded).toEqual({
    date: "2027-01-18",
    applicationVersion: 1,
  });
});

it("preserves unset budgets, requested amounts and recommendations in stored records", () => {
  const round = makeRound({
    budget: null,
    applications: [makeApplication({ requested: null, managerRecommendation: null })],
  });

  const stored = encodeRoundOverview(round);
  const restored = decodeRoundOverview(JSON.parse(JSON.stringify(stored)));

  expect(stored.budget).toBeNull();
  expect(restored.budget).toBeNull();
  expect(restored.applications[0]?.requested).toBeNull();
  expect(restored.applications[0]?.managerRecommendation).toBeNull();
});

it("excludes calculated totals and assessment displays when storing and restoring records", () => {
  const record = { ...makeApplication(), assessments: [{ status: "current" }] };
  const round = { ...makeRound({ applications: [record] }), totals: { remaining: money(100n) } };
  const stored = encodeRoundOverview(round);
  const restored = decodeRoundOverview({
    ...stored,
    totals: { remaining: money(500n) },
    applications: [{ ...stored.applications[0], assessments: [] }],
  });

  expect(stored).not.toHaveProperty("totals");
  expect(stored.applications[0]).not.toHaveProperty("assessments");
  expect(restored).not.toHaveProperty("totals");
  expect(restored.applications[0]).not.toHaveProperty("assessments");
});

it.each([null, fromMinorUnits(12501n)])(
  "stores received material separately from staff work and live contact details: %s",
  (requested) => {
    const application = makeApplication({
      requested,
      summary: "Staff interpretation",
      contactId: "current-contact",
      submission: {
        version: 1,
        organization: "Applicant",
        contact: "Live name",
        contactEmail: "person@example.test",
        answers: [
          {
            questionId: "9e8cdd06-b965-551e-938f-43d2df580864",
            question: "Purpose",
            response: "Community meals",
          },
        ],
      },
    });
    const material = encodeApplicationMaterial(application);
    const restored = decodeApplicationMaterial(JSON.parse(JSON.stringify(material)));

    expect(encodeApplicationMaterial(restored)).toEqual(material);
    expect(restored.requested).toEqual(requested);
    expect(material).not.toHaveProperty("summary");
    expect(material).not.toHaveProperty("reviews");
    expect(material).not.toHaveProperty("contactId");
    expect(restored.submission).toEqual({
      version: 1,
      organization: "Applicant",
      answers: [
        {
          questionId: "9e8cdd06-b965-551e-938f-43d2df580864",
          question: "Purpose",
          response: "Community meals",
        },
      ],
    });
    expect(application.submission).toHaveProperty("contact", "Live name");
  },
);

it("keeps application records out of stored round history", () => {
  const round = makeRound({ applications: [makeReviewedApplication()] });

  const stored = encodeRound(round);

  expect(stored).not.toHaveProperty("applications");
  expect(decodeRound(stored)).not.toHaveProperty("applications");
});

it("preserves each application version's own summary and requested amount", () => {
  const before = makeApplication({ version: 1, summary: "Original staff summary" });
  const after = {
    ...before,
    version: materialVersionSchema.parse(2),
    summary: "Revised staff summary",
    requested: fromMinorUnits(2500001n),
  };

  const decodedBefore = decodeApplication(JSON.parse(JSON.stringify(encodeApplication(before))));
  const decodedAfter = decodeApplication(JSON.parse(JSON.stringify(encodeApplication(after))));

  expect(decodedBefore.version).toBe(1);
  expect(decodedBefore.summary).toBe("Original staff summary");
  expect(decodedAfter.version).toBe(2);
  expect(decodedAfter.summary).toBe("Revised staff summary");
  expect(decodedAfter.requested).toEqual(fromMinorUnits(2500001n));
});

it("preserves a recorded deferral with a zero allocation", () => {
  const recommendation = {
    position: "Defer" as const,
    allocation: fromMinorUnits(0n),
    reasoning: "Wait for updated evidence.",
  };

  expect(
    decodeRecommendation(JSON.parse(JSON.stringify(encodeRecommendation(recommendation)))),
  ).toEqual(recommendation);
});

it.each([
  { reason: "funding allocated to a deferral", position: "Defer", allocation: money(1n) },
  { reason: "zero funding", position: "Fund", allocation: money(0n) },
  {
    reason: "fractional minor units",
    position: "Fund",
    allocation: { minorUnits: "1.5", currency: "EUR" },
  },
])("rejects stored recommendations with $reason", ({ position, allocation }) => {
  expect(() => decodeRecommendation({ position, allocation, reasoning: "Proceed" })).toThrow();
});

it.each([
  { reason: "a negative budget", change: { budget: money(-1n) } },
  { reason: "a timestamp as the meeting date", change: { meetingDate: "2027-01-18T12:00:00Z" } },
])("rejects a stored round with $reason", ({ change }) => {
  expect(() => decodeRound({ ...encodeRound(makeRound()), ...change })).toThrow();
});

it("rejects stored material with version zero", () => {
  const material = encodeApplicationMaterial(makeApplication());

  expect(() => decodeApplicationMaterial({ ...material, version: 0 })).toThrowError(/version/);
});

it("rejects a stored application with a negative requested amount", () => {
  const application = encodeApplication(makeApplication());

  expect(() => decodeApplication({ ...application, requested: money(-1n) })).toThrowError(
    /requested/,
  );
});

it("rejects an unrecognized assessment position in a stored application", () => {
  const application = encodeApplication(makeReviewedApplication());
  const assessment = application.reviews.assessments[0];
  assert.isDefined(assessment);
  const version = assessment.versions[0];
  assert.isDefined(version);
  const reviews = {
    ...application.reviews,
    assessments: [
      {
        ...assessment,
        versions: [{ ...version, content: { ...version.content, position: "Unknown outcome" } }],
      },
    ],
  };

  expect(() => decodeApplication({ ...application, reviews })).toThrowError(/position/);
});

it.each([null, money(10000n)])(
  "calculates allocation totals with an unknown or exceeded budget: %s",
  (budget) => {
    const context = decodeBudgetContext(budget, [money(12001n), null, money(0n)], 0);
    expect(encodeMoney(context.totals.proposed)).toEqual(money(12001n));
    expect(context.budget).toEqual(budget === null ? null : fromMinorUnits(10000n));
    expect(context.totals.remaining).toEqual(budget === null ? null : fromMinorUnits(-2001n));
  },
);

it.each([
  { reason: "a negative budget", budget: money(-1n), allocations: [] },
  { reason: "a negative allocation", budget: null, allocations: [money(-1n)] },
  {
    reason: "fractional minor units",
    budget: null,
    allocations: [{ minorUnits: "1.5", currency: "EUR" }],
  },
])("rejects stored allocation context with $reason", ({ budget, allocations }) => {
  expect(() => decodeBudgetContext(budget, allocations, 0)).toThrow();
});

it("propagates overflow when stored allocations exceed the money limit", () => {
  expect(() => decodeBudgetContext(null, [money(10n ** 30n - 1n), money(1n)], 0)).toThrow(
    RangeError,
  );
});
