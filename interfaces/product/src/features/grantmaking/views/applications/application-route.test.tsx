import { onlineManager, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { assert, afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { ApplicationListViews } from "@merit/grantmaking-web/rounds";
import { encodeRoundOverview, encodeApplicationDetail } from "@merit/grantmaking/api";
import { roundView } from "@merit/grantmaking/api";
import { makeApplication, makeRound } from "@merit/grantmaking/testing/fixtures";
import { defaultLocale } from "@merit/i18n";
import { fromMinorUnits } from "@merit/money";
import { createQueryClient } from "@merit/query";
import { encodeRecommendation } from "@merit/recommendations/api";

import { productRoute } from "../../../../../tests/product-route";
import { WebMessagesProvider } from "../../../../app/messages";
import { Route } from "../../../../routes/app/$workspaceSlug/applications/$applicationRef";
import { Route as roundRoute } from "../../../../routes/app/$workspaceSlug/rounds/$roundRef";
import { Route as workspaceRoute } from "../../../../routes/app/$workspaceSlug/route";
import { readWorkspaces } from "../../../workspace/data/server/organization.functions";
import { readWorkspace } from "../../../workspace/data/server/workspace.functions";
import {
  readFundingRoundPage,
  readFundingApplicationPage,
} from "../../data/server/funding-round.functions";
import { saveRecommendation } from "../../data/server/recommendations/recommendations.functions";

const selectedApplication = () =>
  makeApplication({
    id: "b8q3w5j7c2df",
    title: "Workshop Saturdays",
    version: 2,
    intakeStatus: "ready",
    requested: fromMinorUnits(2400000n),
    submission: {
      version: 2,
      answers: [
        {
          questionId: "93205cef-fbf5-5e66-849f-9596bbbf23c5",
          question: "Plan",
          response: "Weekend workshops.",
        },
      ],
    },
    managerRecommendation: {
      position: "Fund",
      allocation: fromMinorUnits(2000000n),
      reasoning: "Support the workshops.",
      recorded: { date: "2027-01-18", applicationVersion: 2 },
    },
    reviews: {
      revision: 2,
      requests: [
        {
          id: "pending-request",
          contactId: "jules",
          reviewer: "Jules",
          applicationVersion: 2,
          criteriaVersion: 1,
          criteria: [],
          status: "outstanding",
          recorder: null,
          closedBy: null,
        },
      ],
      assessments: [
        {
          id: "earlier-assessment",
          contactId: "sam",
          reviewer: "Sam Morgan",
          requestId: null,
          previousId: null,
          versions: [
            {
              content: {
                applicationVersion: 1,
                criteriaVersion: 1,
                date: "2027-01-16",
                position: "Fund",
                amount: "18000.00",
                reasoning: "The original venue makes the budget credible.",
                observations: [],
              },
              criteria: [],
              recorder: null,
              note: "",
            },
          ],
        },
      ],
    },
  });

const routeRound = () =>
  roundView(
    makeRound({
      id: "k7m2p9x4n6rt",
      title: "Neighbourhood grants",
      foundation: "Alder Foundation",
      budget: fromMinorUnits(10000000n),
      applications: [
        makeApplication({ id: "h7m2p9x4n6rt", title: "Community meals" }),
        selectedApplication(),
      ],
    }),
  );

const pageData = () => ({
  status: "ok" as const,
  preparation: { revision: 0, managers: [], budgetHistory: [] },
  round: encodeRoundOverview(routeRound()),
  workspaceSlug: "alder",
});

const applicationData = () => {
  const round = routeRound();
  const application = round.applications.find(({ id }) => id === "b8q3w5j7c2df");
  assert.isDefined(application);

  return {
    status: "ok" as const,
    ...encodeApplicationDetail({ round, application }),
    recommendationVersion: 0,
    intake: { revision: 0, workingRevision: null, history: [] },
    workspaceSlug: "alder",
  };
};

vi.mock("../../data/server/funding-round.functions", () => ({
  readFundingRoundPage: vi.fn(),
  readFundingApplicationPage: vi.fn(),
}));
vi.mock("../../data/server/reviews/reviewer.functions", () => ({
  applicationReviewers: vi.fn(async () => ({ status: "ok", value: [] })),
  inviteReviewer: vi.fn(async () => ({ status: "invalid" })),
  manageReviewer: vi.fn(async () => ({ status: "invalid" })),
}));
vi.mock("../../data/server/recommendations/recommendations.functions", () => ({
  saveRecommendation: vi.fn(),
}));
vi.mock("../../data/server/creation/creation.functions", () => ({
  createApplication: vi.fn(),
  createRound: vi.fn(),
}));
vi.mock("../../data/server/intake/intake.functions", () => ({ editApplication: vi.fn() }));
vi.mock("../../data/server/preparation/preparation.functions", () => ({
  editRound: vi.fn(),
  deleteRound: vi.fn(),
}));
vi.mock("../../../workspace/data/server/organization.functions", () => ({
  readWorkspaces: vi.fn(),
}));
vi.mock("../../../workspace/data/server/workspace.functions", () => ({
  readWorkspace: vi.fn(),
}));
const workspace = {
  id: "alder",
  name: "Alder Foundation",
  slug: "alder",
  kind: "standard" as const,
  demoExpiresAt: null,
  role: "program_manager" as const,
  canWorkOnGrants: true,
  administration: "owner" as const,
};
beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  vi.mocked(readWorkspace).mockReset().mockResolvedValue({ status: "ok", workspace });
  vi.mocked(readWorkspaces)
    .mockReset()
    .mockResolvedValue({
      status: "ok",
      value: [workspace],
      draftScope: "test-account",
      canAdminister: false,
    });
  vi.mocked(readFundingRoundPage)
    .mockReset()
    .mockImplementation(async () => pageData());
  vi.mocked(readFundingApplicationPage)
    .mockReset()
    .mockImplementation(async () => applicationData());
  vi.mocked(saveRecommendation).mockReset();
});

