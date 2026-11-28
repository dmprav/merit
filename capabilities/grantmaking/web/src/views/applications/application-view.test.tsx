import { QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { WorkingRevision } from "@merit/applications/domain";
import { ContactsProvider } from "@merit/contacts-web/provider";
import { roundView, applicationView } from "@merit/grantmaking/api";
import {
  makeApplication,
  makeAssessment,
  makeReviewRequest,
  makeReviewedApplication,
  makeRound,
} from "@merit/grantmaking/testing/fixtures";
import { fromMinorUnits, encodeMoney } from "@merit/money";
import { createQueryClient } from "@merit/query";
import { reviewRevisionSchema } from "@merit/reviews/domain";
import { Toasts } from "@merit/ui/toast";

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
          id: "d3ab8fdf-929e-5c8f-87df-4d6a2b5e79f7",
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
                amount: encodeMoney(fromMinorUnits(1800000n)),
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

const reference = () => within(screen.getByRole("group", { name: "Reference" }));

describe("application workspace", () => {
  const renderPdfIntake = (workingRevision: WorkingRevision | null = null) => {
    const pdf = {
      id: "71000000-0000-4000-8000-000000000002",
      filename: "Kitchen budget.pdf",
      byteLength: 3140,
    };
    const editable = {
      ...application,
      intakeStatus: workingRevision ? ("ready" as const) : ("in_preparation" as const),
      submission: { ...application.submission!, pdfs: [pdf] },
    };
    const data = {
      workspaceSlug: "alder",
      draftKey: "intake-with-pdfs",
      publicId: application.id,
      state: { revision: 1, workingRevision, history: [] },
      save: vi.fn(),
      refresh: vi.fn(),
      refreshCurrent: vi.fn(),
    };
    render(
      <QueryClientProvider client={createQueryClient()}>
        <ContactsProvider
          source={{
            scope: (slug) => [slug],
            read: async () => ({ status: "not_found" }),
            save: vi.fn(),
          }}
        >
          <GrantmakingDrafts storageScope="intake-with-pdfs">
            <ApplicationView
              application={editable}
              round={round}
              intake={{ data, onDeleted: vi.fn() }}
            />
          </GrantmakingDrafts>
        </ContactsProvider>
      </QueryClientProvider>,
      { wrapper: GrantmakingMessagesProvider },
    );
    return pdf;
  };

  it("keeps the published PDF open when editing metadata during a working revision", async () => {
    const user = userEvent.setup();
    const pdf = renderPdfIntake({
      kind: "revision",
      reason: "Remove the old file",
      content: {
        title: application.title,
        applicant: "Applicant",
        requested: "100",
        answers: [],
        pdfs: [],
      },
    });
    await user.click(screen.getByRole("button", { name: /^Reference material:/ }));
    await user.click(await screen.findByRole("menuitem", { name: pdf.filename }));
    const frame = screen.getByTitle(pdf.filename);
    await user.click(screen.getByRole("button", { name: "Edit application details" }));
    expect(await screen.findByRole("form", { name: "Edit application details" })).toBeVisible();
    expect(screen.getByTitle(pdf.filename)).toBe(frame);
    expect(frame).toBeVisible();
  });

  it("keeps unsaved submitted answers when a manager switches to a PDF", async () => {
    const user = userEvent.setup();
    const pdf = renderPdfIntake();
    await user.click(reference().getByRole("button", { name: "Edit applicant submission" }));
    const responses = await reference().findAllByRole("textbox", { name: "Applicant’s response" });
    const response = responses[0]!;
    await user.clear(response);
    await user.type(response, "Working on the budget.");
    await user.click(screen.getByRole("button", { name: /^Reference material:/ }));
    await user.click(await screen.findByRole("menuitem", { name: pdf.filename }));
    expect(screen.getByTitle(pdf.filename)).toHaveAttribute(
      "src",
      `/api/application-pdfs/alder?id=${pdf.id}&applicationId=${application.id}`,
    );
    expect(response).not.toBeVisible();
    await waitFor(() => expect(screen.getByRole("group", { name: "Reference" })).toHaveFocus());
    await user.click(screen.getByRole("button", { name: /^Reference material:/ }));
    await user.click(await screen.findByRole("menuitem", { name: "Applicant submission" }));
    expect(response).toBeVisible();
    expect(response).toHaveValue("Working on the budget.");
  });

  it("opens the requested review or full list when leaving a criteria inspection", async () => {
    const user = userEvent.setup();
    render(<ApplicationView round={round} application={application} />, {
      wrapper: GrantmakingMessagesProvider,
    });
    await user.click(workspace().getByRole("button", { name: /Sam Morgan/ }));
    await user.click(reference().getByRole("button", { name: "View criteria used" }));
    await user.click(workspace().getByRole("button", { name: /Jules Patel/ }));
    expect(reference().getByRole("article", { name: "Jules Patel" })).toBeVisible();
    expect(
      reference().queryByRole("heading", { name: "Criteria reviewed" }),
    ).not.toBeInTheDocument();
    await user.click(workspace().getByRole("button", { name: "All assessments" }));
    await user.click(reference().getByRole("button", { name: "Review details" }));
    await user.click(reference().getByRole("button", { name: "View criteria used" }));
    await user.click(workspace().getByRole("button", { name: "All assessments" }));
    expect(reference().getByRole("article", { name: "Assessment by Sam Morgan" })).toBeVisible();
    expect(reference().getByRole("article", { name: "Jules Patel" })).toBeVisible();
    expect(
      reference().queryByRole("heading", { name: "Criteria reviewed" }),
    ).not.toBeInTheDocument();
  });

  it("opens the manager recommendation's actual earlier submission basis", async () => {
    const user = userEvent.setup();
    render(
      <ApplicationView
        round={round}
        application={{
          ...application,
          managerRecommendation: {
            ...application.managerRecommendation!,
            recorded: { date: "2027-01-18", applicationVersion: 1 },
          },
        }}
      />,
      { wrapper: GrantmakingMessagesProvider },
    );
    const recommendation = within(
      workspace().getByRole("region", { name: "Manager recommendation" }),
    );
    const qualification = recommendation.getByText("Based on an earlier submission");
    expect(qualification).toBeVisible();
    expect(
      qualification.compareDocumentPosition(
        recommendation.getByText("Await the revised assessment."),
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    await user.click(recommendation.getByRole("button", { name: "Compare changes" }));
    expect(
      screen.getByRole("button", { name: "Reference material: Version history" }),
    ).toBeVisible();
    expect(
      screen.getByText(
        "Version 1 is not available for comparison. Choose another recorded version.",
      ),
    ).toBeVisible();
  });

  it("keeps an unknown recommendation basis explicit without inventing a comparison", () => {
    render(
      <ApplicationView
        round={round}
        application={{
          ...application,
          managerRecommendation: { ...application.managerRecommendation!, recorded: undefined },
        }}
      />,
      { wrapper: GrantmakingMessagesProvider },
    );
    const recommendation = within(
      workspace().getByRole("region", { name: "Manager recommendation" }),
    );
    expect(recommendation.getByText("Submission basis not known")).toBeVisible();
    expect(
      recommendation.queryByRole("button", { name: "Compare changes" }),
    ).not.toBeInTheDocument();
  });

  it("returns from criteria to the same assessment and reading position beside an open draft", async () => {
    const user = userEvent.setup();
    render(
      <ApplicationView
        round={round}
        application={application}
        tab="reviews"
        editor={<input aria-label="Recommendation draft" />}
      />,
      { wrapper: GrantmakingMessagesProvider },
    );
    const writing = workspace().getByRole("textbox", { name: "Recommendation draft" });
    await user.type(writing, "Keep this reasoning");
    const viewport = screen.getByRole("group", { name: "Reference" });
    viewport.scrollTop = 240;
    await user.click(reference().getByRole("button", { name: "Review details" }));
    viewport.scrollTop = 160;
    await user.click(reference().getByRole("button", { name: "View criteria used" }));
    expect(reference().getByRole("heading", { name: "Criteria reviewed" })).toHaveFocus();
    expect(reference().queryByRole("article")).not.toBeInTheDocument();
    expect(workspace().getByRole("textbox", { name: "Recommendation draft" })).toBe(writing);
    expect(writing).toHaveValue("Keep this reasoning");
    viewport.scrollTop = 80;
    await user.click(reference().getByRole("button", { name: "Back to assessment" }));
    expect(reference().getByRole("button", { name: "View criteria used" })).toHaveFocus();
    expect(viewport.scrollTop).toBe(160);
    await user.click(reference().getByRole("button", { name: "Back to assessments" }));
    expect(reference().getByRole("button", { name: "Review details" })).toHaveFocus();
    expect(viewport.scrollTop).toBe(240);
  });

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

  it("opens an assessment in the reference pane and returns focus to its overview row", async () => {
    const user = userEvent.setup();
    render(<ApplicationView round={round} application={application} />, {
      wrapper: GrantmakingMessagesProvider,
    });
    await user.click(workspace().getByRole("button", { name: /Sam Morgan/ }));
    const assessment = within(
      reference().getByRole("article", { name: "Assessment by Sam Morgan" }),
    );

    await waitFor(() => expect(screen.getByRole("heading", { name: "Assessment" })).toHaveFocus());
    expect(assessment.getByText("Recommends funding", { exact: true })).toBeVisible();
    expect(assessment.getByText("€18,000 proposed")).toBeVisible();
    expect(assessment.getByText(/14 January 2027/)).toBeVisible();
    expect(assessment.getByText("Based on an earlier submission", { exact: true })).toBeVisible();
    expect(reference().queryByText("Jules Patel")).not.toBeInTheDocument();
    expect(workspace().getByRole("region", { name: "Manager recommendation" })).toBeVisible();

    const details = within(screen.getByRole("region", { name: "Review details" }));

    expect(details.getByText("Submission", { exact: true })).toBeVisible();
    expect(details.getAllByText("Version 1", { exact: true })).toHaveLength(2);

    await user.click(reference().getByRole("button", { name: "Back to assessments" }));

    expect(workspace().getByRole("region", { name: "Manager recommendation" })).toBeVisible();
    await waitFor(() =>
      expect(workspace().getByRole("button", { name: /Sam Morgan/ })).toHaveFocus(),
    );
  });

  it("preserves the selected review through editing without interrupting writing focus", async () => {
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
    expect(reference().getByRole("article", { name: "Assessment by Sam Morgan" })).toBeVisible();

    view.rerender(<ApplicationView {...props} tab="reviews" />);

    expect(reference().getByRole("article", { name: "Assessment by Sam Morgan" })).toBeVisible();
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
    const pending = within(reference().getByRole("article", { name: "Jules Patel" }));

    expect(pending.getByText("Awaiting assessment")).toBeVisible();
    expect(pending.queryByText("No funding proposed")).not.toBeInTheDocument();
    expect(pending.queryByText("Recommends deferral")).not.toBeInTheDocument();
    expect(reference().queryByRole("article", { name: /Assessment by/ })).not.toBeInTheDocument();
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
                    amount: encodeMoney(fromMinorUnits(2800000n)),
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
              id: "25b59b4e-1d9d-5105-84ea-3bd33a4ff1bf",
              contactId: "jules",
              reviewer: "Jules Patel",
              versions: [
                {
                  content: {
                    applicationVersion: 1,
                    criteriaVersion: 1,
                    date: null,
                    position: "Defer",
                    amount: encodeMoney(fromMinorUnits(0n)),
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
    await user.click(workspace().getByRole("button", { name: "All assessments" }));
    const sam = within(screen.getByRole("article", { name: "Assessment by Sam Morgan" }));
    const jules = within(screen.getByRole("article", { name: "Assessment by Jules Patel" }));

    expect(sam.getByText("Recommends funding with a condition", { exact: true })).toBeVisible();
    expect(sam.getByText("€28,000 proposed", { exact: true })).toBeVisible();
    expect(jules.getByText("Recommends deferral", { exact: true })).toBeVisible();
    expect(jules.getByText("No funding proposed", { exact: true })).toBeVisible();

    const manager = within(workspace().getByRole("region", { name: "Manager recommendation" }));

    expect(manager.getByText("Fund with a condition")).toBeVisible();
    expect(manager.getByText("€28,000 proposed")).toBeVisible();
    await waitFor(() => expect(screen.getByRole("group", { name: "Reference" })).toHaveFocus());

    await user.click(screen.getByRole("button", { name: /^Reference material:/ }));
    await user.click(screen.getByRole("menuitem", { name: "Applicant submission" }));

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
      reference().getByRole("article", { name: "Assessment by Sam Morgan" }),
    );

    expect(assessment.getByText("Review basis unknown")).toBeVisible();

    const details = within(screen.getByRole("region", { name: "Review details" }));
    const submission = details.getByText("Submission", { exact: true });

    expect(submission.nextElementSibling).toHaveTextContent("Not known");

    await user.click(details.getByRole("button", { name: "View criteria used" }));
    const criteria = screen.getByRole("region", { name: "Criteria reviewed" });

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

    await user.click(workspace().getByRole("button", { name: "All assessments" }));

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
      expect(screen.queryByText("Read only", { exact: true })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "More actions" })).not.toBeInTheDocument();

      await user.click(workspace().getByRole("button", { name: /Sam Morgan/ }));

      expect(reference().getByRole("article", { name: "Assessment by Sam Morgan" })).toBeVisible();
      expect(screen.queryByRole("button", { name: /Assessment actions/ })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Add" })).not.toBeInTheDocument();
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
    await user.click(workspace().getByRole("button", { name: "All assessments" }));
    expect(screen.getByRole("button", { name: "Add" })).toBeVisible();
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
    await user.click(workspace().getByRole("button", { name: "All assessments" }));
    expect(screen.queryByRole("button", { name: "Add" })).not.toBeInTheDocument();
    expect(workspace().getByRole("region", { name: "Manager recommendation" })).toBeVisible();
    expect(workspace().getByText("Await the revised assessment.")).toBeVisible();
    await user.click(workspace().getByRole("button", { name: /Sam Morgan/ }));
    expect(reference().getByRole("article", { name: "Assessment by Sam Morgan" })).toBeVisible();
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
      if (name === "Reviewer assessments") {
        const reviews = within(screen.getByRole("region", { name: "Reviewer assessments" }));
        const reference = screen.getByRole("group", { name: "Reference" });
        await act(async () => {
          await new Promise(requestAnimationFrame);
        });
        reference.scrollTop = 275;
        await user.click(reviews.getByRole("button", { name: "Review details" }));
        expect(reviews.getByRole("region", { name: "Review details" })).toBeVisible();
        expect(reviews.getByRole("heading", { name: "Review details" })).toHaveFocus();
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        expect(screen.getByRole("textbox", { name: "Recommendation draft" })).toBe(editor);
        reference.scrollTop = 0;
        await user.click(reviews.getByRole("button", { name: "Back to assessments" }));
        expect(reference.scrollTop).toBe(275);
        await waitFor(() =>
          expect(reviews.getByRole("button", { name: "Review details" })).toHaveFocus(),
        );
        await user.click(reviews.getByRole("button", { name: /Request history/ }));
        expect(reviews.getByRole("region", { name: "Request history" })).toBeVisible();
        expect(screen.getByRole("textbox", { name: "Recommendation draft" })).toBe(editor);
        expect(editor).toHaveValue("Keep this reasoning");
        await user.click(reviews.getByRole("button", { name: "Back to assessments" }));
      }
    }

    expect(screen.getByRole("heading", { name: "Project overview" })).toBeVisible();
  });

  it("keeps the newer reference choice when an earlier URL change finishes", async () => {
    const user = userEvent.setup();
    const props = { round, application, onTabChange: () => {} };
    const view = render(<ApplicationView {...props} tab="reviews" />, {
      wrapper: GrantmakingMessagesProvider,
    });
    await user.click(screen.getByRole("button", { name: /^Reference material:/ }));
    await user.click(screen.getByRole("menuitem", { name: "Applicant submission" }));
    await waitFor(() => expect(screen.getByRole("group", { name: "Reference" })).toHaveFocus());
    await user.click(screen.getByRole("button", { name: /^Reference material:/ }));
    await user.click(screen.getByRole("menuitem", { name: "Version history" }));
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
    await user.click(screen.getByRole("button", { name: /^Reference material:/ }));
    await user.click(screen.getByRole("menuitem", { name: "Version history" }));

    expect(
      screen.getByText("An earlier submission is not available for comparison."),
    ).toBeVisible();
    await waitFor(() => expect(screen.getByRole("group", { name: "Reference" })).toHaveFocus());

    await user.click(screen.getByRole("button", { name: /^Reference material:/ }));
    await user.click(screen.getByRole("menuitem", { name: "Applicant submission" }));
    await user.click(workspace().getByRole("button", { name: /Sam Morgan/ }));
    await user.click(reference().getByRole("button", { name: "Compare changes" }));

    expect(
      screen.getByText(
        "Version 1 is not available for comparison. Choose another recorded version.",
      ),
    ).toBeVisible();
    expect(
      reference().queryByRole("article", { name: "Assessment by Sam Morgan" }),
    ).not.toBeInTheDocument();
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
  await user.click(screen.getByRole("button", { name: /^Reference material:/ }));
  await user.click(screen.getByRole("menuitem", { name: "Applicant submission" }));
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

it("keeps one assessment form in the work pane while references change and resumes its preserved draft", async () => {
  const user = userEvent.setup();
  const data = {
    draftKey: "single-review-controller",
    workspaceSlug: "alder",
    save: vi.fn(),
    refresh: vi.fn(),
  };
  render(
    <QueryClientProvider client={createQueryClient()}>
      <GrantmakingDrafts storageScope="single-review-controller">
        <ApplicationView application={application} round={round} reviewData={data} tab="reviews" />
      </GrantmakingDrafts>
    </QueryClientProvider>,
    { wrapper: GrantmakingMessagesProvider },
  );
  await user.click(screen.getByRole("button", { name: "Assessment actions for Sam Morgan" }));
  await user.click(screen.getByRole("menuitem", { name: "Edit recorded assessment" }));
  const form = await workspace().findByRole("form", { name: "Edit recorded assessment" });
  const writing = within(form).getByRole("textbox", { name: "Assessment text" });
  await user.clear(writing);
  await user.type(writing, "A preserved assessment draft.");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  for (const label of ["Applicant submission", "Reviewer assessments", "Application details"]) {
    await user.click(screen.getByRole("button", { name: /^Reference material:/ }));
    await user.click(screen.getByRole("menuitem", { name: label }));
    expect(workspace().getByRole("form", { name: "Edit recorded assessment" })).toBe(form);
    expect(writing).toHaveValue("A preserved assessment draft.");
  }
  await act(async () => {
    await new Promise(requestAnimationFrame);
  });
  await user.click(within(form).getByRole("button", { name: "Close" }));
  const resume = workspace().getByRole("button", { name: "Resume editing" });
  await waitFor(() => expect(resume).toHaveFocus());
  await user.click(resume);
  expect(workspace().getByRole("textbox", { name: "Assessment text" })).toHaveValue(
    "A preserved assessment draft.",
  );
  await user.click(workspace().getByRole("button", { name: "Discard draft" }));
  expect(data.save).not.toHaveBeenCalled();
});

afterEach(() => vi.useRealTimers());

it("keeps saved-review refresh recovery visible when another reference is selected", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  const data = {
    draftKey: "review-refresh-recovery",
    workspaceSlug: "alder",
    save: vi.fn().mockResolvedValue({ status: "ok", revision: reviewRevisionSchema.parse(3) }),
    // The first read and both quiet retries fail before the failure is reported.
    refresh: vi
      .fn()
      .mockRejectedValueOnce(new Error("Offline"))
      .mockRejectedValueOnce(new Error("Offline"))
      .mockRejectedValueOnce(new Error("Offline"))
      .mockResolvedValue(undefined),
  };
  render(
    <QueryClientProvider client={createQueryClient()}>
      <GrantmakingDrafts storageScope="review-refresh-recovery">
        <ApplicationView application={application} round={round} reviewData={data} tab="reviews" />
      </GrantmakingDrafts>
      <Toasts />
    </QueryClientProvider>,
    { wrapper: GrantmakingMessagesProvider },
  );
  await user.click(screen.getByRole("button", { name: "Assessment actions for Sam Morgan" }));
  await user.click(screen.getByRole("menuitem", { name: "Edit recorded assessment" }));
  const form = await workspace().findByRole("form", { name: "Edit recorded assessment" });
  await user.type(within(form).getByRole("textbox", { name: "Assessment text" }), " Confirmed.");
  await user.click(screen.getByRole("button", { name: /^Reference material:/ }));
  await user.click(screen.getByRole("menuitem", { name: "Applicant submission" }));
  await user.click(within(form).getByRole("button", { name: "Save assessment" }));

  await waitFor(() => expect(form).not.toBeInTheDocument());
  await act(async () => {
    await vi.advanceTimersByTimeAsync(4000);
  });
  const recovery = await screen.findByRole("alertdialog", {
    name: "Saved, but the latest reviews could not be loaded.",
  });
  expect(
    screen.getByRole("button", { name: "Reference material: Applicant submission" }),
  ).toBeVisible();
  await user.click(within(recovery).getByRole("button", { name: "Refresh" }));

  await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  expect(data.refresh).toHaveBeenCalledTimes(4);
  expect(data.save).toHaveBeenCalledTimes(1);
});

it("keeps assessment reading available and disables authoring while a recommendation task is open", () => {
  render(
    <QueryClientProvider client={createQueryClient()}>
      <GrantmakingDrafts storageScope="recommendation-active">
        <ApplicationView
          application={application}
          round={round}
          tab="reviews"
          editor={<input aria-label="Recommendation draft" />}
          reviewData={{
            draftKey: "recommendation-active",
            workspaceSlug: "alder",
            save: vi.fn(),
            refresh: vi.fn(),
          }}
        />
      </GrantmakingDrafts>
    </QueryClientProvider>,
    { wrapper: GrantmakingMessagesProvider },
  );
  expect(reference().getByRole("article", { name: "Assessment by Sam Morgan" })).toBeVisible();
  expect(
    reference().getByRole("button", { name: "Assessment actions for Sam Morgan" }),
  ).toBeDisabled();
  expect(reference().getByRole("button", { name: /^Request actions for / })).toBeDisabled();
  expect(reference().getByRole("button", { name: "Review details" })).toBeEnabled();
  expect(workspace().getByRole("textbox", { name: "Recommendation draft" })).toBeVisible();
});
