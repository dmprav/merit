import { QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

import type { WorkspaceActivity } from "@merit/grantmaking/api";
import { defaultLocale } from "@merit/i18n";
import type { Workspace } from "@merit/organizations/api";
import { createQueryClient } from "@merit/query";

import { productRoute } from "../../../../../tests/product-route";
import { WebMessagesProvider } from "../../../../app/messages";
import { Route as workspaceRoute } from "../../../../routes/app.$workspaceSlug";
import { Route } from "../../../../routes/app.$workspaceSlug.activity";
import { readWorkspaces } from "../../../workspace/data/server/organization.functions";
import { readWorkspace } from "../../../workspace/data/server/workspace.functions";
import { readWorkspaceActivity } from "../../data/server/activity.functions";
import { readFundingRounds } from "../../data/server/funding-round.functions";

vi.mock("../../data/server/activity.functions", () => ({ readWorkspaceActivity: vi.fn() }));
vi.mock("../../data/server/funding-round.functions", () => ({ readFundingRounds: vi.fn() }));
vi.mock("../../../workspace/data/server/organization.functions", () => ({
  readWorkspaces: vi.fn(),
}));
vi.mock("../../../workspace/data/server/workspace.functions", () => ({
  readWorkspace: vi.fn(),
}));
vi.mock("../../data/server/creation/creation.functions", () => ({
  createApplication: vi.fn(),
  createRound: vi.fn(),
}));

const workspace: Workspace = {
  id: "alder",
  name: "Alder Foundation",
  slug: "alder",
  kind: "standard",
  demoExpiresAt: null,
  role: "program_manager",
  administration: "owner",
  canWorkOnGrants: true,
};
const roundId = "k7m2p9x4n6rt";
const rounds = [{ publicId: roundId, title: "Neighbourhood grants" }].map((round) => ({
  ...round,
  organizationId: workspace.id,
  organizationName: workspace.name,
  workspaceSlug: workspace.slug,
  decisionStatus: "Preparing",
  manager: "Dana Reed",
  managerNeedsReassignment: false,
  applicationCount: 0,
  meetingDate: null,
  budget: null,
}));

const entry = (index: number, overrides: Partial<WorkspaceActivity["entries"][number]> = {}) => ({
  id: `00000000-0000-4000-a000-${String(index).padStart(12, "0")}`,
  recordedAt: "2027-01-20T12:00:00.000Z",
  actor: "Dana Reed",
  provenance: { interface: "web" as const },
  action: "application.created",
  subject: {
    type: "application",
    id: "b8q3w5j7c2df",
    revision: 0,
    name: null,
    roundId: null,
    applicationId: "b8q3w5j7c2df",
  },
  record: { kind: "application" as const, id: "b8q3w5j7c2df", title: "Workshop Saturdays" },
  ...overrides,
});

const people = [{ id: "dana", name: "Dana Reed" }];
const first: WorkspaceActivity = {
  status: "ok",
  entries: [
    entry(1),
    entry(2, {
      action: "round.budget_changed",
      record: { kind: "round", id: roundId, title: "Neighbourhood grants" },
    }),
  ],
  people,
  nextCursor: "cursor-1",
};
const older: WorkspaceActivity = {
  status: "ok",
  entries: [entry(3, { action: "round.criteria_changed", record: null })],
  people,
  nextCursor: null,
};

const requests = () => vi.mocked(readWorkspaceActivity).mock.calls.map(([request]) => request.data);

beforeEach(() => {
  vi.stubEnv("MERIT_LOCAL_WORKSPACE", "true");
  vi.mocked(readWorkspace).mockReset().mockResolvedValue({ status: "ok", workspace });
  vi.mocked(readWorkspaces)
    .mockReset()
    .mockResolvedValue({
      status: "ok",
      value: [workspace],
      draftScope: "test-account",
      canAdminister: false,
    });
  vi.mocked(readFundingRounds).mockReset().mockResolvedValue({ status: "ok", rounds });
  vi.mocked(readWorkspaceActivity)
    .mockReset()
    .mockImplementation(async ({ data }) => (data.after ? older : first));
});

afterEach(() => vi.unstubAllEnvs());

const renderActivity = async () => {
  const root = createRootRoute({
    component: () => (
      <WebMessagesProvider>
        <Outlet />
      </WebMessagesProvider>
    ),
  });
  const product = productRoute(root);
  workspaceRoute.update({
    getParentRoute: () => product,
    path: "/app/$workspaceSlug",
  } as Parameters<typeof workspaceRoute.update>[0]);
  Route.update({
    getParentRoute: () => workspaceRoute,
    path: "/activity",
  } as Parameters<typeof Route.update>[0]);
  const queryClient = createQueryClient();
  const router = createRouter({
    context: { queryClient, locale: defaultLocale },
    routeTree: root.addChildren([product.addChildren([workspaceRoute.addChildren([Route])])]),
    history: createMemoryHistory({ initialEntries: ["/app/alder/activity"] }),
    defaultPendingMinMs: 0,
  });
  await router.load();

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  await waitFor(() =>
    expect(screen.queryByRole("heading", { name: "Restoring drafts…" })).not.toBeInTheDocument(),
  );

  return { router, user: userEvent.setup() };
};

it("keeps filters out of the address and sends them in the request body", async () => {
  const { user, router } = await renderActivity();
  await screen.findByRole("table", { name: "Activity" });

  await user.click(screen.getByRole("button", { name: "All rounds Round" }));
  await user.click(screen.getByRole("option", { name: "Neighbourhood grants" }));
  await user.click(await screen.findByRole("button", { name: "All people Person" }));
  await user.click(screen.getByRole("option", { name: "Dana Reed" }));

  await waitFor(() =>
    expect(requests().at(-1)).toEqual({
      workspaceSlug: "alder",
      roundId,
      personId: "dana",
      after: undefined,
    }),
  );
  expect(router.state.location.search).toEqual({});
  expect(router.state.location.href).toBe("/app/alder/activity");
});

it("follows the cursor with the same filters and drops it when a filter changes", async () => {
  const { user } = await renderActivity();
  await screen.findByRole("table", { name: "Activity" });
  await user.click(screen.getByRole("button", { name: "All people Person" }));
  await user.click(screen.getByRole("option", { name: "Dana Reed" }));
  await user.click(await screen.findByRole("button", { name: "Show older activity" }));

  expect(await screen.findByText("Round criteria changed")).toBeVisible();
  expect(requests().at(-1)).toEqual({
    workspaceSlug: "alder",
    roundId: undefined,
    personId: "dana",
    after: "cursor-1",
  });
  expect(screen.queryByRole("button", { name: "Show older activity" })).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Clear filters" }));
  await waitFor(() => expect(requests().at(-1)).toMatchObject({ personId: undefined }));
  expect(requests().at(-1)?.after).toBeUndefined();
});

it("links each record to its default page", async () => {
  await renderActivity();
  const table = within(await screen.findByRole("table", { name: "Activity" }));

  expect(table.getByRole("link", { name: "Workshop Saturdays" })).toHaveAttribute(
    "href",
    "/app/alder/applications/workshop-saturdays-b8q3w5j7c2df",
  );
  expect(table.getByRole("link", { name: "Neighbourhood grants" })).toHaveAttribute(
    "href",
    "/app/alder/rounds/neighbourhood-grants-k7m2p9x4n6rt",
  );
});

it("reports a failed older page, keeps the entries, and retries that page", async () => {
  const { user } = await renderActivity();
  await screen.findByRole("table", { name: "Activity" });
  vi.mocked(readWorkspaceActivity).mockResolvedValueOnce({ status: "unavailable" } as never);

  await user.click(screen.getByRole("button", { name: "Show older activity" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Activity could not be loaded.");
  expect(screen.getByText("Workshop Saturdays")).toBeVisible();

  await user.click(screen.getByRole("button", { name: "Try again" }));

  expect(await screen.findByText("Round criteria changed")).toBeVisible();
  expect(requests().at(-1)).toMatchObject({ after: "cursor-1" });
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("keeps the filters on the page when a filter change fails, and retries", async () => {
  const { user } = await renderActivity();
  await screen.findByRole("table", { name: "Activity" });
  vi.mocked(readWorkspaceActivity).mockImplementation(async ({ data }) =>
    data.personId ? ({ status: "unavailable" } as never) : first,
  );

  await user.click(screen.getByRole("button", { name: "All people Person" }));
  await user.click(screen.getByRole("option", { name: "Dana Reed" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Activity could not be loaded.");
  expect(screen.getByRole("button", { name: "Dana Reed Person" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Clear filters" })).toBeVisible();

  vi.mocked(readWorkspaceActivity).mockImplementation(async () => first);
  await user.click(screen.getByRole("button", { name: "Try again" }));

  await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  expect(screen.getByText("Workshop Saturdays")).toBeVisible();
});

it("tells people without program-manager access that activity is not available", async () => {
  vi.mocked(readWorkspaceActivity)
    .mockReset()
    .mockResolvedValue({ status: "not_found" } as never);

  await renderActivity();

  expect(await screen.findByRole("heading", { name: "Activity not available" })).toBeVisible();
  expect(screen.queryByRole("table", { name: "Activity" })).not.toBeInTheDocument();
  expect(requests()).toHaveLength(1);
});
