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

import { ApplicationListViews } from "@merit/grantmaking-web/rounds";
import {
  encodeApplicationDetail,
  roundView,
  type ApplicationOverview,
} from "@merit/grantmaking/api";
import { makeApplication, makeRound } from "@merit/grantmaking/testing/fixtures";
import { defaultLocale } from "@merit/i18n";
import type { Workspace } from "@merit/organizations/api";
import { createQueryClient } from "@merit/query";

import { productRoute } from "../../../../../tests/product-route";
import { WebMessagesProvider } from "../../../../app/messages";
import { Route as workspaceRoute } from "../../../../routes/app.$workspaceSlug";
import { Route as applicationRoute } from "../../../../routes/app.$workspaceSlug.applications.$applicationRef";
import { Route } from "../../../../routes/app.$workspaceSlug.applications.index";
import { readWorkspaces } from "../../../workspace/data/server/organization.functions";
import { readWorkspace } from "../../../workspace/data/server/workspace.functions";
import { createApplication } from "../../data/server/creation/creation.functions";
import {
  readFundingApplicationPage,
  readFundingRounds,
  readWorkspaceApplications,
} from "../../data/server/funding-round.functions";

vi.mock("../../data/server/funding-round.functions", () => ({
  readFundingApplicationPage: vi.fn(),
  readFundingRounds: vi.fn(),
  readWorkspaceApplications: vi.fn(),
}));
vi.mock("../../data/server/reviews/reviewer.functions", () => ({
  applicationReviewers: vi.fn(async () => ({ status: "ok", value: [] })),
  inviteReviewer: vi.fn(async () => ({ status: "invalid" })),
  manageReviewer: vi.fn(async () => ({ status: "invalid" })),
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
  withdrawn: false,
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
  manager: "Dana Reed",
  managerNeedsReassignment: false,
  applicationCount: applications.filter((application) => application.roundId === round.publicId)
    .length,
  meetingDate: null,
  budget: null,
}));

const applicationPageData = () => {
  const application = makeApplication({ id: "b8q3w5j7c2df", title: "Zebra workshops" });
  const round = roundView(
    makeRound({
      id: roundId,
      title: "Neighbourhood grants",
      foundation: workspace.name,
      applications: [application],
    }),
  );
  return {
    status: "ok" as const,
    ...encodeApplicationDetail({ round, application: round.applications[0]! }),
    recommendationVersion: 0,
    intake: { revision: 0, workingRevision: null, history: [] },
    workspaceSlug: workspace.slug,
  };
};

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
  vi.mocked(readFundingApplicationPage).mockReset().mockResolvedValue(applicationPageData());
  vi.mocked(createApplication).mockReset();
});

afterEach(() => vi.unstubAllEnvs());

const renderApplications = async (search = "") => {
  const root = createRootRoute({
    component: () => (
      <WebMessagesProvider>
        <ApplicationListViews>
          <Outlet />
        </ApplicationListViews>
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
  applicationRoute.update({
    getParentRoute: () => workspaceRoute,
    path: "/applications/$applicationRef",
  } as Parameters<typeof applicationRoute.update>[0]);
  const queryClient = createQueryClient();
  const router = createRouter({
    context: { queryClient, locale: defaultLocale },
    routeTree: root.addChildren([
      product.addChildren([workspaceRoute.addChildren([Route, applicationRoute])]),
    ]),
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

it("keeps filtering and sorting in the URL, excludes search text from the URL, and clears filters while preserving sorting", async () => {
  vi.mocked(readWorkspaceApplications).mockResolvedValue({
    status: "ok",
    applications: [
      applications[0]!,
      { ...applications[1]!, intakeStatus: "ready" },
      applications[2]!,
    ],
  });
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

  await user.click(screen.getByRole("button", { name: "All applications Show" }));
  await user.click(screen.getByRole("option", { name: "In preparation" }));

  expect(titles()).toEqual(["Zebra workshops"]);
  expect(router.state.location.search).toMatchObject({
    round: roundId,
    filter: "preparing",
    sort: "application",
  });

  await user.click(table.getByRole("button", { name: "Application" }));

  expect(router.state.location.search).toMatchObject({
    round: roundId,
    filter: "preparing",
    sort: "application",
    direction: "descending",
  });

  await user.type(screen.getByRole("searchbox", { name: "Search applications" }), "Zebra");

  expect(router.state.location.searchStr).not.toContain("Zebra");

  await user.click(screen.getByRole("button", { name: "Clear filters" }));

  expect(titles()).toEqual(["Zebra workshops", "Community meals", "Art circles"]);
  expect(screen.getByRole("searchbox", { name: "Search applications" })).toHaveValue("");
  expect(router.state.location.search).toEqual({
    round: undefined,
    filter: undefined,
    sort: "application",
    direction: "descending",
  });

  await user.click(table.getByRole("button", { name: "Application" }));

  expect(titles()).toEqual(["Zebra workshops", "Art circles", "Community meals"]);
  expect(router.state.location.search).toEqual({
    round: undefined,
    filter: undefined,
    sort: undefined,
    direction: undefined,
  });
});

it("keeps the list context on application, review, and created links and restores session search when returning", async () => {
  vi.mocked(createApplication).mockResolvedValue({ status: "ok", publicId: "b8q3w5j7c2df" });
  const { user, router } = await renderApplications(
    `?round=${roundId}&filter=preparing&sort=application&direction=descending`,
  );
  const row = within(await screen.findByRole("row", { name: /Zebra workshops/ }));
  const applicationLink = row.getByRole("link", { name: "Zebra workshops" });
  const applicationLocation = new URL(applicationLink.getAttribute("href")!, "http://localhost");

  expect(applicationLocation.pathname).toBe("/app/alder/applications/zebra-workshops-b8q3w5j7c2df");
  expect(Object.fromEntries(applicationLocation.searchParams)).toEqual({
    round: roundId,
    filter: "preparing",
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
    filter: "preparing",
    sort: "application",
    direction: "descending",
    from: "applications",
    tab: "reviews",
  });

  await user.type(screen.getByRole("searchbox", { name: "Search applications" }), "Zebra");

  expect(screen.getByRole("status")).toHaveTextContent("1 of 3 applications");
  expect(router.state.location.searchStr).not.toContain("Zebra");

  await user.click(applicationLink);

  const backLink = await screen.findByRole("link", { name: "Back to applications" });
  const backLocation = new URL(backLink.getAttribute("href")!, "http://localhost");

  expect(backLocation.pathname).toBe("/app/alder/applications");
  expect(Object.fromEntries(backLocation.searchParams)).toEqual({
    round: roundId,
    filter: "preparing",
    sort: "application",
    direction: "descending",
  });

  await user.click(backLink);

  expect(await screen.findByRole("searchbox", { name: "Search applications" })).toHaveValue(
    "Zebra",
  );
  expect(screen.getByRole("status")).toHaveTextContent("1 of 3 applications");

  await user.click(screen.getByRole("button", { name: /New application in/ }));
  await user.click(screen.getByRole("option", { name: "Neighbourhood grants" }));
  await user.click(screen.getByRole("button", { name: "Add application" }));
  const dialog = within(await screen.findByRole("dialog", { name: "Add application" }));
  await user.type(dialog.getByLabelText(/Project title/), "Zebra workshops");
  await user.click(dialog.getByRole("button", { name: "Add application" }));

  expect(await screen.findByRole("link", { name: "Back to applications" })).toHaveAttribute(
    "href",
    expect.stringContaining(
      `round=${roundId}&filter=preparing&sort=application&direction=descending`,
    ),
  );
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
