import { QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vite-plus/test";

import type { Workspace } from "@merit/organizations/api";
import { createQueryClient } from "@merit/query";

import { organizationOptions, organizationsOptions } from "../features/organizations/data/queries";
import {
  listOrganizations,
  readOrganization,
} from "../features/organizations/data/server/organizations.functions";
import { Route as NewOrganizationRoute } from "../routes/admin.organizations.new";
import { adminContextOptions } from "./data/queries";
import { Route } from "./layout";

vi.mock("./data/admin-context.functions", () => ({ readAdminContext: vi.fn() }));

vi.mock("../features/organizations/data/server/organizations.functions", () => ({
  listOrganizations: vi.fn(),
  readOrganization: vi.fn(),
}));
vi.mock("./account", () => ({ AdminAccount: () => null }));

const grantWorkspace: Workspace = {
  id: "org-1",
  name: "Alder Foundation",
  slug: "alder",
  kind: "standard",
  demoExpiresAt: null,
  role: "program_manager",
  administration: "none",
  canWorkOnGrants: true,
};
const teamWorkspace: Workspace = {
  ...grantWorkspace,
  id: "org-2",
  name: "Birch Trust",
  slug: "birch",
  role: "member",
  administration: "administrator",
  canWorkOnGrants: false,
};

const renderPage = async (
  path: string,
  contextStatus: "ok" | "unavailable" | "signed_out" = "ok",
  pageStatus: "ok" | "forbidden" | "signed_out" | "not_found" = "ok",
  canAdminister = true,
  workspaces: Workspace[] = [],
) => {
  const client = createQueryClient();
  client.setQueryData(adminContextOptions().queryKey, () =>
    contextStatus === "ok"
      ? { status: "ok" as const, canAdminister, draftScope: "operator-test", workspaces }
      : { status: contextStatus },
  );
  client.setQueryData(organizationsOptions().queryKey, () => {
    if (pageStatus === "ok") {
      return { status: "ok" as const, value: [] };
    }
    if (pageStatus === "signed_out") {
      return { status: "signed_out" as const };
    }

    return { status: "forbidden" as const };
  });
  client.setQueryData(organizationOptions("org-1").queryKey, () =>
    pageStatus === "ok"
      ? {
          status: "ok" as const,
          value: {
            id: "org-1",
            name: "Alder Foundation",
            slug: "alder",
            hasOwner: false,
            owner: null,
            invitation: null,
            canOpenWorkspace: false,
          },
        }
      : { status: pageStatus },
  );
  const root = createRootRoute();
  Route.update({ getParentRoute: () => root, id: "_administration" } as Parameters<
    typeof Route.update
  >[0]);
  const children = [
    "/admin/organizations/",
    "/admin/organizations/$organizationId",
    "/admin/access-requests",
  ].map((path) =>
    createRoute({ getParentRoute: () => Route, path, component: () => <h1>Page content</h1> }),
  );
  NewOrganizationRoute.update({
    getParentRoute: () => Route,
    path: "/admin/organizations/new",
  } as Parameters<typeof NewOrganizationRoute.update>[0]);
  const router = createRouter({
    routeTree: root.addChildren([Route.addChildren([...children, NewOrganizationRoute])]),
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  await router.load();
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );

  return contextStatus !== "ok" ||
    !canAdminister ||
    pageStatus === "forbidden" ||
    pageStatus === "signed_out"
    ? screen.findByRole("main")
    : screen.findByRole("navigation", { name: "Breadcrumb" });
};

it.each([
  ["/admin/organizations", "Organizations"],
  ["/admin/organizations/", "Organizations"],
  ["/admin/organizations/new", "Organizations"],
  ["/admin/organizations/new/", "Organizations"],
  ["/admin/organizations/org-1", "Alder Foundation"],
  ["/admin/access-requests", "Access requests"],
  ["/admin/access-requests/", "Access requests"],
])("labels %s as %s", async (path, expected) => {
  const breadcrumb = await renderPage(path);

  expect(within(breadcrumb).getAllByRole("listitem").at(-1)).toHaveTextContent(expected);
});

it.each(["/admin/organizations/org-1", "/admin/organizations/org-1/"])(
  "links back to organizations from %s",
  async (path) => {
    const breadcrumb = await renderPage(path);

    expect(within(breadcrumb).getByRole("link", { name: "Organizations" })).toHaveAttribute(
      "href",
      "/admin/organizations",
    );
  },
);

it.each([
  ["/admin/organizations", "Organizations"],
  ["/admin/organizations/new", "Organizations"],
  ["/admin/organizations/org-1", "Alder Foundation"],
])(
  "keeps the verified operator's trail without workspace memberships at %s",
  async (path, label) => {
    const breadcrumb = await renderPage(path);

    expect(within(breadcrumb).getAllByRole("listitem").at(-1)).toHaveTextContent(label);
  },
);

it.each(["forbidden", "signed_out"] as const)(
  "omits organization context for %s pages",
  async (status) => {
    await renderPage("/admin/organizations/org-1", "unavailable", status);

    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Breadcrumb" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to Merit" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("main")).toHaveFocus();
  },
);

it("keeps the parent destination for an operator's missing organization", async () => {
  const breadcrumb = await renderPage("/admin/organizations/org-1", "ok", "not_found");

  expect(breadcrumb).toHaveTextContent("Organization details");
  expect(within(breadcrumb).getByRole("link", { name: "Organizations" })).toHaveAttribute(
    "href",
    "/admin/organizations",
  );
});

it("opens access requests without reading organization records", async () => {
  vi.mocked(listOrganizations).mockClear();
  vi.mocked(readOrganization).mockClear();
  const breadcrumb = await renderPage("/admin/access-requests");

  expect(breadcrumb).toHaveTextContent("Access requests");
  expect(listOrganizations).not.toHaveBeenCalled();
  expect(readOrganization).not.toHaveBeenCalled();
});

it.each(["signed_out", "unavailable"] as const)(
  "does not infer operator status from a cached page when context is %s",
  async (status) => {
    await renderPage("/admin/organizations/org-1", status);
    expect(screen.queryByRole("navigation", { name: "Breadcrumb" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to Merit" })).toHaveAttribute("href", "/");
  },
);

it("keeps nonoperators in recovery even with a cached organization", async () => {
  await renderPage("/admin/organizations/org-1", "ok", "ok", false);
  expect(screen.queryByRole("navigation", { name: "Breadcrumb" })).not.toBeInTheDocument();
});

it.each([
  { workspaces: [], destination: "/" },
  { workspaces: [grantWorkspace], destination: "/app/alder/rounds" },
  { workspaces: [teamWorkspace], destination: "/app/birch/settings/members" },
  { workspaces: [grantWorkspace, teamWorkspace], destination: "/app" },
])(
  "returns nonoperators to $destination from their available workspaces",
  async ({ workspaces, destination }) => {
    await renderPage("/admin/organizations/org-1", "ok", "ok", false, workspaces);

    expect(screen.getByRole("link", { name: "Back to Merit" })).toHaveAttribute(
      "href",
      destination,
    );
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Breadcrumb" })).not.toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveFocus();
  },
);

it("uses workspace recovery when an organization read denies a cached operator", async () => {
  await renderPage("/admin/organizations/org-1", "ok", "forbidden", true, [teamWorkspace]);

  expect(screen.getByRole("link", { name: "Back to Merit" })).toHaveAttribute(
    "href",
    "/app/birch/settings/members",
  );
  expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  expect(screen.queryByRole("navigation", { name: "Breadcrumb" })).not.toBeInTheDocument();
});

it.each([[grantWorkspace], [grantWorkspace, teamWorkspace]])(
  "ignores cached workspace destinations when the organization read reports signed out (%#)",
  async (...workspaces) => {
    await renderPage("/admin/organizations/org-1", "ok", "signed_out", true, workspaces);

    expect(screen.getByRole("link", { name: "Back to Merit" })).toHaveAttribute("href", "/");
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Breadcrumb" })).not.toBeInTheDocument();
  },
);
