import { expect, it } from "vite-plus/test";

import { materialVersionSchema } from "@merit/applications/domain";

import { assessmentStatus, summarizeAssessments } from "./index";

it("counts each review status separately without changing the assessments", () => {
  const assessments = [
    { status: "current" },
    { status: "outdated" },
    { status: "outstanding" },
    { status: "unknown" },
    { status: "current" },
  ] as const;
  const before = structuredClone(assessments);

  expect(summarizeAssessments(assessments)).toEqual({
    current: 2,
    outdated: 1,
    outstanding: 1,
    unknown: 1,
  });
  expect(assessments).toEqual(before);
});

it("returns zero counts when no reviews have been assigned", () => {
  expect(summarizeAssessments([])).toEqual({ current: 0, outdated: 0, outstanding: 0, unknown: 0 });
});

it.each([
  [{ criteriaChanged: false, criteriaUnknown: false, submission: null }, "outstanding"],
  [
    {
      criteriaChanged: true,
      criteriaUnknown: false,
      submission: { applicationVersion: materialVersionSchema.parse(2) },
    },
    "outdated",
  ],
  [
    {
      criteriaChanged: false,
      criteriaUnknown: false,
      submission: { applicationVersion: materialVersionSchema.parse(1) },
    },
    "outdated",
  ],
  [
    { criteriaChanged: false, criteriaUnknown: false, submission: { applicationVersion: null } },
    "unknown",
  ],
  [
    {
      criteriaChanged: false,
      criteriaUnknown: true,
      submission: { applicationVersion: materialVersionSchema.parse(2) },
    },
    "unknown",
  ],
  [
    {
      criteriaChanged: false,
      criteriaUnknown: false,
      submission: { applicationVersion: materialVersionSchema.parse(2) },
    },
    "current",
  ],
] as const)("classifies review currency from its recorded basis: %j", (review, status) => {
  expect(assessmentStatus(review, materialVersionSchema.parse(2))).toBe(status);
});
