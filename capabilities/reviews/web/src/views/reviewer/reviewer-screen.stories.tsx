import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { within } from "storybook/test";

import type { ReviewerPage } from "@merit/reviews/api";

import type { ReviewerSession } from "../../controllers/reviewer/use-reviewer";
import { ReviewerScreen } from "./reviewer-screen";
import {
  ReviewPreviewFrame,
  reviewerPage,
  reviewerTransport,
  submittedPage,
  type SaveScenario,
} from "./reviewer.story-fixtures.tsx";

const ReviewerPreview = ({
  initial,
  scenario,
  session,
  reference = "material",
}: {
  initial: ReviewerPage;
  scenario: SaveScenario;
  session?: ReviewerSession;
  reference?: "material" | "criteria";
}) => {
  const [data] = useState(() => reviewerTransport(initial, scenario));
  return (
    <ReviewPreviewFrame>
      <ReviewerScreen initial={initial} data={data} session={session} reference={reference} />
    </ReviewPreviewFrame>
  );
};

const meta = {
  title: "Features/Applications/Participate in review",
  component: ReviewerPreview,
  tags: ["!autodocs"],
  parameters: { layout: "fullscreen" },
  args: { initial: reviewerPage(), scenario: "ordinary" },
  argTypes: {
    initial: { control: false },
    scenario: { control: false },
    session: { control: false },
    reference: { control: false },
  },
} satisfies Meta<typeof ReviewerPreview>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Writing: Story = {};

const invitation = reviewerPage();
invitation.assignment = { ...invitation.assignment, status: "invited", dueDate: null };
invitation.material = null;
invitation.criteria = null;
invitation.draft = null;
export const Invitation: Story = { args: { initial: invitation } };

const longPage = reviewerPage();
longPage.assignment.applicationTitle =
  "Neighbour Table: accessible shared meals and practical support for residents across the neighbourhood";
longPage.assignment.managerName = "Dana Alexandra Reed, Community Partnerships and Participation";
longPage.assignment.materialChanged = true;
longPage.assignment.basisComparison.applicationVersion = "different";
longPage.criteria!.push({
  id: "c21dce51-35aa-5293-bd64-f2b7a8234f11",
  title: "Additional context",
});
longPage.material!.submission!.answers[0]!.response = `${longPage.material!.submission!.answers[0]!.response}\n\n${"Participants can attend without booking. Volunteer hosts arrange accessible transport and translated information. ".repeat(8)}`;
longPage.draft!.content.observations = [
  {
    criterionId: null,
    criterion: longPage.criteria![0]!.title,
    text: "The application describes how people with different access needs can take part.",
  },
];
export const LongEvidence: Story = { args: { initial: longPage } };

const incomplete = reviewerPage();
incomplete.draft = {
  ...incomplete.draft!,
  content: { ...incomplete.draft!.content, reasoning: "" },
};
export const Validation: Story = {
  args: { initial: incomplete, session: { attempted: true } },
};

export const Saving: Story = { args: { session: { busy: true } } };

const kept = reviewerPage();
const keptReasoning = `${kept.draft!.content.reasoning} Keep this unsaved sentence.`;
export const SaveFailure: Story = {
  args: {
    session: {
      draft: { ...kept.draft!.content, reasoning: keptReasoning },
      error: "unavailable",
    },
  },
};

const savedElsewhere = reviewerPage();
savedElsewhere.draft = {
  revision: 2,
  content: {
    ...savedElsewhere.draft!.content,
    reasoning:
      "Saved on my other device: confirm the attendance evidence before recommending funding.",
  },
};
export const ConcurrentChanges: Story = {
  args: {
    session: {
      draft: {
        ...reviewerPage().draft!.content,
        reasoning: `${reviewerPage().draft!.content.reasoning} Keep my local interpretation.`,
      },
      conflict: savedElsewhere,
    },
  },
};

export const CriteriaReference: Story = { args: { reference: "criteria" } };

export const ReportConflict: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "More actions" }));
    await userEvent.click(
      await within(canvasElement.ownerDocument.body).findByRole("menuitem", {
        name: "Report a possible conflict",
      }),
    );
    await within(canvasElement.ownerDocument.body).findByRole("dialog", {
      name: "Report a possible conflict",
    });
  },
};

export const Withdraw: Story = {
  play: async ({ canvas, userEvent, canvasElement }) => {
    await userEvent.click(canvas.getByRole("button", { name: "More actions" }));
    await userEvent.click(
      await within(canvasElement.ownerDocument.body).findByRole("menuitem", {
        name: "Withdraw from review",
      }),
    );
    await within(canvasElement.ownerDocument.body).findByRole("dialog", {
      name: "Withdraw from this review?",
    });
  },
};

export const Submitted: Story = { args: { initial: submittedPage() } };

export const Amendment: Story = {
  args: { initial: submittedPage(), session: { amending: true } },
};

const unfinishedAmendment = submittedPage();
unfinishedAmendment.draft!.content = {
  ...unfinishedAmendment.draft!.content,
  reasoning: "Unfinished amendment: the venue is confirmed.",
  note: "Venue confirmation arrived.",
};
export const ResumeAmendment: Story = { args: { initial: unfinishedAmendment } };

export const AccessEnded: Story = {
  args: {
    initial: { ...invitation, assignment: { ...invitation.assignment, status: "cancelled" } },
  },
};

const revoked = reviewerPage();
const unsent = `${revoked.draft!.content.reasoning} This writing has not reached the server.`;
revoked.assignment = { ...revoked.assignment, status: "cancelled" };
revoked.material = null;
revoked.criteria = null;
export const RevokedWhileWriting: Story = {
  args: {
    initial: revoked,
    session: {
      draft: { ...revoked.draft!.content, reasoning: unsent },
      error: "accessLost",
    },
  },
};

export const ExpiredInvitation: Story = {
  args: {
    initial: {
      ...invitation,
      assignment: { ...invitation.assignment, expiresAt: "2020-01-01T00:00:00Z" },
    },
  },
};
