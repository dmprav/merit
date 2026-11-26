import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { expect, it, vi } from "vite-plus/test";

import { WebMessagesProvider } from "../../../app/messages";
import { DemoEntryView } from "./demo-entry";

const show = async (ui: ReactNode) => {
  const root = createRootRoute({ component: () => ui });
  const demo = createRoute({ getParentRoute: () => root, path: "/demo", component: () => null });
  const router = createRouter({
    routeTree: root.addChildren([demo]),
    history: createMemoryHistory({ initialEntries: ["/demo"] }),
    defaultPendingMinMs: 0,
  });
  await router.load();
  return {
    ...render(<RouterProvider router={router} />, { wrapper: WebMessagesProvider }),
    user: userEvent.setup(),
  };
};

it("starts unguided when browsing the workspace from the empty state", async () => {
  const start = vi.fn(async () => {});
  const { user } = await show(
    <DemoEntryView state={{ status: "empty" }} pending={false} hydrated start={start} />,
  );

  await user.click(screen.getByRole("button", { name: "Browse the workspace" }));

  expect(start).toHaveBeenCalledExactlyOnceWith(false, false);
});

it("offers retry on a rate-limited response", async () => {
  const start = vi.fn(async () => {});
  const { user } = await show(
    <DemoEntryView state={{ status: "limited" }} pending={false} hydrated start={start} />,
  );

  expect(screen.getByRole("heading", { name: "Demo could not be opened" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Try again" }));

  expect(start).toHaveBeenCalledExactlyOnceWith(false);
});

it("shows the opening state without actions while resuming an existing demo", async () => {
  const start = vi.fn(async () => {});
  await show(
    <DemoEntryView
      state={{ status: "ready", workspaceSlug: "existing-demo", expiresAt: "2027-01-25T12:00:00Z" }}
      pending
      hydrated
      start={start}
    />,
  );

  expect(screen.getByRole("heading", { name: "Opening your demo…" })).toBeVisible();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  expect(start).not.toHaveBeenCalled();
});
