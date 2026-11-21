import { describe, expect, it } from "vite-plus/test";

import { applicationOverviewSchema, workspaceApplicationsInput } from "./application-overview";

const summary = {
  id: "b8q3w5j7c2df",
  title: "Workshop Saturdays",
  applicant: null,
  roundId: "k7m2p9x4n6rt",
  roundTitle: "Community grants",
  intakeStatus: "in_preparation",
  withdrawn: false,
  requested: null,
  reviews: { current: 0, outdated: 1, outstanding: 1, unknown: 0 },
  criteriaChanged: false,
  recommendation: null,
};

it("excludes application material from workspace summaries", () => {
  expect(applicationOverviewSchema.parse({ ...summary, submission: { answers: [] } })).toEqual(
    summary,
  );
});

it("keeps a summary with a recommendation serializable", () => {
  const recommended = {
    ...summary,
    recommendation: {
      position: "Fund",
      outdated: true,
      allocation: { minorUnits: "0", currency: "EUR" as const },
    },
  };

  expect(applicationOverviewSchema.parse(JSON.parse(JSON.stringify(recommended)))).toEqual(
    recommended,
  );
});

it.each([
  { id: "invalid" },
  { intakeStatus: "approved" },
  { reviews: { ...summary.reviews, current: -1 } },
  {
    recommendation: {
      position: "Approved",
      outdated: false,
      allocation: { minorUnits: "0", currency: "EUR" as const },
    },
  },
])("rejects invalid summary data: %j", (invalid) => {
  expect(applicationOverviewSchema.safeParse({ ...summary, ...invalid }).success).toBe(false);
});

describe("workspace application filters", () => {
  const request = { workspaceSlug: "alder" };

  it("defaults to any criteria", () => {
    expect(workspaceApplicationsInput.parse(request).filter).toEqual({});
  });

  it("accepts a value for every independent dimension together", () => {
    const filter = {
      participation: "withdrawn",
      readiness: "ready",
      reviews: "awaiting",
      evidence: "changed",
      recommendation: "missing",
    };

    expect(workspaceApplicationsInput.parse({ ...request, filter }).filter).toEqual(filter);
  });

  it.each([
    "all",
    { participation: "ready" },
    { readiness: "withdrawn" },
    { reviews: "current" },
    { evidence: "stale" },
    { recommendation: "written" },
    { other: "awaiting" },
  ])("rejects filter %j", (filter) => {
    expect(workspaceApplicationsInput.safeParse({ ...request, filter }).success).toBe(false);
  });
});
