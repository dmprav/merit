import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vite-plus/test";

import { AdminMessages } from "../app/messages";
import { AdminPageState } from "./admin-page-state";

const show = async (status: "signed_out" | "unavailable", returnTo: string) => {
  const root = createRootRoute({
    component: () => (
      <AdminMessages>
        <AdminPageState status={status} returnTo={returnTo} />
      </AdminMessages>
    ),
  });
  const router = createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  render(<RouterProvider router={router} />);
  return router;
};

it.each(["/admin/organizations", "/admin/access-requests"])(
  "returns to %s after signing in",
  async (returnTo) => {
    await show("signed_out", returnTo);
    const link = await screen.findByRole("link", { name: "Sign in" });
    const destination = new URL(link.getAttribute("href")!, "http://localhost");

    expect(destination.pathname).toBe("/app/sign-in");
    expect(destination.searchParams.get("returnTo")).toBe(returnTo);
  },
);

it("retries failed reads through the router without reloading the page", async () => {
  const user = userEvent.setup();
  const router = await show("unavailable", "/admin/organizations");
  const invalidate = vi.spyOn(router, "invalidate");
  await user.click(await screen.findByRole("button", { name: "Try again" }));

  expect(invalidate).toHaveBeenCalledOnce();
});