afterEach(() => vi.restoreAllMocks());

const applicationPath = "/app/alder/applications/workshop-saturdays-b8q3w5j7c2df";

const renderApplication = async (search = "?tab=reviews", path = applicationPath) => {
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
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
  // Wire the actual file route as the generated route tree does in the host.
  workspaceRoute.update({
    getParentRoute: () => product,
    path: "/app/$workspaceSlug",
  } as Parameters<typeof workspaceRoute.update>[0]);
  Route.update({
    getParentRoute: () => workspaceRoute,
    path: "/applications/$applicationRef",
  } as Parameters<typeof Route.update>[0]);
  roundRoute.update({
    getParentRoute: () => workspaceRoute,
    path: "/rounds/$roundRef",
  } as Parameters<typeof roundRoute.update>[0]);
  const index = createRoute({
    getParentRoute: () => workspaceRoute,
    path: "/rounds",
    component: () => <p>Rounds stub</p>,
  });
  const queryClient = createQueryClient();
  const router = createRouter({
    context: { queryClient, locale: defaultLocale },
    routeTree: root.addChildren([
      product.addChildren([workspaceRoute.addChildren([index, Route, roundRoute])]),
    ]),
    history: createMemoryHistory({ initialEntries: ["/app/alder/rounds", path + search] }),
    defaultPendingMinMs: 0,
  });
  await router.load();

  const view = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  await waitFor(() =>
    expect(screen.queryByRole("heading", { name: "Restoring drafts…" })).not.toBeInTheDocument(),
  );
  return {
    ...view,
    router,
    queryClient,
    user: userEvent.setup(),
  };
};

