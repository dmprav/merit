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

import type { ApplicationOverview } from "@merit/grantmaking/api";
import { defaultLocale } from "@merit/i18n";
import type { Workspace } from "@merit/organizations/api";
import { createQueryClient } from "@merit/query";

import { productRoute } from "../../../../../tests/product-route";
import { WebMessagesProvider } from "../../../../app/messages";
import { Route as workspaceRoute } from "../../../../routes/app.$workspaceSlug";
import { Route } from "../../../../routes/app.$workspaceSlug.applications.index";
import { readWorkspaces } from "../../../workspace/data/server/organization.functions";
import { readWorkspace } from "../../../workspace/data/server/workspace.functions";
import {
  readFundingRounds,
  readWorkspaceApplications,
} from "../../data/server/funding-round.functions";

vi.mock("../../data/server/funding-round.functions", () => ({
  readFundingRounds: vi.fn(),
  readWorkspaceApplications: vi.fn(),
}));
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
const otherRoundId = "c7m2p9x4n6rt";
const applications: ApplicationOverview[] = (
  [
    ["b8q3w5j7c2df", "Zebra workshops", roundId, "Neighbourhood grants"],
    ["h7m2p9x4n6rt", "Art circles", roundId, "Neighbourhood grants"],
    ["m7n2p9x4k6rt", "Community meals", otherRoundId, "Food grants"],
  ] as const
).map(([id, title, roundId, roundTitle]) => ({
  id,
  title,
  roundId,
  roundTitle,
  applicant: "Community group",
  intakeStatus: "in_preparation",
  reviews: { current: 0, outdated: 0, outstanding: 0, unknown: 0 },
  criteriaChanged: false,
  recommendation: null,
}));
const rounds = [
  { publicId: roundId, title: "Neighbourhood grants" },
  { publicId: otherRoundId, title: "Food grants" },
].map((round) => ({
  ...round,
  organizationId: workspace.id,
  organizationName: workspace.name,
  workspaceSlug: workspace.slug,
  decisionStatus: "Preparing",
  applicationCount: applications.filter((application) => application.roundId === round.publicId)
    .length,
  meetingDate: null,
  budget: null,
}));

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
  vi.mocked(readWorkspaceApplications)
    .mockReset()
    .mockResolvedValue({ status: "ok", applications });
  vi.mocked(readFundingRounds).mockReset().mockResolvedValue({ status: "ok", rounds });
});

afterEach(() => vi.unstubAllEnvs());

