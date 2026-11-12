import { assert, afterEach, expect, it, vi } from "vite-plus/test";

import { encodeApplicationDetail } from "@merit/grantmaking/api";
import { roundView } from "@merit/grantmaking/api";
import { makeApplication, makeRound } from "@merit/grantmaking/testing/fixtures";
import { fromMinorUnits, encodeMoney } from "@merit/money";
import { createQueryClient } from "@merit/query";
import { encodeRecommendation } from "@merit/recommendations/api";

import { grantWorkQueryKey } from "../../../../shared/grant-work-query-key";
import { applicationOptions, roundsOptions } from "../queries";
import { readFundingApplicationPage } from "../server/funding-round.functions";
import { saveRecommendation } from "../server/recommendations/recommendations.functions";
import { workspaceRecommendationData } from "./workspace-data";

vi.mock("../server/funding-round.functions", () => ({ readFundingApplicationPage: vi.fn() }));
vi.mock("../server/recommendations/recommendations.functions", () => ({
  saveRecommendation: vi.fn(),
}));
const client = createQueryClient();
afterEach(() => {
  client.clear();
  vi.resetAllMocks();
});
const round = roundView(
  makeRound({
    budget: fromMinorUnits(10000000n),
    applications: [
      makeApplication({
        version: 2,
        intakeStatus: "ready",
        requested: fromMinorUnits(1500000n),
        managerRecommendation: {
          position: "Fund",
          allocation: fromMinorUnits(1000000n),
          reasoning: "Original allocation",
        },
      }),
    ],
  }),
);
const [application] = round.applications;
assert.isDefined(application);
const page = {
  status: "ok" as const,
  ...encodeApplicationDetail({ round, application }),
  recommendationVersion: 3,
  intake: { revision: 7, workingRevision: null, history: [] },
  workspaceSlug: "alder",
};
const options = applicationOptions("alder", "b8q3w5j7c2df");
const recommendation = {
  position: "Fund" as const,
  allocation: fromMinorUnits(1250000n),
  reasoning: "Updated allocation",
};
const baseline = { expectedRevision: 3, expectedApplicationVersion: page.application.version };

it("updates the saved recommendation and totals while invalidating only this workspace's round data", async () => {
  client.setQueryData(options.queryKey, page);
  const roundsKey = roundsOptions("alder").queryKey;
  const unaffected = [roundsOptions("birch").queryKey, [...grantWorkQueryKey("alder"), "contacts"]];
  for (const key of [roundsKey, ...unaffected]) {
    client.setQueryData(key, { status: "not_found" });
  }

  const saved = {
    status: "ok" as const,
    recommendation: encodeRecommendation(recommendation),
    recommendationVersion: 4,
    budget: encodeMoney(fromMinorUnits(10000000n)),
    totals: {
      proposed: encodeMoney(fromMinorUnits(1250000n)),
      remaining: encodeMoney(fromMinorUnits(8750000n)),
    },
  };
  vi.mocked(saveRecommendation).mockResolvedValue(saved);
  const data = workspaceRecommendationData(client, "alder", "b8q3w5j7c2df", 3, saveRecommendation);

  expect(await data.save(recommendation, baseline)).toEqual(saved);
  expect(saveRecommendation).toHaveBeenCalledWith({
    data: {
      workspaceSlug: "alder",
      publicId: "b8q3w5j7c2df",
      ...baseline,
      recommendation: saved.recommendation,
    },
  });
  expect(client.getQueryData(options.queryKey)).toEqual({
    ...page,
    application: { ...page.application, managerRecommendation: saved.recommendation },
    round: { ...page.round, budget: saved.budget, totals: saved.totals },
    recommendationVersion: 4,
  });
  expect(client.getQueryState(roundsKey)?.isInvalidated).toBe(true);
  expect(client.getQueryState(options.queryKey)?.isInvalidated).toBe(true);

  for (const key of unaffected) {
    expect(client.getQueryState(key)?.isInvalidated).toBe(false);
  }
});

it("reloads the current application on conflict without applying the rejected recommendation", async () => {
  client.setQueryData(options.queryKey, page);
  const latest = {
    ...page,
    application: {
      ...page.application,
      managerRecommendation: encodeRecommendation({
        position: "Defer",
        allocation: fromMinorUnits(0n),
        reasoning: "Await the revised proposal.",
      }),
    },
    recommendationVersion: 5,
  };
  vi.mocked(saveRecommendation).mockResolvedValue({ status: "conflict" });
  vi.mocked(readFundingApplicationPage).mockResolvedValue(latest);
  const data = workspaceRecommendationData(client, "alder", "b8q3w5j7c2df", 3, saveRecommendation);

  expect(await data.save(recommendation, baseline)).toEqual({ status: "conflict" });
  expect(client.getQueryData(options.queryKey)).toEqual(latest);
});

it("retains a known conflict when refreshing the latest application fails", async () => {
  client.setQueryData(options.queryKey, page);
  vi.mocked(saveRecommendation).mockResolvedValue({ status: "conflict" });
  vi.mocked(readFundingApplicationPage).mockResolvedValue({ status: "unavailable" });
  const data = workspaceRecommendationData(client, "alder", "b8q3w5j7c2df", 3, saveRecommendation);

  expect(await data.save(recommendation, baseline)).toEqual({ status: "conflict" });
  expect(client.getQueryData(options.queryKey)).toEqual(page);
});
