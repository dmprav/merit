import { expect, it } from "vite-plus/test";

import { applicationOverviewSchema } from "./application-overview";

const summary = {
  id: "b8q3w5j7c2df",
  title: "Workshop Saturdays",
  applicant: null,
  roundId: "k7m2p9x4n6rt",
  roundTitle: "Community grants",
  intakeStatus: "in_preparation",
  withdrawn: false,
  reviews: { current: 0, outdated: 1, outstanding: 1, unknown: 0 },
  criteriaChanged: false,
  recommendation: null,
};

it("keeps workspace summaries serializable and excludes application material", () => {
  expect(applicationOverviewSchema.parse({ ...summary, submission: { answers: [] } })).toEqual(
    summary,
  );
  const recommended = { ...summary, recommendation: { position: "Fund", outdated: true } };
  expect(applicationOverviewSchema.parse(JSON.parse(JSON.stringify(recommended)))).toEqual(
    recommended,
  );
});

it.each([
  { id: "invalid" },
  { intakeStatus: "approved" },
  { reviews: { ...summary.reviews, current: -1 } },
  { recommendation: { position: "Approved", outdated: false } },
])("rejects invalid summary data: %j", (invalid) => {
  expect(applicationOverviewSchema.safeParse({ ...summary, ...invalid }).success).toBe(false);
});
