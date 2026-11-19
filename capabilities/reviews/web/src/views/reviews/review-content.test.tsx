import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vite-plus/test";

import {
  makeApplication,
  makeAssessment,
  makeReviewRequest,
  makeRound,
} from "@merit/grantmaking/testing/fixtures";
import { criteriaVersionSchema } from "@merit/rounds/domain";

import { GrantmakingMessagesProvider } from "../../testing/providers";
import { ReviewContent as ReviewPresentation } from "./review-content";
import { ReviewWork } from "./review-work";
import { useReviewReading } from "./use-review-reading";

const ReviewContent = ({
  selectedId,
  ...props
}: Omit<ComponentProps<typeof ReviewPresentation>, "reading"> & { selectedId?: string }) => (
  <ReviewPresentation {...props} reading={useReviewReading(selectedId)} />
);

const round = makeRound();
const assessment = makeAssessment({ reviewer: "Sam Morgan" });
const request = makeReviewRequest({
  id: "d3ab8fdf-929e-5c8f-87df-4d6a2b5e79f7",
  contactId: "jules",
  reviewer: "Jules Patel",
  applicationVersion: 2,
});
const application = makeApplication({
  version: 2,
  reviews: { revision: 2, assessments: [assessment], requests: [request] },
});

const reviewedCriteria = [
  {
    id: "7bb21220-ecc6-5a1b-9eec-1a47e5e66bc4",
    title: "Local benefit",
    description: "Original guidance",
  },
];
const currentCriteria = [
  {
    id: "7bb21220-ecc6-5a1b-9eec-1a47e5e66bc4",
    title: "Local benefit",
    description: "Revised guidance",
  },
];

