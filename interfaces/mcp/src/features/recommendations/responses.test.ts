import { it, expect } from "vite-plus/test";

import { fromMinorUnits } from "@merit/money";
import { encodeRecommendation } from "@merit/recommendations/api";

import { savedRecommendationSchema, presentRecommendation } from "./responses";

it("encodes recommendation money exactly and keeps the committed revision and provenance", () => {
  const recommendation = {
    position: "Fund" as const,
    allocation: fromMinorUnits(9007199254740993n),
    reasoning: "Local benefit",
    author: {
      userId: "manager",
      name: "Manager",
      provenance: { interface: "mcp" as const, clientId: "verified-client" },
    },
  };
  const result = {
    status: "ok" as const,
    recommendation,
    recommendationVersion: 7,
    budget: null,
    totals: { proposed: recommendation.allocation, remaining: null, withdrawnApplications: 2 },
    internal: "private detail",
  };

  expect(savedRecommendationSchema.parse(presentRecommendation(result, "k7m2p9x4n6rt"))).toEqual({
    status: "ok",
    recommendation: encodeRecommendation(recommendation),
    applicationId: "k7m2p9x4n6rt",
    recommendationRevision: 7,
    budget: null,
    totals: {
      proposed: { minorUnits: "9007199254740993", currency: "EUR" },
      remaining: null,
      withdrawnApplications: 2,
    },
  });
  expect(presentRecommendation({ status: "conflict" }, "k7m2p9x4n6rt")).toEqual({
    status: "conflict",
  });
});
