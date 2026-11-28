import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { expect, it, vi } from "vite-plus/test";

import type { ApplicationData } from "@merit/grantmaking-web/contracts/pages";
import { GrantmakingDrafts } from "@merit/grantmaking-web/drafts";
import { applicationView, roundView } from "@merit/grantmaking/api";
import { makeReviewedApplication, makeRound } from "@merit/grantmaking/testing/fixtures";
import { fromMinorUnits } from "@merit/money";
import { createQueryClient } from "@merit/query";
import { reviewRevisionSchema } from "@merit/reviews/domain";

import { WebMessagesProvider } from "../../app/messages";
import { ApplicationWork } from "./application-work";

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));

const round = roundView(makeRound());

const dataFor = (id: string): ApplicationData => ({
  round,
  application: applicationView({ ...makeReviewedApplication(), id, title: `Project ${id}` }),
  key: id,
  recommendation: { revision: 0, save: vi.fn() },
  decision: { revision: 0, versions: [], save: vi.fn() },
  intake: null,
  reviews: null,
});

const wrapper = ({ children }: { children: ReactNode }) => (
  <WebMessagesProvider>
    <GrantmakingDrafts>{children}</GrantmakingDrafts>
  </WebMessagesProvider>
);

const view = (data: ApplicationData) => (
  <ApplicationWork
    data={data}
    roundLocation={{
      to: "/app/$workspaceSlug/rounds/$roundRef",
      params: { workspaceSlug: "alder", roundRef: "round-k7m2p9x4n6rt" },
    }}
    onTabChange={vi.fn()}
  />
);

it("shows application evidence without initializing unavailable intake or review editors", () => {
  render(view(dataFor("first")), { wrapper });

  expect(screen.getByRole("heading", { name: "Project first" })).toBeVisible();
  expect(screen.getByRole("region", { name: "Applicant submission" })).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "Edit application details" }),
  ).not.toBeInTheDocument();
});

it("resets active editing when the record changes while retaining each record's recommendation draft", async () => {
  const user = userEvent.setup();
  const first = dataFor("first");
  const second = dataFor("second");
  const { rerender } = render(view(first), { wrapper });
  await user.click(
    screen.getByRole("button", { name: `Edit recommendation for ${first.application.title}` }),
  );
  await user.clear(screen.getByLabelText(/Reasoning/));
  await user.type(screen.getByLabelText(/Reasoning/), "Writing for the first application");

  rerender(view(second));

  expect(screen.queryByRole("form")).not.toBeInTheDocument();

  await user.click(
    screen.getByRole("button", { name: `Edit recommendation for ${second.application.title}` }),
  );

  expect(screen.getByLabelText(/Reasoning/)).toHaveValue(
    second.application.managerRecommendation!.reasoning,
  );

  await user.clear(screen.getByLabelText(/Reasoning/));
  await user.type(screen.getByLabelText(/Reasoning/), "Writing for the second application");

  rerender(view(first));

  expect(screen.queryByRole("form")).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: /Resume editing recommendation/ }));

  expect(screen.getByLabelText(/Reasoning/)).toHaveValue("Writing for the first application");
  expect(first.recommendation.save).not.toHaveBeenCalled();
  expect(second.recommendation.save).not.toHaveBeenCalled();
});

it("closes active recommendation editing when intake access changes and retains its recoverable draft", async () => {
  const user = userEvent.setup();
  const data = dataFor("first");
  const editable: ApplicationData = {
    ...data,
    intake: {
      draftKey: data.key,
      workspaceSlug: "alder",
      publicId: "m7n2p9x4k6rt",
      state: { revision: 0, workingRevision: null, history: [] },
      save: vi.fn(),
      refresh: vi.fn(),
      refreshCurrent: vi.fn(),
    },
  };
  const client = createQueryClient();
  const { rerender } = render(view(editable), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>
        <WebMessagesProvider>
          <GrantmakingDrafts>{children}</GrantmakingDrafts>
        </WebMessagesProvider>
      </QueryClientProvider>
    ),
  });
  await user.click(
    screen.getByRole("button", { name: `Edit recommendation for ${data.application.title}` }),
  );
  await user.clear(screen.getByLabelText(/Reasoning/));
  await user.type(screen.getByLabelText(/Reasoning/), "Unfinished recommendation");
  rerender(view(data));

  expect(screen.queryByRole("form")).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: /Resume editing recommendation/ }));

  expect(screen.getByLabelText(/Reasoning/)).toHaveValue("Unfinished recommendation");
  expect(data.recommendation.save).not.toHaveBeenCalled();
});

