import { QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { defaultLocale } from "@merit/i18n";
import { createQueryClient } from "@merit/query";

import { productRoute } from "../../tests/product-route";
import { renderWithRouter } from "../../tests/render-with-router";
import { WebMessagesProvider } from "../app/messages";
import { WorkspaceRecovery, WorkspaceStatusPage } from "../app/workspace-page";
import { readWorkspaces } from "../features/workspace/data/server/organization.functions";
import { readWorkspace } from "../features/workspace/data/server/workspace.functions";
import { WorkspaceNavigationContext } from "../features/workspace/workspace-navigation";
import { Route as workspaceRoute } from "../routes/app.$workspaceSlug";
import { WorkspaceState } from "./workspace-state";

vi.mock("../features/workspace/data/server/organization.functions", () => ({
  readWorkspaces: vi.fn(),
}));
vi.mock("../features/workspace/data/server/workspace.functions", () => ({
  readWorkspace: vi.fn(),
}));

type Workspace = Extract<
  Awaited<ReturnType<typeof readWorkspaces>>,
  { status: "ok" }
>["value"][number];

const alder: Workspace = {
  id: "alder",
  name: "Alder Foundation",
  slug: "alder",
  kind: "standard",
  demoExpiresAt: null,
  role: "program_manager",
  canWorkOnGrants: true,
  administration: "owner",
};
const birch: Workspace = {
  id: "birch",
  name: "Birch Foundation",
  slug: "birch",
  kind: "standard",
  demoExpiresAt: null,
  role: "member",
  canWorkOnGrants: false,
  administration: "none",
};

beforeEach(() => vi.stubEnv("MERIT_LOCAL_WORKSPACE", "true"));
afterEach(() => vi.unstubAllEnvs());

/** Frames a state the way a route does when no workspace can be entered. */
const recovery = (
  path: string,
  workspaces: Workspace[],
  canAdminister = false,
  status:
    | "unavailable"
    | "signed_out"
    | "no_workspace"
    | "workspace_not_found" = "workspace_not_found",
) =>
  renderWithRouter(
    <WorkspaceNavigationContext value={{ workspaces, canAdminister }}>
      <WorkspaceRecovery status={status} />
    </WorkspaceNavigationContext>,
    path,
    "/app/$workspaceSlug/$",
  );

/** Renders a page's failed read through the actual workspace layout. */
const workspacePage = async (
  path: string,
  workspaces: Workspace[],
  access: Awaited<ReturnType<typeof readWorkspace>>,
  status: "not_found" | "unavailable" = "not_found",
) => {
  vi.mocked(readWorkspaces).mockResolvedValue({
    status: "ok",
    value: workspaces,
    draftScope: "test-account",
    canAdminister: false,
  });
  vi.mocked(readWorkspace).mockResolvedValue(access);
  const root = createRootRoute({ component: Outlet });
  const product = productRoute(root);
  workspaceRoute.update({
    getParentRoute: () => product,
    path: "/app/$workspaceSlug",
  } as Parameters<typeof workspaceRoute.update>[0]);
  const page = createRoute({
    getParentRoute: () => workspaceRoute,
    path: "$",
    component: () => <WorkspaceStatusPage status={status} resource="application" />,
  });
  const rounds = createRoute({
    getParentRoute: () => workspaceRoute,
    path: "rounds",
    component: () => <WorkspaceStatusPage status="loading" resource="rounds" />,
  });
  const queryClient = createQueryClient();
  const router = createRouter({
    context: { queryClient, locale: defaultLocale },
    routeTree: root.addChildren([
      product.addChildren([workspaceRoute.addChildren([rounds, page])]),
    ]),
    history: createMemoryHistory({ initialEntries: [path] }),
    defaultPendingMinMs: 0,
  });
  await router.load();

  return {
    ...render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
      { wrapper: WebMessagesProvider },
    ),
    router,
    user: userEvent.setup(),
  };
};

