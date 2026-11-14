import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vite-plus/test";

import { roundView, applicationView } from "@merit/grantmaking/api";
import {
  makeApplication,
  makeAssessment,
  makeReviewRequest,
  makeReviewedApplication,
  makeRound,
} from "@merit/grantmaking/testing/fixtures";
import { fromMinorUnits } from "@merit/money";
import { createQueryClient } from "@merit/query";
import { reviewRevisionSchema } from "@merit/reviews/domain";

import { GrantmakingMessagesProvider } from "../../messages";
import { GrantmakingDrafts } from "../drafts";
import { ApplicationView } from "./application-view";

const round = roundView(makeRound({ manager: "Dana Reed" }));
const application = applicationView(
  makeApplication({
    version: 2,
    summary: "Staff interpretation, separate from submitted material.",
    evidence: [{ version: 1, passage: "Earlier evidence excerpt." }],
    submission: {
      version: 2,
      organization: "Saturday Repair Collective",
      answers: [
        {
          questionId: "0c624d85-b955-5e5f-a53e-f124c33b7c1b",
          question: "Project overview",
          response: "Repair workshops for neighbours.",
        },
        {
          questionId: "493e7f78-cc8a-5786-878f-c389c48d1d85",
          question: "Submitted budget breakdown (EUR)",
          response: "Materials: €22,000",
        },
      ],
    },
    managerRecommendation: {
      position: "Defer",
      allocation: fromMinorUnits(0n),
      reasoning: "Await the revised assessment.",
      recorded: { date: "2027-01-18", applicationVersion: 2 },
    },
    reviews: {
      revision: 2,
      requests: [
        makeReviewRequest({
          id: "pending",
          contactId: "jules",
          reviewer: "Jules Patel",
          applicationVersion: 2,
        }),
      ],
      assessments: [
        makeAssessment({
          reviewer: "Sam Morgan",
          versions: [
            {
              content: {
                applicationVersion: 1,
                criteriaVersion: 1,
                date: "2027-01-14",
                position: "Fund",
                amount: "18000",
                reasoning: "Local benefit.",
                observations: [],
              },
              criteria: [],
              recorder: null,
              note: "",
            },
          ],
        }),
      ],
    },
  }),
);

const workspace = () =>
  within(screen.getByRole("complementary", { name: "Application workspace" }));