const renderApplications = async (search = "") => {
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
    path: "/applications/",
  } as Parameters<typeof Route.update>[0]);
  const queryClient = createQueryClient();
  const router = createRouter({
    context: { queryClient, locale: defaultLocale },
    routeTree: root.addChildren([product.addChildren([workspaceRoute.addChildren([Route])])]),
    history: createMemoryHistory({ initialEntries: ["/app/alder/applications/" + search] }),
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

it.each([
  {
    workspaceStatus: "signed_out",
    applicationsStatus: "not_found",
    roundsStatus: "workspace_not_found",
    heading: "Sign in to your workspace",
  },
  {
    workspaceStatus: "workspace_not_found",
    applicationsStatus: "signed_out",
    roundsStatus: "not_found",
    heading: "Workspace not available",
  },
  {
    workspaceStatus: "ok",
    applicationsStatus: "not_found",
    roundsStatus: "signed_out",
    heading: "Applications not available",
  },
  {
    workspaceStatus: "ok",
    applicationsStatus: "ok",
    roundsStatus: "signed_out",
    heading: "Sign in to your workspace",
  },
  {
    workspaceStatus: "ok",
    applicationsStatus: "ok",
    roundsStatus: "not_found",
    heading: "Applications not available",
  },
] as const)(
  "prioritizes workspace $workspaceStatus, applications $applicationsStatus, then rounds $roundsStatus",
  async ({ workspaceStatus, applicationsStatus, roundsStatus, heading }) => {
    if (workspaceStatus !== "ok") {
      vi.mocked(readWorkspace).mockResolvedValue({ status: workspaceStatus });
    }
    if (applicationsStatus !== "ok") {
      vi.mocked(readWorkspaceApplications).mockResolvedValue({ status: applicationsStatus });
    }
    vi.mocked(readFundingRounds).mockResolvedValue({ status: roundsStatus });

    await renderApplications();

    expect(await screen.findByRole("heading", { name: heading })).toBeVisible();
    expect(screen.queryByRole("table", { name: "Applications" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /New application in/ })).not.toBeInTheDocument();
  },
);

it("keeps filtering and sorting in the URL and restores all rounds and source order", async () => {
  const { user, router } = await renderApplications();
  const table = within(await screen.findByRole("table", { name: "Applications" }));

  const titles = () =>
    table
      .getAllByRole("row")
      .slice(1)
      .map((row) => within(row).getAllByRole("link")[0]?.textContent);

  expect(titles()).toEqual(["Zebra workshops", "Art circles", "Community meals"]);

  await user.click(table.getByRole("button", { name: "Application" }));

  expect(titles()).toEqual(["Art circles", "Community meals", "Zebra workshops"]);
  expect(router.state.location.search).toMatchObject({ sort: "application" });

  await user.click(screen.getByRole("button", { name: "All rounds Round" }));
  await user.click(screen.getByRole("option", { name: "Neighbourhood grants" }));

  expect(titles()).toEqual(["Art circles", "Zebra workshops"]);
  expect(router.state.location.search).toMatchObject({ round: roundId, sort: "application" });

  await user.click(table.getByRole("button", { name: "Application" }));

  expect(titles()).toEqual(["Zebra workshops", "Art circles"]);
  expect(router.state.location.search).toMatchObject({
    round: roundId,
    sort: "application",
    direction: "descending",
  });

  await user.click(screen.getByRole("button", { name: "Neighbourhood grants Round" }));
  await user.click(screen.getByRole("option", { name: "All rounds" }));
  await user.click(table.getByRole("button", { name: "Application" }));

  expect(titles()).toEqual(["Zebra workshops", "Art circles", "Community meals"]);
  expect(router.state.location.search).toEqual({
    round: undefined,
    sort: undefined,
    direction: undefined,
  });
});

it("keeps the list context on application and review links and identifies the owning round", async () => {
  await renderApplications(`?round=${roundId}&sort=application&direction=descending`);
  const row = within(await screen.findByRole("row", { name: /Zebra workshops/ }));
  const applicationLink = row.getByRole("link", { name: "Zebra workshops" });
  const applicationLocation = new URL(applicationLink.getAttribute("href")!, "http://localhost");

  expect(applicationLocation.pathname).toBe("/app/alder/applications/zebra-workshops-b8q3w5j7c2df");
  expect(Object.fromEntries(applicationLocation.searchParams)).toEqual({
    round: roundId,
    sort: "application",
    direction: "descending",
    from: "applications",
  });
  expect(row.getByRole("link", { name: "Neighbourhood grants" })).toHaveAttribute(
    "href",
    "/app/alder/rounds/neighbourhood-grants-k7m2p9x4n6rt",
  );

  const reviewLink = row.getByRole("link", { name: "No reviewers assigned." });
  const reviewLocation = new URL(reviewLink.getAttribute("href")!, "http://localhost");

  expect(reviewLocation.pathname).toBe(applicationLocation.pathname);
  expect(Object.fromEntries(reviewLocation.searchParams)).toEqual({
    round: roundId,
    sort: "application",
    direction: "descending",
    from: "applications",
    tab: "reviews",
  });
});

it("explains how to start in a workspace without rounds", async () => {
  vi.mocked(readWorkspaceApplications).mockResolvedValue({ status: "ok", applications: [] });
  vi.mocked(readFundingRounds).mockResolvedValue({ status: "ok", rounds: [] });
  await renderApplications();

  expect(await screen.findByText("No applications in this workspace yet.")).toBeVisible();
  expect(screen.getByText("Create a funding round before adding an application.")).toBeVisible();
  expect(screen.getByRole("link", { name: "Go to funding rounds" })).toHaveAttribute(
    "href",
    "/app/alder/rounds",
  );
  expect(screen.queryByRole("button", { name: "Add application" })).not.toBeInTheDocument();
});