describe("workspace states", () => {
  it("offers sign-in when the session has ended", async () => {
    const { user, router } = await renderWithRouter(<WorkspaceState status="signed_out" />, "/app");
    await user.click(screen.getByRole("link", { name: "Sign in" }));

    expect(router.state.location.pathname).toBe("/app/sign-in");
  });

  it.each([
    ["round", "Round not available"],
    ["application", "Application not available"],
  ] as const)(
    "names the unavailable %s without redundant navigation actions",
    async (resource, title) => {
      await renderWithRouter(<WorkspaceState status="not_found" resource={resource} />, "/app");

      expect(screen.getByRole("heading", { name: title })).toBeVisible();
      expect(screen.queryByRole("link")).not.toBeInTheDocument();
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
    },
  );

  it("offers retry for the failed page without claiming the whole workspace failed", async () => {
    await renderWithRouter(<WorkspaceState status="unavailable" resource="application" />, "/app");

    expect(screen.getByRole("heading", { name: "Application could not be loaded" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
  });

  it("announces loading without offering a premature recovery action", async () => {
    await renderWithRouter(<WorkspaceState status="loading" />, "/app");

    expect(screen.getByRole("status")).toHaveTextContent("Loading your workspace…");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});

describe("workspace layout", () => {
  it.each(["not_found", "unavailable"] as const)(
    "retains accessible workspace navigation after a page's %s read",
    async (status) => {
      const { user, router } = await workspacePage(
        "/app/alder/applications/missing",
        [alder, birch],
        { status: "ok", workspace: alder },
        status,
      );
      const sidebar = await screen.findByRole("complementary");

      expect(within(sidebar).getByText("Alder Foundation")).toBeVisible();
      expect(within(sidebar).getByText("Dana Reed")).toBeVisible();
      expect(screen.getByRole("main")).toHaveFocus();

      await user.click(within(sidebar).getByRole("link", { name: "Funding rounds" }));

      expect(router.state.location.pathname).toBe("/app/alder/rounds");
      expect(screen.getByRole("complementary")).toBe(sidebar);
    },
  );

  it("retains Team but not grant navigation for a member without grant access", async () => {
    await workspacePage("/app/birch/applications/missing", [birch], {
      status: "ok",
      workspace: birch,
    });
    const navigation = await screen.findByRole("navigation", { name: "Main navigation" });

    expect(within(navigation).getByRole("link", { name: "Workspace settings" })).toHaveAttribute(
      "href",
      "/app/birch/settings/members",
    );
    expect(
      within(navigation).queryByRole("link", { name: "Funding rounds" }),
    ).not.toBeInTheDocument();
  });

  it("frames a denied workspace without its navigation", async () => {
    await workspacePage("/app/alder/rounds", [alder, birch], { status: "workspace_not_found" });

    expect(await screen.findByRole("link", { name: "Back to Merit" })).toHaveAttribute(
      "href",
      "/app/birch/settings/members",
    );
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  });

  it("does not reuse workspace destinations after sign-out", async () => {
    await workspacePage("/app/alder/applications/missing", [alder], { status: "signed_out" });

    expect(await screen.findByRole("link", { name: "Sign in" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "Workspace settings" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to Merit" })).toHaveAttribute("href", "/");
  });
});

describe("workspace recovery", () => {
  it.each([false, true])(
    "returns to the workspace chooser when another workspace is inaccessible (operator: %s)",
    async (canAdminister) => {
      const { user, router } = await recovery(
        "/app/missing/applications/missing",
        [alder, birch],
        canAdminister,
      );

      expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
      expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
      expect(within(screen.getByRole("banner")).getByText("Dana Reed")).toBeVisible();
      expect(screen.getByRole("main")).toHaveFocus();

      await user.click(screen.getByRole("link", { name: "Back to Merit" }));

      expect(router.state.location.pathname).toBe("/app");
    },
  );

  it.each([
    { workspace: alder, destination: "/app/alder/rounds" },
    { workspace: birch, destination: "/app/birch/settings/members" },
  ])(
    "returns directly to $destination even when administration is available",
    async ({ workspace, destination }) => {
      const { user, router } = await recovery(
        "/app/missing/applications/missing",
        [workspace],
        true,
      );
      await user.click(screen.getByRole("link", { name: "Back to Merit" }));

      expect(router.state.location.pathname).toBe(destination);
    },
  );

  it("does not return to a denied workspace from an older membership list", async () => {
    await recovery("/app/alder/rounds", [alder, birch]);

    expect(screen.getByRole("link", { name: "Back to Merit" })).toHaveAttribute(
      "href",
      "/app/birch/settings/members",
    );
  });

  it.each([
    { canAdminister: false, destination: "/" },
    { canAdminister: true, destination: "/admin/organizations" },
  ])(
    "returns to $destination when the only listed workspace is denied",
    async ({ canAdminister, destination }) => {
      const { user, router } = await recovery("/app/alder/rounds", [alder], canAdminister);

      await user.click(screen.getByRole("link", { name: "Back to Merit" }));

      expect(router.state.location.pathname).toBe(destination);
    },
  );

  it("returns operators to administration from a full-screen workspace error", async () => {
    const { user, router } = await recovery(
      "/app/alder/applications/missing",
      [],
      true,
      "unavailable",
    );
    await user.click(screen.getByRole("link", { name: "Back to Merit" }));

    expect(router.state.location.pathname).toBe("/admin/organizations");
  });

  it("does not offer operator destinations after sign-out", async () => {
    await recovery("/app/alder/applications/missing", [alder], true, "signed_out");

    expect(screen.getByRole("link", { name: "Sign in" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Back to Merit" })).toHaveAttribute("href", "/");
  });

  it("keeps account identity available with no workspace and no demo detour", async () => {
    await recovery("/app/unknown/rounds", [], false, "no_workspace");

    expect(within(screen.getByRole("banner")).getByText("Dana Reed")).toBeVisible();
    expect(screen.getByRole("heading", { name: "No workspace access yet" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "Try the demo" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to Merit" })).toHaveAttribute("href", "/");
  });
});
