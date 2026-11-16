import { isDeepStrictEqual } from "node:util";

import { expect, it, vi } from "vite-plus/test";

import {
  loadFundingRoundPage,
  loadFundingRounds,
  loadWorkspaceActivity,
  loadWorkspaceApplications,
  loadWorkspaceSearch,
} from "./funding-round.server";

it.each([
  { outcome: "forbidden", status: "not_found" },
  { outcome: "not_found", status: "workspace_not_found" },
] as const)("presents $outcome application discovery as $status", async ({ outcome, status }) => {
  expect(
    await loadWorkspaceApplications(
      { workspaceSlug: "alder" },
      {
        currentIdentity: async () => ({ status: "authenticated", actor: { userId: "manager" } }),
        listWorkspaceApplications: async () => ({ status: outcome }),
      },
    ),
  ).toEqual({ status });
});

it("uses the authenticated actor and selected workspace for application discovery", async () => {
  const services: Parameters<typeof loadWorkspaceApplications>[1] = {
    currentIdentity: async () => ({
      status: "authenticated",
      actor: { userId: "manager" },
    }),
    listWorkspaceApplications: async (actor, input) =>
      actor.userId === "manager" && input.workspaceSlug === "alder"
        ? { status: "ok", applications: [], total: 0, matching: 0, offset: 0 }
        : { status: "forbidden" },
  };

  expect(await loadWorkspaceApplications({ workspaceSlug: "alder" }, services)).toEqual({
    status: "ok",
    applications: [],
    total: 0,
    matching: 0,
    offset: 0,
  });
});

it("does not discover applications for a signed-out visitor", async () => {
  const listWorkspaceApplications = vi.fn();
  expect(
    await loadWorkspaceApplications(
      { workspaceSlug: "alder" },
      {
        currentIdentity: async () => ({ status: "signed_out" }),
        listWorkspaceApplications,
      },
    ),
  ).toEqual({ status: "signed_out" });
  expect(listWorkspaceApplications).not.toHaveBeenCalled();
});

it.each([
  { userId: "alder-manager", workspaceSlug: "alder" },
  { userId: "birch-manager", workspaceSlug: "birch" },
])("returns $workspaceSlug's rounds for $userId", async ({ userId, workspaceSlug }) => {
  const rounds = [
    {
      organizationId: workspaceSlug,
      organizationName: "Community Foundation",
      workspaceSlug,

      publicId: "k7m2p9x4n6rt",
      title: "Spring grants",
      decisionStatus: "Preparing",
      manager: "Dana Reed",
      managerNeedsReassignment: false,
      applicationCount: 0,
      meetingDate: null,
      budget: null,
    },
  ];
  const services = {
    currentIdentity: async () => ({ status: "authenticated" as const, actor: { userId } }),
    listRounds: async (actor: { userId: string }, slug: string) =>
      actor.userId === userId && slug === workspaceSlug
        ? ({ status: "ok", rounds } as const)
        : ({ status: "forbidden" } as const),
  };

  expect(await loadFundingRounds(workspaceSlug, services)).toEqual({ status: "ok", rounds });
});

it("returns an empty list when an accessible workspace has no rounds", async () => {
  expect(
    await loadFundingRounds("alder", {
      currentIdentity: async () => ({ status: "authenticated", actor: { userId: "manager" } }),
      listRounds: async () => ({ status: "ok", rounds: [] }),
    }),
  ).toEqual({ status: "ok", rounds: [] });
});

it.each([
  { outcome: "forbidden", status: "not_found" },
  { outcome: "not_found", status: "workspace_not_found" },
] as const)("presents $outcome round access as $status", async ({ outcome, status }) => {
  expect(
    await loadFundingRounds("alder", {
      currentIdentity: async () => ({ status: "authenticated", actor: { userId: "manager" } }),
      listRounds: async () => ({ status: outcome }),
    }),
  ).toEqual({ status });
});