describe("application workspace", () => {
  it("opens the submission, separate staff summary and review overview together", () => {
    render(
      <ApplicationView
        round={round}
        application={application}
        recommendationAction={<button>Edit recommendation</button>}
      />,
      { wrapper: GrantmakingMessagesProvider },
    );

    expect(screen.getByRole("heading", { name: "Applicant submission" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Project overview" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Submitted budget breakdown (EUR)" })).toBeVisible();
    expect(
      within(screen.getByRole("region", { name: "Staff summary" })).getByText(application.summary),
    ).toBeVisible();
    expect(workspace().getByRole("heading", { name: "Application details" })).toBeVisible();
    expect(workspace().getByText("Saturday Repair Collective")).toBeVisible();
    expect(workspace().getByText("1 outdated review, 1 awaiting review")).toBeVisible();

    const recommendation = within(
      workspace().getByRole("region", { name: "Manager recommendation" }),
    );

    expect(recommendation.getByText("Dana Reed")).toBeVisible();
    expect(recommendation.getByRole("button", { name: "Edit recommendation" })).toBeVisible();
    expect(recommendation.getByText("Defer", { exact: true })).toBeVisible();
    expect(recommendation.getByText("18 January 2027")).toBeVisible();
    expect(recommendation.queryByText("€0")).not.toBeInTheDocument();
    expect(screen.queryByRole("article", { name: /Assessment by/ })).not.toBeInTheDocument();
  });

  it("opens one full assessment beside the submission and returns to the overview", async () => {
    const user = userEvent.setup();
    render(<ApplicationView round={round} application={application} />, {
      wrapper: GrantmakingMessagesProvider,
    });
    await user.click(workspace().getByRole("button", { name: /Sam Morgan/ }));
    const assessment = within(
      workspace().getByRole("article", { name: "Assessment by Sam Morgan" }),
    );

    expect(workspace().getByRole("heading", { name: "Assessment" })).toHaveFocus();
    expect(assessment.getByText("Recommends funding", { exact: true })).toBeVisible();
    expect(assessment.getByText("€18,000 proposed")).toBeVisible();
    expect(assessment.getByText("14 January 2027", { exact: true })).toBeVisible();
    expect(
      assessment.getByText("Application changed since this assessment", { exact: true }),
    ).toBeVisible();
    expect(workspace().queryByText("Jules Patel")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Project overview" })).toBeVisible();

    await user.click(assessment.getByText("Review details"));
    const details = within(screen.getByRole("dialog", { name: "Review details" }));

    expect(details.getByText("Submission", { exact: true })).toBeVisible();
    expect(details.getByText("Version 1", { exact: true })).toBeVisible();

    await user.keyboard("{Escape}");
    await user.click(workspace().getByRole("button", { name: "Back to overview" }));

    expect(workspace().getByRole("region", { name: "Manager recommendation" })).toBeVisible();
    await waitFor(() =>
      expect(workspace().getByRole("button", { name: /Sam Morgan/ })).toHaveFocus(),
    );
  });

  it("preserves the selected review through editing and restores its heading when editing closes", async () => {
    const user = userEvent.setup();
    const props = { round, application };
    const view = render(<ApplicationView {...props} />, {
      wrapper: GrantmakingMessagesProvider,
    });
    await user.click(workspace().getByRole("button", { name: /Sam Morgan/ }));
    const editor = <input aria-label="Recommendation draft" />;
    view.rerender(<ApplicationView {...props} editor={editor} />);
    const input = screen.getByRole("textbox", { name: "Recommendation draft" });
    await user.type(input, "Keep this reasoning");
    view.rerender(<ApplicationView {...props} editor={editor} tab="reviews" />);

    expect(input).toHaveFocus();
    expect(input).toHaveValue("Keep this reasoning");
    expect(workspace().queryByRole("article", { name: /Assessment by/ })).not.toBeInTheDocument();

    view.rerender(<ApplicationView {...props} tab="reviews" />);

    expect(workspace().getByRole("article", { name: "Assessment by Sam Morgan" })).toBeVisible();
    expect(workspace().getByRole("heading", { name: "Assessment" })).toHaveFocus();
  });

  it("keeps pending requests distinct from a submitted funding judgment", async () => {
    const user = userEvent.setup();
    render(<ApplicationView round={round} application={application} />, {
      wrapper: GrantmakingMessagesProvider,
    });
    const choice = workspace().getByRole("button", { name: /Jules Patel/ });

    expect(choice).toHaveTextContent("Awaiting assessment");
    expect(choice).not.toHaveTextContent("Defer");
    expect(choice).not.toHaveTextContent("€0");

    await user.click(choice);
    const pending = within(workspace().getByRole("article", { name: "Jules Patel" }));

    expect(pending.getByText("Awaiting assessment")).toBeVisible();
    expect(pending.queryByText("No funding proposed")).not.toBeInTheDocument();
    expect(pending.queryByText("Recommends deferral")).not.toBeInTheDocument();
    expect(workspace().queryByRole("article", { name: /Assessment by/ })).not.toBeInTheDocument();
  });

  it("opens all reviews in the reference pane while retaining the overview", async () => {
    const user = userEvent.setup();
    const conditional = applicationView(
      makeApplication({
        submission: {
          version: 1,
          answers: [
            {
              questionId: "0c624d85-b955-5e5f-a53e-f124c33b7c1b",
              question: "Project overview",
              response: "Community transport.",
            },
          ],
        },
        managerRecommendation: {
          position: "Fund with a condition",
          allocation: fromMinorUnits(2800000n),
          reasoning: "Confirm the provider.",
        },
        reviews: {
          revision: 2,
          requests: [],
          assessments: [
            makeAssessment({
              reviewer: "Sam Morgan",
              versions: [
                {
                  content: {
                    applicationVersion: 1,
                    criteriaVersion: 1,
                    date: null,
                    position: "Fund with a condition",
                    amount: "28000",
                    reasoning: "Confirm delivery.",
                    observations: [],
                  },
                  criteria: [],
                  recorder: null,
                  note: "",
                },
              ],
            }),
            makeAssessment({
              id: "second",
              contactId: "jules",
              reviewer: "Jules Patel",
              versions: [
                {
                  content: {
                    applicationVersion: 1,
                    criteriaVersion: 1,
                    date: null,
                    position: "Defer",
                    amount: "0",
                    reasoning: "Await confirmation.",
                    observations: [],
                  },
                  criteria: [],
                  recorder: null,
                  note: "",
                },
              ],
            }),
          ],
        },
      }),
    );
    render(<ApplicationView round={round} application={conditional} />, {
      wrapper: GrantmakingMessagesProvider,
    });
    await user.click(workspace().getByRole("button", { name: "Manage reviews" }));
    const sam = within(screen.getByRole("article", { name: "Assessment by Sam Morgan" }));
    const jules = within(screen.getByRole("article", { name: "Assessment by Jules Patel" }));

    expect(sam.getByText("Recommends funding with a condition", { exact: true })).toBeVisible();
    expect(sam.getByText("€28,000 proposed", { exact: true })).toBeVisible();
    expect(jules.getByText("Recommends deferral", { exact: true })).toBeVisible();
    expect(jules.getByText("No funding proposed", { exact: true })).toBeVisible();

    const manager = within(workspace().getByRole("region", { name: "Manager recommendation" }));

    expect(manager.getByText("Fund with a condition")).toBeVisible();
    expect(manager.getByText("€28,000 proposed")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Back to application" }));

    expect(screen.getByRole("heading", { name: "Project overview" })).toBeVisible();
    expect(screen.queryByRole("article", { name: /Assessment by/ })).not.toBeInTheDocument();
  });

  it("retains unknown review material and criteria in the preview and selected assessment", async () => {
    const user = userEvent.setup();
    const unknown = roundView({
      ...round,
      applications: [
        {
          ...application,
          reviews: {
            ...application.reviews,
            assessments: application.reviews.assessments.map((record) => ({
              ...record,
              versions: record.versions.map((version) => ({
                ...version,
                criteria: null,
                content: { ...version.content, applicationVersion: null, criteriaVersion: null },
              })),
            })),
          },
        },
      ],
    }).applications[0]!;
    render(<ApplicationView round={round} application={unknown} />, {
      wrapper: GrantmakingMessagesProvider,
    });
    const choice = workspace().getByRole("button", { name: /Sam Morgan/ });

    expect(choice).toHaveTextContent("Application reviewed not known");
    expect(choice).toHaveTextContent("Criteria used not known");

    await user.click(choice);
    const assessment = within(
      workspace().getByRole("article", { name: "Assessment by Sam Morgan" }),
    );

    expect(assessment.getByText("Review basis unknown")).toBeVisible();

    await user.click(assessment.getByText("Review details"));
    const details = within(screen.getByRole("dialog", { name: "Review details" }));
    const submission = details.getByText("Submission", { exact: true });

    expect(submission.nextElementSibling).toHaveTextContent("Not known");

    const criteria = details.getByRole("heading", { name: "Criteria reviewed" }).parentElement!;

    expect(within(criteria).getByText("Not known", { exact: true })).toBeVisible();
  });

  it("does not turn a staff summary into unavailable submitted answers", () => {
    render(
      <ApplicationView round={round} application={{ ...application, submission: undefined }} />,
      { wrapper: GrantmakingMessagesProvider },
    );

    expect(screen.getByText("The submitted application is not available here yet.")).toBeVisible();
    expect(
      within(screen.getByRole("region", { name: "Staff summary" })).getByText(application.summary),
    ).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Project overview" })).not.toBeInTheDocument();
    expect(screen.queryByText(application.evidence[0]!.passage)).not.toBeInTheDocument();
  });

  it("distinguishes current reviews, unassigned reviews and an unwritten recommendation", async () => {
    const user = userEvent.setup();
    const current = applicationView(
      makeReviewedApplication(),
      round.criteria,
      round.criteriaVersion,
    );
    const view = render(<ApplicationView round={round} application={current} />, {
      wrapper: GrantmakingMessagesProvider,
    });

    expect(workspace().getByText("2 current reviews")).toBeVisible();

    view.rerender(
      <ApplicationView
        round={round}
        application={{
          ...current,
          managerRecommendation: null,
          assessments: [],
          reviews: { revision: reviewRevisionSchema.parse(0), assessments: [], requests: [] },
        }}
      />,
    );

    expect(workspace().getByText("No reviewers assigned.")).toBeVisible();

    const recommendation = within(
      workspace().getByRole("region", { name: "Manager recommendation" }),
    );

    expect(recommendation.getByText("Not yet recommended")).toBeVisible();
    expect(recommendation.queryByText("Defer")).not.toBeInTheDocument();

    await user.click(workspace().getByRole("button", { name: "Manage reviews" }));

    expect(screen.getByText("No assessments or review requests yet.")).toBeVisible();
  });

  it("places the recommendation action after reviews during preparation without an existing judgment", () => {
    render(
      <ApplicationView
        round={round}
        application={{
          ...application,
          intakeStatus: "in_preparation",
          managerRecommendation: null,
        }}
        recommendationAction={<button>Write recommendation</button>}
      />,
      { wrapper: GrantmakingMessagesProvider },
    );
    const review = workspace().getByRole("button", { name: /Sam Morgan/ });
    const action = workspace().getByRole("button", { name: "Write recommendation" });

    expect(action).toBeVisible();
    expect(
      workspace().queryByRole("region", { name: "Manager recommendation" }),
    ).not.toBeInTheDocument();
    expect(review.compareDocumentPosition(action) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it.each(["in_preparation", "ready"] as const)(
    "keeps read-only assessment inspection available without edit actions while %s",
    async (intakeStatus) => {
      const user = userEvent.setup();
      render(
        <ApplicationView
          round={round}
          application={{
            ...application,
            intakeStatus,
            managerRecommendation:
              intakeStatus === "in_preparation" ? null : application.managerRecommendation,
          }}
          readOnly
          recommendationAction={<button>Edit recommendation</button>}
        />,
        { wrapper: GrantmakingMessagesProvider },
      );

      expect(screen.queryByRole("button", { name: "Edit recommendation" })).not.toBeInTheDocument();

      await user.click(workspace().getByRole("button", { name: /Sam Morgan/ }));

      expect(workspace().getByRole("article", { name: "Assessment by Sam Morgan" })).toBeVisible();
      expect(screen.queryByRole("button", { name: /Assessment actions/ })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Record assessment" })).not.toBeInTheDocument();
    },
  );

  it("keeps a withdrawn application's reviews and recommendation readable without offering work", async () => {
    const user = userEvent.setup();
    const reviewData: ComponentProps<typeof ApplicationView>["reviewData"] = {
      draftKey: "withdrawn-application",
      workspaceSlug: "alder",
      save: vi.fn(),
      refresh: vi.fn(),
    };
    const props = {
      round,
      reviewData,
      recommendationAction: <button>Edit recommendation</button>,
    };
    const view = render(
      <QueryClientProvider client={createQueryClient()}>
        <GrantmakingDrafts>
          <ApplicationView {...props} application={application} />
        </GrantmakingDrafts>
      </QueryClientProvider>,
      { wrapper: GrantmakingMessagesProvider },
    );
    expect(screen.getByRole("button", { name: "Edit recommendation" })).toBeVisible();
    await user.click(workspace().getByRole("button", { name: "Manage reviews" }));
    expect(screen.getByRole("button", { name: "Add review request" })).toBeVisible();
    view.unmount();

    render(
      <QueryClientProvider client={createQueryClient()}>
        <GrantmakingDrafts>
          <ApplicationView
            {...props}
            application={{
              ...application,
              withdrawal: {
                withdrawnOn: "2027-01-10",
                reason: "The applicant withdrew.",
                recorder: { userId: "dana", name: "Dana Reed", recordedAt: "2027-01-11T09:00:00Z" },
              },
            }}
          />
        </GrantmakingDrafts>
      </QueryClientProvider>,
      { wrapper: GrantmakingMessagesProvider },
    );

    expect(screen.queryByRole("button", { name: "Edit recommendation" })).not.toBeInTheDocument();
    await user.click(workspace().getByRole("button", { name: "Manage reviews" }));
    expect(screen.queryByRole("button", { name: "Add review request" })).not.toBeInTheDocument();
    expect(workspace().getByRole("region", { name: "Manager recommendation" })).toBeVisible();
    expect(workspace().getByText("Await the revised assessment.")).toBeVisible();
    await user.click(workspace().getByRole("button", { name: /Sam Morgan/ }));
    expect(workspace().getByRole("article", { name: "Assessment by Sam Morgan" })).toBeVisible();
    expect(screen.queryByRole("button", { name: /Assessment actions/ })).not.toBeInTheDocument();
  });

  it("preserves the mounted recommendation editor and its draft while changing reference views", async () => {
    const user = userEvent.setup();
    render(
      <ApplicationView
        round={round}
        application={application}
        editor={<input aria-label="Recommendation draft" defaultValue="" />}
      />,
      { wrapper: GrantmakingMessagesProvider },
    );
    const editor = screen.getByRole("textbox", { name: "Recommendation draft" });
    await user.type(editor, "Keep this reasoning");

    for (const name of [
      "Reviewer assessments",
      "Application details",
      "Version history",
      "Applicant submission",
    ]) {
      await user.click(screen.getByRole("button", { name: /^Reference material:/ }));
      await user.click(screen.getByRole("menuitem", { name }));

      expect(screen.getByRole("button", { name: `Reference material: ${name}` })).toBeVisible();
      expect(screen.getByRole("textbox", { name: "Recommendation draft" })).toBe(editor);
      expect(editor).toHaveValue("Keep this reasoning");
      expect(screen.queryByRole("button", { name: "Back to application" })).not.toBeInTheDocument();
    }

    expect(screen.getByRole("heading", { name: "Project overview" })).toBeVisible();
  });

  it("keeps the newer reference choice when an earlier URL change finishes", async () => {
    const user = userEvent.setup();
    const props = { round, application, onTabChange: () => {} };
    const view = render(<ApplicationView {...props} tab="reviews" />, {
      wrapper: GrantmakingMessagesProvider,
    });
    await user.click(screen.getByRole("button", { name: "Back to application" }));
    await user.click(screen.getByRole("button", { name: "View version history" }));
    view.rerender(<ApplicationView {...props} tab="evidence" />);

    expect(screen.getByRole("region", { name: "Version history" })).toBeVisible();

    // An independent navigation still selects the requested view.
    view.rerender(<ApplicationView {...props} tab="reviews" />);

    expect(screen.getByRole("region", { name: "Reviewer assessments" })).toBeVisible();
  });

  it("reports missing historical material explicitly, including the selected review's exact basis", async () => {
    const user = userEvent.setup();
    render(<ApplicationView round={round} application={application} />, {
      wrapper: GrantmakingMessagesProvider,
    });
    await user.click(screen.getByRole("button", { name: "View version history" }));

    expect(
      screen.getByText("An earlier submission is not available for comparison."),
    ).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Back to application" }));
    await user.click(workspace().getByRole("button", { name: /Sam Morgan/ }));
    await user.click(workspace().getByRole("button", { name: "View version history" }));

    expect(
      screen.getByText(
        "Version 1 is not available for comparison. Choose another recorded version.",
      ),
    ).toBeVisible();
    expect(workspace().getByRole("article", { name: "Assessment by Sam Morgan" })).toBeVisible();
  });
});

it("restores each reference position on external tab changes without requesting another URL change", async () => {
  const user = userEvent.setup();
  const requested: string[] = [];
  const props = { round, application, onTabChange: (tab: string) => requested.push(tab) };
  const view = render(<ApplicationView {...props} tab="reviews" />, {
    wrapper: GrantmakingMessagesProvider,
  });
  const reference = screen.getByRole("group", { name: "Reference" });
  reference.scrollTop = 250;
  await user.click(screen.getByRole("button", { name: "Back to application" }));
  await waitFor(() => expect(reference.scrollTop).toBe(0));
  view.rerender(<ApplicationView {...props} tab="evidence" />);
  reference.scrollTop = 100;

  view.rerender(<ApplicationView {...props} tab="reviews" />);
  await waitFor(() => expect(reference.scrollTop).toBe(250));
  expect(reference).toHaveFocus();
  view.rerender(<ApplicationView {...props} tab="evidence" />);
  await waitFor(() => expect(reference.scrollTop).toBe(100));
  expect(requested).toEqual(["evidence"]);
});
