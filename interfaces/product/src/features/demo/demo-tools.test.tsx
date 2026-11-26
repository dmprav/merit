import { QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vite-plus/test";

import { createQueryClient } from "@merit/query";

import { WebMessagesProvider } from "../../app/messages";
import { WorkspaceNavigationContext } from "../workspace/workspace-navigation";
import { readDemo, startDemo } from "./data/server/demo.functions";
import { DemoGuidance, DemoTools } from "./demo-tools";

vi.mock("./data/server/demo.functions", () => ({
  readDemo: vi.fn(),
  startDemo: vi.fn(),
}));

const workspace = {
  id: "example",
  slug: "demo-example",
  name: "Alder Foundation",
  kind: "demo" as const,
  demoExpiresAt: "2027-01-25T12:00:00.000Z",
  canWorkOnGrants: true,
  canViewTeam: true,
};

const ready = {
  status: "ready" as const,
  workspaceSlug: workspace.slug,
  expiresAt: workspace.demoExpiresAt,
  applicationRef: "workshop-example",
  roundRef: "local-connections-example",
};

beforeEach(() => {
  vi.mocked(readDemo).mockReset().mockResolvedValue(ready);
  vi.mocked(startDemo).mockReset().mockResolvedValue(ready);
});

it("recovers the suggested task list after a failed readDemo call", async () => {
  vi.mocked(readDemo).mockResolvedValueOnce({ status: "unavailable" }).mockResolvedValueOnce(ready);

  const client = createQueryClient();
  const root = createRootRoute({
    component: () => (
      <WorkspaceNavigationContext value={{ workspaces: [workspace], canAdminister: false }}>
        <DemoGuidance>
          <DemoTools workspace={workspace} />
        </DemoGuidance>
      </WorkspaceNavigationContext>
    ),
  });
  const rounds = createRoute({
    getParentRoute: () => root,
    path: "/app/$workspaceSlug/rounds",
    component: () => null,
  });
  const router = createRouter({
    routeTree: root.addChildren([rounds]),
    history: createMemoryHistory({ initialEntries: ["/app/demo-example/rounds"] }),
    defaultPendingMinMs: 0,
  });
  await router.load();

  render(
    <QueryClientProvider client={client}>
      <WebMessagesProvider>
        <RouterProvider router={router} />
      </WebMessagesProvider>
    </QueryClientProvider>,
  );

  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Demo guide" }));
  const dialog = await screen.findByRole("dialog", { name: "Demo guide" });

  expect(await within(dialog).findByRole("status")).toHaveTextContent(
    "We couldn’t load the suggested tasks",
  );

  await user.click(within(dialog).getByRole("button", { name: "Try again" }));

  expect(
    await within(dialog).findByRole("link", { name: "Review Workshop Saturdays" }),
  ).toBeVisible();
});
