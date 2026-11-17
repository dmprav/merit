import { isDeepStrictEqual } from "node:util";

import { expect, it, vi } from "vite-plus/test";

import { loadContactApplications } from "./contacts.server";

const input = {
  workspaceSlug: "alder",
  contactId: "60000000-0000-4000-8000-000000000001",
  after: "k7m2p9x4n6rt",
  limit: 20,
};

it("reads the selected contact page as the authenticated actor", async () => {
  const page = { status: "ok" as const, applications: [], nextCursor: null };
  expect(
    await loadContactApplications(input, {
      currentIdentity: async () => ({ status: "authenticated", actor: { userId: "manager" } }),
      listContactApplications: async (actor, request) =>
        actor.userId === "manager" && isDeepStrictEqual(request, input)
          ? page
          : { status: "not_found" },
    }),
  ).toEqual(page);
});

it.each(["signed_out", "unavailable"] as const)(
  "does not read applications when identity is %s",
  async (status) => {
    const listContactApplications = vi.fn();
    expect(
      await loadContactApplications(input, {
        currentIdentity: async () => ({ status }),
        listContactApplications,
      }),
    ).toEqual({ status });
    expect(listContactApplications).not.toHaveBeenCalled();
  },
);

it("preserves denied grant-work access", async () => {
  expect(
    await loadContactApplications(input, {
      currentIdentity: async () => ({ status: "authenticated", actor: { userId: "team-only" } }),
      listContactApplications: async () => ({ status: "not_found" }),
    }),
  ).toEqual({ status: "not_found" });
});
