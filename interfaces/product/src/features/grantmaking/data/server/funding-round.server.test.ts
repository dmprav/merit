import { expect, it, vi } from "vite-plus/test";

import type { WorkspaceServices } from "../../../../shared/request-context";
import {
  loadFundingRoundPage,
  loadFundingRounds,
  loadWorkspaceActivity,
  loadWorkspaceApplications,
} from "./funding-round.server";

it.each([
  { outcome: "forbidden", status: "not_found" },
  { outcome: "not_found", status: "workspace_not_found" },
] as const)("presents $outcome application discovery as $status", async ({ outcome, status }) => {
  expect(
    await loadWorkspaceApplications("alder", {
      currentIdentity: async () => ({ status: "authenticated", actor: { userId: "manager" } }),
      listWorkspaceApplications: async () => ({ status: outcome }),
    }),
  ).toEqual({ status });
});

it("uses the authenticated actor and selected workspace for application discovery", async () => {
  const listWorkspaceApplications = vi.fn(async () => ({
    status: "ok" as const,
    applications: [],
  }));
  expect(
    await loadWorkspaceApplications("alder", {
      currentIdentity: async () => ({ status: "authenticated", actor: { userId: "manager" } }),
      listWorkspaceApplications,
    }),
  ).toEqual({ status: "ok", applications: [] });
  expect(listWorkspaceApplications).toHaveBeenCalledWith({ userId: "manager" }, "alder");
});

it("does not discover applications for a signed-out visitor", async () => {
  const listWorkspaceApplications = vi.fn();
  expect(
    await loadWorkspaceApplications("alder", {
      currentIdentity: async () => ({ status: "signed_out" }),
      listWorkspaceApplications,
    }),
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
      applicationCount: 0,
      meetingDate: null,
      budget: null,
    },
  ];
  const services: Pick<WorkspaceServices, "currentIdentity" | "listRounds"> = {
    currentIdentity: async () => ({ status: "authenticated", actor: { userId } }),
    listRounds: async (actor, slug) =>
      actor.userId === userId && slug === workspaceSlug
        ? { status: "ok", rounds }
        : { status: "forbidden" },
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
  const listWorkspaceActivity = vi.fn(async () => page);
  const input = { workspaceSlug: "alder", roundId: "k7m2p9x4n6rt", personId: "dana", limit: 50 };

  expect(
    await loadWorkspaceActivity(input, {
      currentIdentity: async () => manager,
      listWorkspaceActivity,
    }),
  ).toEqual(page);
  expect(listWorkspaceActivity).toHaveBeenCalledWith({ userId: "manager" }, input);
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
