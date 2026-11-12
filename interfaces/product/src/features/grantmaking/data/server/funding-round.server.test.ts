import { expect, it, vi } from "vite-plus/test";

import type { WorkspaceServices } from "../../../../shared/request-context";
import {
  loadFundingRoundPage,
  loadFundingRounds,
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