it.each(["unavailable", "transport"] as const)(
  "preserves the open draft and baseline through a %s discovery failure and recovery",
  async (failure) => {
    const discovery = {
      status: "ok" as const,
      value: [
        { ...workspace, kind: "demo" as const },
        { ...workspace, id: "birch", slug: "birch", name: "Birch Foundation" },
      ],
      draftScope: "test-account",
      canAdminister: false,
    };
    vi.mocked(readWorkspaces).mockResolvedValue(discovery);
    const { user, router } = await renderApplication();
    await user.click(
      await screen.findByRole("button", { name: "Edit recommendation for Workshop Saturdays" }),
    );
    const reasoning = screen.getByLabelText(/Reasoning/);
    await user.clear(reasoning);
    await user.type(reasoning, "Unfinished judgment");

    if (failure === "unavailable") {
      vi.mocked(readWorkspaces).mockResolvedValue({ status: "unavailable" });
    } else {
      vi.mocked(readWorkspaces).mockRejectedValue(new Error("Disconnected"));
    }
    await act(() => router.invalidate());
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /Switch workspace/ })).not.toBeInTheDocument(),
    );

    expect(screen.getByLabelText(/Reasoning/)).toBe(reasoning);
    expect(reasoning).toHaveValue("Unfinished judgment");
    await user.type(reasoning, " kept while discovery is unavailable.");

    const updated = applicationData();
    updated.recommendationVersion = 1;
    vi.mocked(readFundingApplicationPage).mockResolvedValue(updated);
    vi.mocked(readWorkspaces).mockResolvedValue(discovery);
    await act(() => router.invalidate());
    await screen.findByRole("button", { name: /Switch workspace/ });

    expect(screen.getByLabelText(/Reasoning/)).toBe(reasoning);
    expect(reasoning).toHaveValue("Unfinished judgment kept while discovery is unavailable.");
    vi.mocked(saveRecommendation).mockResolvedValue({ status: "conflict" });
    await user.click(screen.getByRole("button", { name: "Save recommendation" }));
    expect(vi.mocked(saveRecommendation).mock.calls[0]?.[0].data).toMatchObject({
      expectedRevision: 0,
      expectedApplicationVersion: 2,
    });
  },
);

it("replaces authorized content after an access denial even when discovery is unavailable", async () => {
  const { router } = await renderApplication();
  vi.mocked(readWorkspaces).mockResolvedValue({ status: "unavailable" });
  vi.mocked(readFundingApplicationPage).mockResolvedValue({ status: "not_found" });
  await act(() => router.invalidate());

  expect(await screen.findByRole("heading", { name: "Application not available" })).toBeVisible();
  expect(screen.queryByText("Support the workshops.", { exact: true })).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Edit recommendation for Workshop Saturdays" }),
  ).not.toBeInTheDocument();
});

it("resets the editor when discovery confirms a different account scope", async () => {
  const { user, router } = await renderApplication();
  await user.click(
    await screen.findByRole("button", { name: "Edit recommendation for Workshop Saturdays" }),
  );
  await user.clear(screen.getByLabelText(/Reasoning/));
  await user.type(screen.getByLabelText(/Reasoning/), "Previous account's unfinished work");

  vi.mocked(readWorkspaces).mockResolvedValue({
    status: "ok",
    value: [workspace],
    draftScope: "another-account",
    canAdminister: false,
  });
  await act(() => router.invalidate());

  await waitFor(() => expect(screen.queryByRole("form")).not.toBeInTheDocument());
  await user.click(
    await screen.findByRole("button", { name: "Edit recommendation for Workshop Saturdays" }),
  );
  expect(screen.getByLabelText(/Reasoning/)).toHaveValue("Support the workshops.");
});

it("recovers an offline page through Try again without submitting a write", async () => {
  onlineManager.setOnline(false);
  vi.mocked(readFundingApplicationPage).mockRejectedValue(new Error("Disconnected"));

  try {
    const { user } = await renderApplication();
    expect(screen.getByRole("heading", { name: "Application could not be loaded" })).toBeVisible();

    vi.mocked(readFundingApplicationPage).mockImplementation(async () => applicationData());
    onlineManager.setOnline(true);
    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("Support the workshops.", { exact: true })).toBeVisible();
    expect(saveRecommendation).not.toHaveBeenCalled();
  } finally {
    onlineManager.setOnline(true);
  }
});