it("shows the committee decision above the recommendation and opens its own editor", async () => {
  const user = userEvent.setup();
  const data = dataFor("first");
  render(view(data), { wrapper });

  const sections = screen
    .getAllByRole("heading", { level: 2 })
    .map((heading) => heading.textContent);
  expect(sections.indexOf("Committee decision")).toBeLessThan(
    sections.indexOf("Manager recommendation"),
  );
  expect(screen.getByText("No decision recorded")).toBeVisible();

  await user.click(
    screen.getByRole("button", { name: `Record decision for ${data.application.title}` }),
  );

  expect(screen.getByRole("form", { name: /Record decision for/ })).toBeVisible();
  expect(screen.queryByRole("textbox", { name: "Reasoning" })).not.toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: /Reason/ })).toBeVisible();
  expect(screen.getByRole("button", { name: "Close decision" })).toBeVisible();

  await user.click(screen.getByRole("button", { name: "Close decision" }));
  expect(screen.queryByRole("form")).not.toBeInTheDocument();
  expect(data.decision.save).not.toHaveBeenCalled();
});

it("keeps a withdrawn application's decision readable without an edit action", () => {
  const data = dataFor("first");
  const withdrawn: ApplicationData = {
    ...data,
    application: {
      ...data.application,
      withdrawal: {
        withdrawnOn: "2026-01-10",
        reason: "Withdrawn.",
        recorder: { userId: "dana", name: "Dana Reed", recordedAt: "2026-01-11T09:00:00Z" },
      },
    },
    decision: {
      ...data.decision,
      revision: 1,
      versions: [
        {
          revision: 1,
          decision: {
            outcome: "Decline",
            amount: fromMinorUnits(0n),
            conditions: "",
            reason: "Not eligible.",
            decidedBy: "Funding committee",
            decisionDate: "2026-01-09",
            recorder: { name: "Dana Reed", provenance: { interface: "web" } },
            recordedAt: "2026-01-09T10:00:00.000Z",
            applicationVersion: 1,
          },
        },
      ],
    },
  };
  render(view(withdrawn), { wrapper });

  expect(screen.getByText("Declined")).toBeVisible();
  expect(screen.getByText("Not eligible.")).toBeVisible();
  expect(screen.queryByRole("button", { name: /Change decision for/ })).not.toBeInTheDocument();
});

const intakeData = (data: ApplicationData, save: ReturnType<typeof vi.fn>): ApplicationData => ({
  ...data,
  intake: {
    draftKey: data.key,
    workspaceSlug: "alder",
    publicId: "m7n2p9x4k6rt",
    state: { revision: 0, workingRevision: null, history: [] },
    save,
    refresh: vi.fn(),
    refreshCurrent: vi.fn(),
  } as never,
});

const intakeWrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={createQueryClient()}>
    <WebMessagesProvider>
      <GrantmakingDrafts>{children}</GrantmakingDrafts>
    </WebMessagesProvider>
  </QueryClientProvider>
);

it("offers deletion only until the application has a committee decision", async () => {
  const user = userEvent.setup();
  const base = dataFor("first");
  const undecided = intakeData(
    {
      ...base,
      application: {
        ...base.application,
        intakeStatus: "in_preparation",
        managerRecommendation: null,
        reviews: {
          revision: reviewRevisionSchema.parse(0),
          requests: [],
          assessments: [],
        },
        assessments: [],
      },
    },
    vi.fn(),
  );
  const { unmount } = render(view(undecided), { wrapper: intakeWrapper });
  await user.click(await screen.findByRole("button", { name: "Application actions" }));
  expect(screen.getByRole("menuitem", { name: /Delete/ })).toBeVisible();
  unmount();

  const decided = intakeData(
    {
      ...undecided,
      application: undecided.application,
    },
    vi.fn(),
  );
  decided.intake!.state = {
    ...decided.intake!.state,
    decisions: { hasDecision: true, hasCommitment: false },
  };
  render(view(decided), { wrapper: intakeWrapper });
  await user.click(await screen.findByRole("button", { name: "Application actions" }));
  expect(screen.getByRole("menuitem", { name: /Withdraw/ })).toBeVisible();
  expect(screen.queryByRole("menuitem", { name: /Delete/ })).not.toBeInTheDocument();
});

it("explains why a funded application cannot be withdrawn", async () => {
  const user = userEvent.setup();
  const save = vi.fn(async () => ({ status: "invalid", error: "application_has_commitment" }));
  const base = dataFor("first");
  render(view(intakeData(base, save)), { wrapper: intakeWrapper });
  await user.click(await screen.findByRole("button", { name: "Application actions" }));
  await user.click(screen.getByRole("menuitem", { name: /Withdraw/ }));
  await user.type(screen.getByRole("textbox", { name: /Reason/ }), "The applicant withdrew.");
  const dialog = within(screen.getByRole("dialog", { name: /Withdraw application/ }));
  await user.click(dialog.getByRole("button", { name: "Withdraw application" }));

  await vi.waitFor(() => expect(save).toHaveBeenCalled());
  expect(await screen.findByText(/has committed funding/)).toBeVisible();
});
