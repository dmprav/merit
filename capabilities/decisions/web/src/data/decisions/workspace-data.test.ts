import { QueryClient } from "@tanstack/react-query";
import { afterEach, assert, expect, it, vi } from "vite-plus/test";

import type { RecordDecisionRequest } from "@merit/decisions/api";
import { encodeDecision } from "@merit/decisions/api";
import { fromMinorUnits } from "@merit/money";

import { firstDecision, amendedDecision } from "../../testing/fixtures";
import { createDecisionData, type DecisionSaved } from "./workspace-data";

type Cached = { decision: { revision: number; versions: unknown[] } };

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const queryKey = ["alder", "application", "k7m2p9x4n6rt"] as const;
const roundScope = ["alder", "rounds"] as const;
const application = { queryKey, queryFn: vi.fn() };
afterEach(() => {
  client.clear();
  vi.resetAllMocks();
});

const state = {
  revision: 1,
  versions: [{ revision: 1, decision: encodeDecision(firstDecision) }],
};
const saved: DecisionSaved = {
  status: "ok",
  recorded: true,
  decision: { revision: 2, decision: encodeDecision(amendedDecision) },
  budget: { minorUnits: "6000000", currency: "EUR" },
  totals: {
    committed: { minorUnits: "2000000", currency: "EUR" },
    available: { minorUnits: "4000000", currency: "EUR" },
    withdrawnApplications: 0,
  },
};

const create = (save: (input: RecordDecisionRequest) => Promise<unknown>) =>
  createDecisionData(
    client,
    { workspaceSlug: "alder", publicId: "k7m2p9x4n6rt", state },
    {
      application: application as never,
      roundScope,
      save: save as never,
      applySaved: (cached: Cached, response) => ({
        decision: {
          revision: response.decision.revision,
          versions: [response.decision, ...cached.decision.versions],
        },
      }),
    },
  );

it("decodes the saved versions and carries the original baseline into the request", async () => {
  const save = vi.fn(async () => saved);
  const data = create(save);

  expect(data.revision).toBe(1);
  expect(data.versions.map((version) => version.revision)).toEqual([1]);
  expect(data.versions[0]?.decision.amount).toEqual(fromMinorUnits(2400000n));

  await data.save(
    {
      outcome: "Fund with conditions",
      amount: fromMinorUnits(2000000n),
      conditions: "Confirm the venue in writing.",
      reason: "Reduced.",
      decidedBy: "Funding committee",
      decisionDate: "2026-01-18",
      changeExplanation: "The venue is not yet confirmed.",
    },
    { expectedRevision: 1 },
  );

  expect(save).toHaveBeenCalledExactlyOnceWith({
    workspaceSlug: "alder",
    publicId: "k7m2p9x4n6rt",
    expectedRevision: 1,
    decision: {
      outcome: "Fund with conditions",
      amount: { minorUnits: "2000000", currency: "EUR" },
      conditions: "Confirm the venue in writing.",
      reason: "Reduced.",
      decidedBy: "Funding committee",
      decisionDate: "2026-01-18",
      changeExplanation: "The venue is not yet confirmed.",
    },
  });
});

it("omits an explanation the first version does not carry", async () => {
  const save = vi.fn(async () => saved);
  await create(save).save(
    {
      outcome: "Decline",
      amount: fromMinorUnits(0n),
      conditions: "",
      reason: "Not eligible.",
      decidedBy: "Funding committee",
      decisionDate: "2026-01-18",
    },
    { expectedRevision: 0 },
  );

  const [request] = save.mock.calls[0] as unknown as [RecordDecisionRequest];
  expect(request.decision).not.toHaveProperty("changeExplanation");
});

it("updates the cached application and invalidates round reads without refetching them", async () => {
  client.setQueryData(queryKey, { decision: { revision: 1, versions: [state.versions[0]] } });
  client.setQueryData([...roundScope, "list"], { status: "ok" });
  const data = create(vi.fn(async () => saved));

  expect(
    await data.save({ ...firstDecision, changeExplanation: "Changed." }, { expectedRevision: 1 }),
  ).toBe(saved);

  const cached = client.getQueryData<Cached>(queryKey);
  assert.isDefined(cached);
  expect(cached.decision.revision).toBe(2);
  expect(cached.decision.versions).toHaveLength(2);
  expect(client.getQueryState([...roundScope, "list"])?.isInvalidated).toBe(true);
});

it("leaves an uncached application alone", async () => {
  const data = create(vi.fn(async () => saved));
  await data.save({ ...firstDecision, changeExplanation: "Changed." }, { expectedRevision: 1 });
  expect(client.getQueryData(queryKey)).toBeUndefined();
});

it("refreshes the application after a conflict even when the refresh fails", async () => {
  application.queryFn.mockRejectedValue(new Error("Offline"));
  const data = create(vi.fn(async () => ({ status: "conflict" as const })));

  expect(await data.save(firstDecision, { expectedRevision: 0 })).toEqual({ status: "conflict" });
  expect(application.queryFn).toHaveBeenCalledOnce();
});

it("changes nothing for a rejected save", async () => {
  client.setQueryData(queryKey, { decision: { revision: 1, versions: [] } });
  const data = create(
    vi.fn(async () => ({ status: "invalid" as const, error: "application_withdrawn" as const })),
  );

  expect(await data.save(firstDecision, { expectedRevision: 1 })).toEqual({
    status: "invalid",
    error: "application_withdrawn",
  });
  expect(application.queryFn).not.toHaveBeenCalled();
  expect(client.getQueryData<Cached>(queryKey)?.decision.revision).toBe(1);
});