it("keeps usable application content quiet after a failed background refresh", async () => {
  const { queryClient } = await renderApplication();
  vi.mocked(readFundingApplicationPage).mockResolvedValue({ status: "unavailable" });
  await act(() =>
    queryClient.refetchQueries({ predicate: (query) => query.queryKey.includes("application") }),
  );

  expect(screen.getByText("Support the workshops.", { exact: true })).toBeVisible();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
});

describe("workspace application sections", () => {
  it("preserves application sorting when returning through the round breadcrumb", async () => {
    const { user } = await renderApplication(
      "?section=applications",
      "/app/alder/rounds/neighbourhood-grants-k7m2p9x4n6rt",
    );

    const sortHeader = () => screen.getByRole("button", { name: "Application" }).closest("th");

    await user.click(screen.getByRole("button", { name: "Application" }));
    await user.click(screen.getByRole("button", { name: "Application" }));

    expect(sortHeader()).toHaveAttribute("aria-sort", "descending");

    await user.click(screen.getByRole("link", { name: "Workshop Saturdays" }));
    await user.click(
      within(screen.getByRole("navigation", { name: "Breadcrumb" })).getByRole("link", {
        name: "Neighbourhood grants",
      }),
    );

    expect(sortHeader()).toHaveAttribute("aria-sort", "descending");
    expect(within(screen.getAllByRole("row")[1]!).getAllByRole("cell")[0]).toHaveTextContent(
      "Workshop Saturdays",
    );
  });

  it("updates workspace switching when accessible memberships change", async () => {
    const { router } = await renderApplication();

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /Switch workspace/ })).not.toBeInTheDocument(),
    );

    vi.mocked(readWorkspaces).mockResolvedValue({
      status: "ok",
      draftScope: "test-account",
      canAdminister: false,
      value: [workspace, { ...workspace, id: "birch", slug: "birch", name: "Birch Foundation" }],
    });
    await act(() => router.invalidate());

    expect(
      await screen.findByRole("button", { name: "Alder Foundation: Switch workspace" }),
    ).toBeVisible();

    vi.mocked(readWorkspaces).mockResolvedValue({ status: "unavailable" });
    await act(() => router.invalidate());

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /Switch workspace/ })).not.toBeInTheDocument(),
    );
    expect(
      within(screen.getByRole("complementary", { name: "" })).getByText("Alder Foundation"),
    ).toBeVisible();
  });

  it("opens the round on Overview and returns application breadcrumbs to Applications", async () => {
    const { user, router } = await renderApplication(
      "",
      "/app/alder/rounds/neighbourhood-grants-k7m2p9x4n6rt",
    );

    expect(screen.getByRole("tab", { name: "Overview", selected: true })).toBeVisible();

    await user.click(screen.getByRole("tab", { name: /Applications/ }));

    expect(router.state.location.search.section).toBe("applications");

    await user.click(screen.getByRole("link", { name: "Workshop Saturdays" }));
    await user.click(
      within(screen.getByRole("navigation", { name: "Breadcrumb" })).getByRole("link", {
        name: "Neighbourhood grants",
      }),
    );

    expect(router.state.location.search.section).toBe("applications");
    expect(screen.getByRole("tab", { name: /Applications/, selected: true })).toBeVisible();
  });

  it("retains round details through a canonical redirect and opens review links from Applications", async () => {
    const { user, router } = await renderApplication(
      "?section=details",
      "/app/alder/rounds/previous-title-k7m2p9x4n6rt",
    );

    expect(router.state.location.pathname).toBe(
      "/app/alder/rounds/neighbourhood-grants-k7m2p9x4n6rt",
    );
    expect(router.state.location.search.section).toBe("overview");
    expect(screen.getByRole("tab", { name: "Overview", selected: true })).toBeVisible();

    await user.click(screen.getByRole("tab", { name: /Applications/ }));
    await user.click(screen.getByRole("link", { name: "1 outdated review, 1 awaiting review" }));

    expect(screen.getByRole("region", { name: "Reviewer assessments" })).toBeVisible();
    expect(router.state.location.pathname).toBe(applicationPath);
  });

  it("opens shared review URLs and replaces reference history while keeping the page in place", async () => {
    const { user, router, unmount } = await renderApplication();

    expect(screen.getByRole("region", { name: "Reviewer assessments" })).toBeVisible();

    vi.mocked(window.scrollTo).mockClear();
    await user.click(screen.getByRole("button", { name: "Back to application" }));

    expect(router.state.location.search.tab).toBeUndefined();
    expect(screen.getByRole("region", { name: "Applicant submission" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Manage reviews" }));

    expect(router.state.location.search).toEqual({ tab: "reviews" });
    expect(router.history.length).toBe(2);
    expect(window.scrollTo).not.toHaveBeenCalled();

    const savedSearch = router.state.location.searchStr;
    await act(async () => router.history.back());

    expect(await screen.findByText("Rounds stub")).toBeVisible();

    unmount();
    await renderApplication(savedSearch);

    expect(screen.getByRole("region", { name: "Reviewer assessments" })).toBeVisible();
  });

  it("falls back to the applicant submission for an unknown section", async () => {
    await renderApplication("?tab=unknown");

    expect(screen.getByRole("region", { name: "Applicant submission" })).toBeVisible();
  });
});

it("redirects outdated title slugs without adding a history entry or losing the selected reference", async () => {
  const { router } = await renderApplication(
    "?tab=reviews",
    "/app/alder/applications/previous-title-b8q3w5j7c2df",
  );

  expect(router.state.location.pathname).toBe(applicationPath);
  expect(router.state.location.search.tab).toBe("reviews");
  expect(router.history.length).toBe(2);
  expect(screen.getByRole("region", { name: "Reviewer assessments" })).toBeVisible();
});

it("saves through the server and shows the committed recommendation using the shared editor", async () => {
  const { user } = await renderApplication();
  const persisted = applicationData();
  persisted.application.managerRecommendation!.reasoning = "Confirmed new venue costs.";
  persisted.recommendationVersion = 1;
  vi.mocked(saveRecommendation).mockImplementation(async () => {
    vi.mocked(readFundingApplicationPage).mockResolvedValue(persisted);

    return {
      status: "ok",
      recommendation: persisted.application.managerRecommendation!,
      recommendationVersion: persisted.recommendationVersion,
      budget: persisted.round.budget,
      totals: persisted.round.totals,
    };
  });
  await user.click(
    await screen.findByRole("button", { name: "Edit recommendation for Workshop Saturdays" }),
  );
  await user.clear(screen.getByLabelText(/Reasoning/));
  await user.type(screen.getByLabelText(/Reasoning/), "Confirmed new venue costs.");
  await user.click(screen.getByRole("button", { name: "Save recommendation" }));

  expect(saveRecommendation).toHaveBeenCalledExactlyOnceWith({
    data: {
      workspaceSlug: "alder",
      publicId: "b8q3w5j7c2df",
      expectedRevision: 0,
      expectedApplicationVersion: selectedApplication().version,
      recommendation: {
        ...encodeRecommendation(selectedApplication().managerRecommendation!),
        author: undefined,
        recorded: undefined,
        reasoning: "Confirmed new venue costs.",
      },
    },
  });
  expect(screen.queryByRole("form")).not.toBeInTheDocument();
  expect(screen.getByText("Confirmed new venue costs.", { exact: true })).toBeVisible();
  expect(
    screen.getByText("Recommendation saved", { selector: '[aria-hidden="true"]' }),
  ).toBeVisible();
  await waitFor(() =>
    expect(
      screen
        .getAllByRole("status")
        .some((element) => element.textContent === "Recommendation saved"),
    ).toBe(true),
  );
});

it("keeps the chosen reference and draft when closing and reopening the recommendation", async () => {
  const { user, router } = await renderApplication();
  await user.click(
    await screen.findByRole("button", { name: "Edit recommendation for Workshop Saturdays" }),
  );
  await user.clear(screen.getByLabelText(/Reasoning/));
  await user.type(screen.getByLabelText(/Reasoning/), "Check the revised application.");
  await user.click(
    await screen.findByRole("button", { name: "Reference material: Reviewer assessments" }),
  );
  await user.click(screen.getByRole("menuitem", { name: "Applicant submission" }));

  expect(screen.getByRole("region", { name: "Applicant submission" })).toBeVisible();
  expect(router.state.location.search.tab).toBeUndefined();
  expect(screen.getByLabelText(/Reasoning/)).toHaveValue("Check the revised application.");

  await user.click(within(screen.getByRole("form")).getByRole("button", { name: "Close" }));

  expect(screen.queryByRole("form")).not.toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Applicant submission" })).toBeVisible();
  expect(router.state.location.search.tab).toBeUndefined();

  await user.click(
    await screen.findByRole("button", {
      name: "Resume editing recommendation for Workshop Saturdays",
    }),
  );

  expect(screen.getByLabelText(/Reasoning/)).toHaveValue("Check the revised application.");
  expect(screen.getByRole("region", { name: "Applicant submission" })).toBeVisible();
});

it("retains the original revision and draft across navigation and a conflicting save", async () => {
  const { user, router } = await renderApplication();
  await user.click(
    await screen.findByRole("button", { name: "Edit recommendation for Workshop Saturdays" }),
  );
  await user.clear(screen.getByLabelText(/Reasoning/));
  await user.type(screen.getByLabelText(/Reasoning/), "Unfinished judgment");
  const updated = applicationData();
  updated.recommendationVersion = 1;
  vi.mocked(readFundingApplicationPage).mockResolvedValue(updated);
  await act(async () =>
    router.navigate({ to: "/app/$workspaceSlug/rounds", params: { workspaceSlug: "alder" } }),
  );
  await act(async () =>
    router.navigate({
      to: "/app/$workspaceSlug/applications/$applicationRef",
      params: { workspaceSlug: "alder", applicationRef: "workshop-saturdays-b8q3w5j7c2df" },
      search: { tab: "reviews" },
    }),
  );
  await user.click(
    await screen.findByRole("button", {
      name: "Resume editing recommendation for Workshop Saturdays",
    }),
  );

  expect(screen.getByLabelText(/Reasoning/)).toHaveValue("Unfinished judgment");

  vi.mocked(saveRecommendation).mockResolvedValue({ status: "conflict" });
  await user.click(screen.getByRole("button", { name: "Save recommendation" }));
  const [saveCall] = vi.mocked(saveRecommendation).mock.calls;

  assert.isDefined(saveCall);
  expect(saveCall[0].data).toMatchObject({ expectedRevision: 0 });
  expect(screen.getByRole("alert")).toHaveTextContent(
    "This application or recommendation has changed.",
  );
  expect(screen.getByLabelText(/Reasoning/)).toHaveValue("Unfinished judgment");
  expect(screen.getByRole("button", { name: "Save recommendation" })).toBeEnabled();
});

it("shows the assessment and its historical basis", async () => {
  const workspace = await renderApplication();
  const assessment = screen.getByRole("article", { name: "Assessment by Sam Morgan" });

  const expectAssessment = (article: HTMLElement) => {
    const view = within(article);

    expect(view.getByText("Recommends funding", { exact: true })).toBeVisible();
    expect(view.getByText("€18,000 proposed", { exact: true })).toBeVisible();
    expect(view.getByText("The original venue makes the budget credible.")).toBeVisible();
    expect(
      view.getByText("Application changed since this assessment", { exact: true }),
    ).toBeVisible();
  };

  expectAssessment(assessment);
  await workspace.user.click(within(assessment).getByText("Review details"));
  const details = within(screen.getByRole("dialog", { name: "Review details" }));

  expect(details.getByText("Submission", { exact: true })).toBeVisible();
  expect(details.getByText("Version 1", { exact: true })).toBeVisible();

  await workspace.user.keyboard("{Escape}");

  expect(
    within(assessment).getByRole("button", { name: "Assessment actions for Sam Morgan" }),
  ).toBeVisible();
});
