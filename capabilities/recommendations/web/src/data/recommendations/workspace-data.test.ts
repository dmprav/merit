import { QueryClient } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vite-plus/test";

import { encodeMoney, fromMinorUnits } from "@merit/money";
import { encodeRecommendation } from "@merit/recommendations/api";

import { createRecommendationData, type RecommendationSaved } from "./workspace-data";

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
afterEach(() => client.clear());

type CachedApplication = {
  status: "ok";
  recommendation: ReturnType<typeof encodeRecommendation> | null;
  revision: number;
};

it("applies saved recommendations through the injected cache updater and invalidates round scope", async () => {
  const queryKey = ["alder", "application", "app-1"] as const;
  const roundScope = ["alder", "rounds"] as const;
  const initial: CachedApplication = { status: "ok", recommendation: null, revision: 1 };
  client.setQueryData(queryKey, initial);
  client.setQueryData(roundScope, [{ id: "round-1" }]);

  const recommendation = {
    position: "Fund" as const,
    allocation: fromMinorUnits(150000n),
    reasoning: "Strong fit.",
  };
  const saved: RecommendationSaved = {
    status: "ok",
    recommendation: encodeRecommendation(recommendation),
    recommendationVersion: 2,
    budget: encodeMoney(fromMinorUnits(1000000n)),
    totals: {
      proposed: encodeMoney(fromMinorUnits(150000n)),
      remaining: encodeMoney(fromMinorUnits(850000n)),
    },
  };
  const save = vi.fn().mockResolvedValue(saved);
  const applySaved = vi.fn((cached: CachedApplication, result: RecommendationSaved) => ({
    ...cached,
    recommendation: result.recommendation,
    revision: result.recommendationVersion,
  }));

  const data = createRecommendationData(
    client,
    { workspaceSlug: "alder", publicId: "app-1", revision: 1 },
    {
      application: { queryKey, queryFn: async () => initial },
      roundScope,
      save,
      applySaved,
    },
  );

  expect(
    await data.save(recommendation, { expectedRevision: 1, expectedApplicationVersion: 1 }),
  ).toEqual(saved);
  expect(applySaved).toHaveBeenCalledWith(initial, saved);
  expect(client.getQueryData(queryKey)).toEqual({
    status: "ok",
    recommendation: saved.recommendation,
    revision: 2,
  });
  expect(client.getQueryState(roundScope)?.isInvalidated).toBe(true);
});

it("refreshes the application query on conflict without failing when reload errors", async () => {
  const queryKey = ["alder", "application", "app-1"] as const;
  const queryFn = vi.fn<() => Promise<CachedApplication>>().mockRejectedValue(new Error("Offline"));
  const data = createRecommendationData(
    client,
    { workspaceSlug: "alder", publicId: "app-1", revision: 1 },
    {
      application: { queryKey, queryFn },
      roundScope: ["alder", "rounds"],
      save: vi.fn().mockResolvedValue({ status: "conflict" }),
      applySaved: (cached) => cached,
    },
  );

  expect(
    await data.save(
      { position: "Defer", allocation: fromMinorUnits(0n), reasoning: "Hold." },
      { expectedRevision: 1, expectedApplicationVersion: 1 },
    ),
  ).toEqual({ status: "conflict" });
  expect(queryFn).toHaveBeenCalledTimes(1);
});