it.each([
  {
    name: "unknown",
    reviewed: null,
    current: currentCriteria,
    badge: "Criteria used not known",
    comparison: false,
  },
  {
    name: "unchanged",
    reviewed: reviewedCriteria,
    current: reviewedCriteria,
    badge: null,
    comparison: false,
  },
  {
    name: "changed",
    reviewed: reviewedCriteria,
    current: currentCriteria,
    badge: "Criteria changed since this assessment",
    comparison: true,
  },
  { name: "empty", reviewed: [], current: [], badge: null, comparison: false },
  {
    name: "restored in a later version",
    reviewed: reviewedCriteria,
    current: reviewedCriteria,
    badge: null,
    comparison: false,
  },
  {
    name: "added after review",
    reviewed: [],
    current: currentCriteria,
    badge: "Criteria changed since this assessment",
    comparison: true,
  },
  {
    name: "removed after review",
    reviewed: reviewedCriteria,
    current: [],
    badge: "Criteria changed since this assessment",
    comparison: true,
  },
])(
  "preserves $name criteria in the assessment and its details",
  async ({ reviewed, current, badge, comparison }) => {
    const version = assessment.versions[0]!;
    render(
      <ReviewContent
        application={{
          ...application,
          reviews: {
            ...application.reviews,
            assessments: [
              {
                ...assessment,
                versions: [
                  {
                    ...version,
                    content: { ...version.content, applicationVersion: application.version },
                    criteria: reviewed,
                  },
                ],
              },
            ],
          },
        }}
        round={{ ...round, criteria: current, criteriaVersion: criteriaVersionSchema.parse(3) }}
      />,
      { wrapper: GrantmakingMessagesProvider },
    );
    const article = within(screen.getByRole("article", { name: "Assessment by Sam Morgan" }));
    if (badge) {
      expect(article.getByText(badge)).toBeVisible();
    } else {
      expect(article.queryByText("Criteria changed since this assessment")).not.toBeInTheDocument();
      expect(article.queryByText("Criteria used not known")).not.toBeInTheDocument();
    }
    await userEvent.setup().click(article.getByRole("button", { name: "Review details" }));

    const details = within(screen.getByRole("region", { name: "Review details" }));
    expect(details.queryByText("Original guidance")).not.toBeInTheDocument();
    await userEvent.setup().click(details.getByRole("button", { name: "View criteria used" }));
    expect(screen.queryByRole("region", { name: "Review details" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Criteria reviewed" })).toHaveFocus();
    expect(screen.getByRole("heading", { name: "Sam Morgan" })).toBeVisible();
    const original = within(screen.getByRole("region", { name: "Criteria reviewed" }));
    if (reviewed === null) {
      expect(original.getByText("Not known")).toBeVisible();
    } else {
      expect(original.queryByText("Not known")).not.toBeInTheDocument();
      expect(original.queryAllByRole("term")).toHaveLength(reviewed.length);
      for (const criterion of reviewed) {
        expect(original.getByText(criterion.title)).toBeVisible();
        expect(original.getByText(criterion.description)).toBeVisible();
      }
    }
    if (comparison) {
      const latest = within(screen.getByRole("region", { name: "Current criteria" }));
      expect(latest.queryAllByRole("term")).toHaveLength(current.length);
      for (const criterion of current) {
        expect(latest.getByText(criterion.title)).toBeVisible();
        expect(latest.getByText(criterion.description)).toBeVisible();
      }
    } else {
      expect(screen.queryByRole("heading", { name: "Current criteria" })).not.toBeInTheDocument();
    }
    await userEvent.setup().click(screen.getByRole("button", { name: "Back to assessment" }));
    expect(screen.getByRole("button", { name: "View criteria used" })).toHaveFocus();
    await userEvent.setup().click(screen.getByRole("button", { name: "Back to assessments" }));
    expect(screen.getByRole("button", { name: "Review details" })).toHaveFocus();
  },
);

it("keeps unknown review facts explicit without inventing recording details or a history target", async () => {
  const version = assessment.versions[0]!;
  const inspect = vi.fn();
  render(
    <ReviewContent
      application={{
        ...application,
        reviews: {
          ...application.reviews,
          assessments: [
            {
              ...assessment,
              versions: [
                {
                  ...version,
                  content: { ...version.content, date: null, applicationVersion: null },
                  criteria: null,
                  recorder: null,
                },
              ],
            },
          ],
        },
      }}
      round={round}
      selectedId={assessment.id}
      onInspectVersion={inspect}
    />,
    { wrapper: GrantmakingMessagesProvider },
  );

  expect(screen.getByText("Review basis unknown")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Compare changes" })).not.toBeInTheDocument();
  const details = within(screen.getByRole("region", { name: "Review details" }));
  for (const label of ["Assessment date", "Recorded by", "Submission"]) {
    expect(details.getByText(label, { selector: "dt" }).nextElementSibling).toHaveTextContent(
      "Not known",
    );
  }
  expect(details.queryByText("Recorded on")).not.toBeInTheDocument();
  expect(details.queryByText("Via")).not.toBeInTheDocument();
  expect(inspect).not.toHaveBeenCalled();
});

it("shows the assessment date separately from recording time, attribution, and correction note", async () => {
  const version = assessment.versions[0]!;
  render(
    <ReviewContent
      application={{
        ...application,
        reviews: {
          ...application.reviews,
          assessments: [
            {
              ...assessment,
              versions: [
                {
                  ...version,
                  content: { ...version.content, date: "2027-01-15" },
                  recorder: {
                    userId: "dana",
                    name: "Dana Reed",
                    recordedAt: "2027-01-18T14:30:00Z",
                    provenance: { interface: "mcp", clientId: "grant-assistant" },
                  },
                  note: "Corrected the received transcription.",
                },
              ],
            },
          ],
        },
      }}
      round={round}
    />,
    { wrapper: GrantmakingMessagesProvider },
  );
  await userEvent.setup().click(screen.getByRole("button", { name: "Review details" }));

  const details = within(screen.getByRole("region", { name: "Review details" }));
  expect(details.getByText("15 January 2027")).toBeVisible();
  expect(details.getByText("18 Jan 2027, 14:30 UTC")).toHaveAttribute(
    "datetime",
    "2027-01-18T14:30:00Z",
  );
  expect(details.getByText("Dana Reed")).toBeVisible();
  expect(details.getByText(/grant-assistant/)).toBeVisible();
  expect(details.getByText("Corrected the received transcription.")).toBeVisible();
  expect(details.getAllByText("Version 1")).toHaveLength(2);
});

describe("selected review", () => {
  it("shows only the selected assessment and opens its actual application basis", async () => {
    const inspect = vi.fn();
    render(
      <ReviewWork
        application={application}
        round={round}
        selectedId={assessment.id}
        onInspectVersion={inspect}
      />,
      { wrapper: GrantmakingMessagesProvider },
    );

    expect(screen.getByRole("article", { name: "Assessment by Sam Morgan" })).toBeVisible();
    expect(screen.queryByText("Jules Patel")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /Reviewer assessments/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Request history/ })).not.toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole("button", { name: "Compare changes" }));

    expect(inspect).toHaveBeenCalledWith(1);

    expect(
      within(screen.getByRole("region", { name: "Review details" })).getAllByText("Version 1"),
    ).toHaveLength(2);
  });

  it("retains assessment history and record actions without showing global management actions", async () => {
    const previous = {
      ...assessment,
      id: "2640ee52-dba8-5810-8a0a-34767949fc39",
      versions: [
        {
          ...assessment.versions[0]!,
          criteria: reviewedCriteria,
          content: {
            ...assessment.versions[0]!.content,
            reasoning: "The earlier judgment remains available.",
          },
        },
      ],
    };
    const followUp = {
      ...assessment,
      previousId: previous.id,
      versions: [
        {
          ...assessment.versions[0]!,
          content: { ...assessment.versions[0]!.content, applicationVersion: application.version },
          criteria: currentCriteria,
        },
      ],
    };
    render(
      <ReviewContent
        application={{
          ...application,
          reviews: { ...application.reviews, assessments: [previous, followUp] },
        }}
        round={{ ...round, criteria: currentCriteria }}
        selectedId={assessment.id}
        headerActions={<button>Track a review</button>}
        assessmentActions={() => <button>Correct this assessment</button>}
      />,
      { wrapper: GrantmakingMessagesProvider },
    );

    expect(screen.getByRole("button", { name: "Correct this assessment" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Track a review" })).not.toBeInTheDocument();

    await userEvent.setup().click(screen.getByText("Earlier assessments and edits"));

    expect(screen.getByText("The earlier judgment remains available.")).toBeVisible();
    const details = within(screen.getByRole("region", { name: "Review details" }));
    expect(details.getAllByText("Version 1")).toHaveLength(2);
    await userEvent.setup().click(details.getByRole("button", { name: "View criteria used" }));
    expect(screen.getByText("Original guidance")).toBeVisible();
    expect(screen.getByText("Revised guidance")).toBeVisible();
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Back to assessment history" }));
    expect(screen.getByRole("button", { name: "View criteria used" })).toHaveFocus();
    expect(screen.getByText("The earlier judgment remains available.")).toBeVisible();
  });

  it("keeps a selected pending request and its actions distinct from submitted assessments", () => {
    render(
      <ReviewContent
        application={application}
        round={round}
        selectedId={request.id}
        requestActions={() => <button>Record requested assessment</button>}
      />,
      { wrapper: GrantmakingMessagesProvider },
    );
    const pending = within(screen.getByRole("article", { name: "Jules Patel" }));

    expect(pending.getByText("Awaiting assessment")).toBeVisible();
    expect(pending.getByText("Submission v2 · Criteria v1")).toBeVisible();
    expect(pending.getByRole("button", { name: "Record requested assessment" })).toBeVisible();
    expect(screen.queryByText("Sam Morgan")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Request history/ })).not.toBeInTheDocument();
  });

  it("reports a removed or superseded selection rather than silently showing another review", () => {
    render(<ReviewWork application={application} round={round} selectedId="removed" />, {
      wrapper: GrantmakingMessagesProvider,
    });

    expect(
      screen.getByText("This assessment or request is no longer in the current review list."),
    ).toBeVisible();
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
  });

  it("retains the full review list and request history without a selection", () => {
    render(<ReviewWork application={application} round={round} />, {
      wrapper: GrantmakingMessagesProvider,
    });

    expect(screen.getByRole("heading", { name: /Reviewer assessments/ })).toBeVisible();
    expect(screen.getByRole("article", { name: "Assessment by Sam Morgan" })).toBeVisible();
    expect(screen.getByRole("article", { name: "Jules Patel" })).toBeVisible();
    expect(screen.getByRole("button", { name: /Request history/ })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Compare changes" })).not.toBeInTheDocument();
  });
});

it("keeps request basis, actors, and event times readable in the history", async () => {
  render(
    <ReviewContent
      application={{
        ...application,
        reviews: {
          ...application.reviews,
          requests: [
            {
              ...request,
              status: "cancelled",
              recorder: { userId: "dana", name: "Dana Reed", recordedAt: "2027-01-16T10:00:00Z" },
              closedBy: { userId: "leah", name: "Leah Morris", recordedAt: "2027-01-18T14:30:00Z" },
            },
          ],
        },
      }}
      round={round}
    />,
    { wrapper: GrantmakingMessagesProvider },
  );
  await userEvent.setup().click(screen.getByRole("button", { name: /Request history/ }));

  expect(screen.getByText("Submission v2 · Criteria v1")).toBeVisible();
  expect(screen.getByText("Added by Dana Reed")).toBeVisible();
  expect(screen.getByText("Cancelled by Leah Morris")).toBeVisible();
  expect(screen.getByText("18 Jan 2027, 14:30 UTC")).toHaveAttribute(
    "datetime",
    "2027-01-18T14:30:00Z",
  );
});

it("separates a request closed by the application's withdrawal from a manager's cancellation", async () => {
  const closed = {
    ...request,
    status: "cancelled" as const,
    recorder: { userId: "dana", name: "Dana Reed", recordedAt: "2027-01-16T10:00:00Z" },
  };
  render(
    <ReviewContent
      application={{
        ...application,
        reviews: {
          ...application.reviews,
          requests: [
            {
              ...closed,
              id: "7ed5232e-64f2-5744-aefa-66d785234340",
              closedBy: {
                userId: "leah",
                name: "Leah Morris",
                recordedAt: "2027-01-18T14:30:00Z",
                cause: "application_withdrawn",
              },
            },
            {
              ...closed,
              id: "51844835-e5b5-59b1-b53a-5d3c3d22ff1a",
              contactId: "sam",
              reviewer: "Sam Reed",
              closedBy: { userId: "leah", name: "Leah Morris", recordedAt: "2027-01-17T09:00:00Z" },
            },
          ],
        },
      }}
      round={round}
    />,
    { wrapper: GrantmakingMessagesProvider },
  );
  await userEvent.setup().click(screen.getByRole("button", { name: /Request history/ }));

  const history = screen.getAllByRole("listitem");
  expect(within(history[0]!).getByText("Closed: application withdrawn")).toBeVisible();
  expect(
    within(history[0]!).getByText("Closed: application withdrawn, recorded by Leah Morris"),
  ).toBeVisible();
  expect(within(history[0]!).queryByText("Cancelled")).not.toBeInTheDocument();
  expect(within(history[1]!).getByText("Cancelled")).toBeVisible();
  expect(within(history[1]!).getByText("Cancelled by Leah Morris")).toBeVisible();
});
