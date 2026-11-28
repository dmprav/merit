import { assert, afterEach, expect, it, vi } from "vite-plus/test";

import { encodeDecision, type DecisionStateData } from "@merit/decisions/api";
import { encodeApplicationDetail, roundView } from "@merit/grantmaking/api";
import { makeApplication, makeRound } from "@merit/grantmaking/testing/fixtures";
import { fromMinorUnits, encodeMoney } from "@merit/money";
import { createQueryClient } from "@merit/query";

import { applicationOptions } from "../queries";
import { recordDecision } from "../server/decisions/decisions.functions";
import { workspaceDecisionData } from "./workspace-data";

vi.mock("../server/decisions/decisions.functions", () => ({ recordDecision: vi.fn() }));

const client = createQueryClient();
afterEach(() => {
  client.clear();
  vi.resetAllMocks();
});

const round = roundView(
  makeRound({
    budget: fromMinorUnits(10000000n),
    applications: [makeApplication({ version: 1, intakeStatus: "ready" })],
  }),
);
const [application] = round.applications;
assert.isDefined(application);
const options = applicationOptions("alder", "b8q3w5j7c2df");

const decision = (revision: number, outcome: "Fund" | "Defer") => ({
  revision,
  decision: encodeDecision({
    outcome,
    amount: fromMinorUnits(outcome === "Fund" ? 1000000n : 0n),
    conditions: "",
    reason: `Revision ${revision}`,
    decidedBy: "Funding committee",
    decisionDate: "2026-01-18",
    ...(revision > 1 ? { changeExplanation: "Changed." } : {}),
    recorder: { userId: "dana", name: "Dana Reed", provenance: { interface: "web" } },
    recordedAt: "2026-01-19T10:00:00.000Z",
    applicationVersion: 1,
  }),
});

const pageWith = (state: DecisionStateData) => ({
  status: "ok" as const,
  ...encodeApplicationDetail({ round, application }),
  recommendationVersion: 0,
  aiReviews: [],
  aiReviewAvailability: "available" as const,
  aiReviewProvider: null,
  decision: state,
  intake: {
    revision: 1,
    workingRevision: null,
    history: [],
    decisions: { hasDecision: false, hasCommitment: false },
  },
  workspaceSlug: "alder",
});

const saved = (revision: number) => ({
  status: "ok" as const,
  recorded: true,
  decision: decision(revision, "Fund"),
  budget: encodeMoney(fromMinorUnits(10000000n)),
  totals: {
    committed: encodeMoney(fromMinorUnits(1000000n)),
    available: encodeMoney(fromMinorUnits(9000000n)),
    withdrawnApplications: 0,
  },
});

const submit = async (cached: DecisionStateData, response: ReturnType<typeof saved>) => {
  client.setQueryData(options.queryKey, pageWith(cached));
  vi.mocked(recordDecision).mockResolvedValue(response);
  const data = workspaceDecisionData(
    client,
    "alder",
    "b8q3w5j7c2df",
    { revision: 1, versions: [] },
    recordDecision,
  );
  await data.save(
    {
      outcome: "Fund",
      amount: fromMinorUnits(1000000n),
      conditions: "",
      reason: "Saved",
      decidedBy: "Funding committee",
      decisionDate: "2026-01-18",
    },
    { expectedRevision: 1 },
  );
  return client.getQueryData<ReturnType<typeof pageWith>>(options.queryKey);
};

it("prepends the saved version when it is newer than the cached head", async () => {
  const page = await submit({ revision: 1, versions: [decision(1, "Defer")] }, saved(2));

  expect(page?.decision.revision).toBe(2);
  expect(page?.decision.versions.map((version) => version.revision)).toEqual([2, 1]);
  expect(page?.intake.decisions?.hasCommitment).toBe(true);
});

it("does not duplicate a version that a refresh already cached", async () => {
  const cached = { revision: 2, versions: [decision(2, "Fund"), decision(1, "Defer")] };
  const page = await submit(cached, saved(2));

  expect(page?.decision).toEqual(cached);
});

it("keeps a newer cached revision from another tab as the head", async () => {
  const cached = { revision: 3, versions: [decision(3, "Defer"), decision(2, "Fund")] };
  const page = await submit(cached, saved(2));

  expect(page?.decision).toEqual(cached);
  expect(page?.intake.decisions?.hasCommitment).toBe(false);
  expect(page?.round.totals).toEqual(pageWith(cached).round.totals);
});

it("takes the round totals from a save whose revision the cache already holds", async () => {
  const cached = { revision: 2, versions: [decision(2, "Fund"), decision(1, "Defer")] };
  const response = saved(2);
  const page = await submit(cached, response);

  expect(page?.decision).toEqual(cached);
  expect(page?.round.budget).toEqual(response.budget);
  expect(page?.round.totals.committed).toEqual(response.totals.committed);
  expect(page?.round.totals.available).toEqual(response.totals.available);
});
