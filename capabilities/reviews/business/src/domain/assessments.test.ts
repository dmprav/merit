import { expect, it } from "vite-plus/test";

import { materialVersionSchema } from "@merit/applications/domain";
import { fromMinorUnits } from "@merit/money";
import { criteriaVersionSchema } from "@merit/rounds/domain";

import { reviewAssessments } from "./assessments";
import { emptyReviews, reviewStateSchema } from "./reviews";

const current = {
  applicationVersion: materialVersionSchema.parse(2),
  criteriaVersion: criteriaVersionSchema.parse(1),
  criteria: [{ id: "fd95f96c-1270-51c5-a64f-5649f25186d9", title: "Fit" }],
};
const version = {
  content: {
    applicationVersion: current.applicationVersion,
    criteriaVersion: current.criteriaVersion,
    reasoning: "Evidence shows a local need.",
    position: null,
    amount: null,
    date: null,
    observations: [],
  },
  criteria: current.criteria,
  recorder: null,
  note: "",
};
const assessment = {
  id: "2c92018b-fcad-5d1e-b25c-1fa6430a57af",
  contactId: "reviewer",
  reviewer: "Sam",
  requestId: null,
  previousId: null,
  versions: [version],
};
const request = {
  ...current,
  id: "2c343adf-a49f-50bd-8d8d-6c676aec4bdc",
  contactId: "reviewer",
  reviewer: "Sam",
  status: "outstanding",
  recorder: null,
  closedBy: null,
};

it("shows only the latest amendment of a follow-up judgment", () => {
  const allocated = fromMinorUnits(3500n);
  const latest = {
    ...version,
    content: {
      ...version.content,
      position: "Fund",
      amount: { minorUnits: "3500", currency: "EUR" },
      reasoning: "Revised assessment",
    },
  };
  const followUp = {
    ...assessment,
    id: crypto.randomUUID(),
    previousId: assessment.id,
    versions: [version, latest],
  };
  const state = reviewStateSchema.parse({
    revision: 3,
    assessments: [assessment, followUp],
    requests: [
      { ...request, status: "received" },
      { ...request, id: crypto.randomUUID(), status: "cancelled" },
    ],
  });

  expect(reviewAssessments(state, current)).toMatchObject([
    {
      id: followUp.id,
      status: "current",
      submission: {
        reasoning: "Revised assessment",
        recommendation: { position: "Fund", allocation: allocated },
      },
    },
  ]);
});

it("shows an outstanding follow-up beside a judgment on an earlier material version", () => {
  const earlierVersion = { ...version, content: { ...version.content, applicationVersion: 1 } };
  const state = reviewStateSchema.parse({
    revision: 2,
    assessments: [{ ...assessment, versions: [earlierVersion] }],
    requests: [request],
  });

  expect(reviewAssessments(state, current)).toMatchObject([
    { id: assessment.id, status: "outdated" },
    { id: request.id, requestId: request.id, status: "outstanding", submission: null },
  ]);
});

it("marks a judgment with unknown recorded material and criteria as unknown", () => {
  const unknown = {
    ...version,
    content: { ...version.content, applicationVersion: null, criteriaVersion: null },
    criteria: null,
  };

  expect(
    reviewAssessments(
      { ...emptyReviews(), assessments: [{ ...assessment, versions: [unknown] }] },
      current,
    ),
  ).toMatchObject([{ status: "unknown", criteriaUnknown: true }]);
});

it("distinguishes changed current criteria from unavailable current criteria", () => {
  const state = { ...emptyReviews(), assessments: [assessment] };

  expect(reviewAssessments(state, { ...current, criteria: [] })).toMatchObject([
    { status: "outdated", criteriaChanged: true, criteriaUnknown: false },
  ]);
  expect(
    reviewAssessments(state, { ...current, criteria: null, criteriaVersion: null }),
  ).toMatchObject([
    {
      status: "unknown",
      criteriaChanged: false,
      criteriaUnknown: true,
      basisComparison: { criteriaContent: "unknown", criteriaVersion: "unknown" },
    },
  ]);
  expect(state.requests).toEqual([]);
});
