import { QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vite-plus/test";

import { defaultLocale } from "@merit/i18n";
import { createQueryClient } from "@merit/query";

import { renderWithRouter } from "../../../tests/render-with-router";
import { WebMessagesProvider } from "../../app/messages";
import { Route } from "../../routes/invitations/$token";
import { readInvitation, acceptInvitation } from "./data/server/organization.functions";
import { WorkspaceInvitation } from "./invitation";

vi.mock("./data/server/organization.functions", () => ({
  readInvitation: vi.fn(),
  acceptInvitation: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(readInvitation).mockReset().mockResolvedValue({ status: "unavailable" });
  vi.mocked(acceptInvitation).mockReset();
});

it("retries an invitation read in place, guards repeated clicks, and remains retryable after failure", async () => {
  const root = createRootRoute({
    component: () => (
      <WebMessagesProvider>
        <input aria-label="Unfinished surrounding work" />
        <Outlet />
      </WebMessagesProvider>
    ),
  });
  const product = createRoute({ getParentRoute: () => root, id: "_product" });
  Route.update({
    getParentRoute: () => product,
    path: "/invitations/$token",
  } as Parameters<typeof Route.update>[0]);
  const client = createQueryClient();
  const router = createRouter({
    context: { queryClient: client, locale: defaultLocale },
    routeTree: root.addChildren([product.addChildren([Route])]),
    history: createMemoryHistory({ initialEntries: ["/invitations/test-token"] }),
    defaultPendingMinMs: 0,
  });
  await router.load();
  expect(router.state.matches.at(-1)?.meta).toContainEqual({
    title: "Organization invitation · Merit",
  });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  const user = userEvent.setup();
  const surrounding = screen.getByRole("textbox", { name: "Unfinished surrounding work" });
  await user.type(surrounding, "Keep this work");

  let fail!: (value: { status: "unavailable" }) => void;
  vi.mocked(readInvitation).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        fail = resolve;
      }),
  );
  const retry = screen.getByRole("button", { name: "Try again" });
  await user.click(retry);
  await waitFor(() => expect(retry).toHaveAttribute("aria-disabled", "true"));
  await user.click(retry);
  expect(readInvitation).toHaveBeenCalledTimes(2);

  await act(async () => fail({ status: "unavailable" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Try again" })).not.toHaveAttribute("aria-disabled"),
  );
  vi.mocked(readInvitation).mockResolvedValue({ status: "expired" });
  await user.click(screen.getByRole("button", { name: "Try again" }));

  expect(await screen.findByRole("heading", { name: "Invitation expired" })).toBeVisible();
  expect(screen.getByRole("textbox", { name: "Unfinished surrounding work" })).toBe(surrounding);
  expect(surrounding).toHaveValue("Keep this work");
  expect(acceptInvitation).not.toHaveBeenCalled();
});

it.each([
  ["administrator", "member", false, true, "/app/alder/settings/members"],
  ["none", "reviewer", false, false, "/app/alder/work"],
  ["none", "program_manager", true, true, "/app/alder/rounds"],
] as const)(
  "opens the canonical home after accepting %s/%s membership",
  async (administration, role, canWorkOnGrants, canViewTeam, destination) => {
    const organization = {
      id: "alder",
      name: "Alder Foundation",
      slug: "alder",
      kind: "standard" as const,
      demoExpiresAt: null,
      demoSeedVersion: null,
    };
    vi.mocked(readInvitation).mockResolvedValue({
      status: "ok",
      value: { organization, accepted: false, administration, role },
    });
    vi.mocked(acceptInvitation).mockResolvedValue({
      status: "ok",
      value: { ...organization, canWorkOnGrants, canViewTeam },
    });
    const { user, router } = await renderWithRouter(
      <QueryClientProvider client={createQueryClient()}>
        <WorkspaceInvitation token="test-token" fingerprint="test" />
      </QueryClientProvider>,
      "/invitations/test-token",
    );
    await user.click(await screen.findByRole("button", { name: "Accept invitation" }));
    await waitFor(() => expect(router.state.location.pathname).toBe(destination));
  },
);
