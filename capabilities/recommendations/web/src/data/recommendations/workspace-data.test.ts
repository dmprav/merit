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
      withdrawnApplications: 0,
    },
  };
  const save = vi.fn().mockResolvedValue(saved);

  const applySaved = (cached: CachedApplication, result: RecommendationSaved) => ({
    ...cached,
    recommendation: result.recommendation,
    revision: result.recommendationVersion,
  });

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
  expect(client.getQueryData(queryKey)).toEqual({
    status: "ok",
    recommendation: saved.recommendation,
    revision: 2,
  });
  expect(client.getQueryState(roundScope)?.isInvalidated).toBe(true);
});

it("sends the caller's baseline rather than the current revision with the encoded recommendation", async () => {
  const save = vi.fn().mockResolvedValue({ status: "conflict" });
  const recommendation = {
    position: "Fund" as const,
    allocation: fromMinorUnits(150000n),
    reasoning: "Strong fit.",
  };
  const data = createRecommendationData(
    client,
    { workspaceSlug: "alder", publicId: "app-1", revision: 4 },
    {
      application: { queryKey: ["alder", "application", "app-1"], queryFn: async () => null },
      roundScope: ["alder", "rounds"],
      save,
      applySaved: (cached) => cached,
    },
  );

  await data.save(recommendation, { expectedRevision: 2, expectedApplicationVersion: 3 });

  expect(save).toHaveBeenCalledExactlyOnceWith({
    workspaceSlug: "alder",
    publicId: "app-1",
    expectedRevision: 2,
    expectedApplicationVersion: 3,
    recommendation: encodeRecommendation(recommendation),
  });
});

const conflictData = (
  queryKey: readonly ["alder", "application", "app-1"],
  queryFn: () => Promise<CachedApplication>,
) =>
  createRecommendationData(
    client,
    { workspaceSlug: "alder", publicId: "app-1", revision: 1 },
    {
      application: { queryKey, queryFn },
      roundScope: ["alder", "rounds"],
      save: vi.fn().mockResolvedValue({ status: "conflict" }),
      applySaved: (cached) => cached,
    },
  );

const deferral = { position: "Defer" as const, allocation: fromMinorUnits(0n), reasoning: "Hold." };
const conflictBaseline = { expectedRevision: 1, expectedApplicationVersion: 1 };

it("reloads the current application after a conflict", async () => {
  const queryKey = ["alder", "application", "app-1"] as const;
  const latest: CachedApplication = {
    status: "ok",
    recommendation: encodeRecommendation(deferral),
    revision: 3,
  };
  client.setQueryData(queryKey, { status: "ok", recommendation: null, revision: 1 });
  const data = conflictData(queryKey, async () => latest);

  expect(await data.save(deferral, conflictBaseline)).toEqual({ status: "conflict" });
  expect(client.getQueryData(queryKey)).toEqual(latest);
});

it("still reports a conflict and keeps the cached application when reloading fails", async () => {
  const queryKey = ["alder", "application", "app-1"] as const;
  const cached: CachedApplication = { status: "ok", recommendation: null, revision: 1 };
  client.setQueryData(queryKey, cached);
  const data = conflictData(queryKey, () => Promise.reject(new Error("Offline")));

  expect(await data.save(deferral, conflictBaseline)).toEqual({ status: "conflict" });
  expect(client.getQueryData(queryKey)).toEqual(cached);
});