it.each(["signed_out", "unavailable"] as const)(
  "does not read round data when identity is %s",
  async (status) => {
    const services = {
      currentIdentity: async () => ({ status }),
      listRounds: vi.fn(),
    };
    expect(await loadFundingRounds("alder", services)).toEqual({ status });
    expect(services.listRounds).not.toHaveBeenCalled();
  },
);

it.each(["signed_out", "unavailable"] as const)(
  "does not read a round page when identity is %s",
  async (status) => {
    const services = {
      currentIdentity: async () => ({ status }),
      readRoundPage: vi.fn(),
    };

    expect(
      await loadFundingRoundPage(
        { workspaceSlug: "alder", publicId: "k7m2p9x4n6rt", kind: "round" },
        services,
      ),
    ).toEqual({ status });
    expect(services.readRoundPage).not.toHaveBeenCalled();
  },
);

const manager = { status: "authenticated", actor: { userId: "manager" } } as const;

it.each([
  { outcome: "forbidden", status: "not_found" },
  { outcome: "not_found", status: "workspace_not_found" },
  { outcome: "invalid", status: "unavailable" },
] as const)("presents $outcome activity as $status", async ({ outcome, status }) => {
  expect(
    await loadWorkspaceActivity(
      { workspaceSlug: "alder" },
      {
        currentIdentity: async () => manager,
        listWorkspaceActivity: async () => ({ status: outcome }),
      },
    ),
  ).toEqual({ status });
});

it("reads the selected workspace's activity as the authenticated actor, with filters from the request", async () => {
  const page = { status: "ok" as const, entries: [], people: [], nextCursor: null };
  const input = { workspaceSlug: "alder", roundId: "k7m2p9x4n6rt", personId: "dana", limit: 50 };
  const services = {
    currentIdentity: async () => manager,
    listWorkspaceActivity: async (actor: { userId: string }, request: unknown) =>
      actor.userId === "manager" && isDeepStrictEqual(request, input)
        ? page
        : ({ status: "forbidden" } as const),
  };

  expect(await loadWorkspaceActivity(input, services)).toEqual(page);
});

it("does not read activity for a signed-out visitor", async () => {
  const listWorkspaceActivity = vi.fn();

  expect(
    await loadWorkspaceActivity(
      { workspaceSlug: "alder" },
      { currentIdentity: async () => ({ status: "signed_out" }), listWorkspaceActivity },
    ),
  ).toEqual({ status: "signed_out" });
  expect(listWorkspaceActivity).not.toHaveBeenCalled();
});

it.each([
  { outcome: "forbidden", status: "not_found" },
  { outcome: "not_found", status: "workspace_not_found" },
] as const)("presents $outcome search as $status", async ({ outcome, status }) => {
  expect(
    await loadWorkspaceSearch(
      { workspaceSlug: "alder", query: "harbour" },
      { currentIdentity: async () => manager, searchWorkspace: async () => ({ status: outcome }) },
    ),
  ).toEqual({ status });
});

it("searches the selected workspace as the authenticated actor", async () => {
  const found = {
    status: "ok" as const,
    rounds: { results: [], total: 0 },
    applications: { results: [], total: 0 },
  };
  const searchWorkspace = vi.fn(async () => found);
  const input = { workspaceSlug: "alder", query: "harbour trust" };

  expect(
    await loadWorkspaceSearch(input, { currentIdentity: async () => manager, searchWorkspace }),
  ).toEqual(found);
  expect(searchWorkspace).toHaveBeenCalledWith({ userId: "manager" }, input);
});

it("does not search for a signed-out visitor", async () => {
  const searchWorkspace = vi.fn();

  expect(
    await loadWorkspaceSearch(
      { workspaceSlug: "alder", query: "harbour" },
      { currentIdentity: async () => ({ status: "signed_out" }), searchWorkspace },
    ),
  ).toEqual({ status: "signed_out" });
  expect(searchWorkspace).not.toHaveBeenCalled();
});
