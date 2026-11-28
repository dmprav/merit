import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type ComponentProps } from "react";
import { expect, within } from "storybook/test";

import { materialVersionSchema } from "@merit/applications/domain";
import {
  encodeApplicationDetail,
  encodeRoundOverview,
  decodeRoundView,
} from "@merit/grantmaking/api";
import type { FundingRoundOverviewData } from "@merit/grantmaking/api";
import { getExampleRound } from "@merit/grantmaking/examples";
import { fromMinorUnits } from "@merit/money";
import {
  aiReviewDataFixture,
  aiReviewFixture,
  earlierAiReviewFixture,
  outdatedAiReviewFixture,
} from "@merit/reviews-web/testing";
import { reviewRevisionSchema } from "@merit/reviews/domain";
import { Button } from "@merit/ui/button";
import { Inline } from "@merit/ui/layout";

import { GrantmakingMessagesProvider } from "../../messages";
import { ApplicationContainedPreview } from "../../testing/application-preview";
import { ApplicationView } from "./application-view";

const exampleRound = getExampleRound();
const round = encodeRoundOverview(exampleRound);
const earlierBase = exampleRound.applications[0]!;
const earlierRevised = {
  ...earlierBase,
  version: materialVersionSchema.parse(2),
  requested: fromMinorUnits(2800000n),
  submission: { ...earlierBase.submission!, version: materialVersionSchema.parse(2) },
};
const earlierIntakeState = {
  revision: 2,
  workingRevision: null,
  history: [
    {
      revision: 2,
      action: "application.revision_recorded",
      actor: "Dana Reed",
      provenance: { interface: "web" as const },
      reason: "The applicant added accessible transport to the requested budget.",
      recordedAt: "2027-01-15T10:00:00Z",
      before: encodeApplicationDetail({ round: exampleRound, application: earlierBase })
        .application,
      after: encodeApplicationDetail({ round: exampleRound, application: earlierRevised })
        .application,
    },
  ],
};

type PreviewProps = Omit<ComponentProps<typeof ApplicationView>, "round" | "application"> & {
  round: FundingRoundOverviewData;
  application: FundingRoundOverviewData["applications"][number];
};

const ApplicationPreview = ({ round, application, ...props }: PreviewProps) => {
  const view = decodeRoundView({
    ...round,
    applications: round.applications.map((item) =>
      item.id === application.id ? application : item,
    ),
  });

  return (
    <ApplicationContainedPreview locationKey={application.title}>
      <ApplicationView
        {...props}
        round={view}
        application={view.applications.find((item) => item.id === application.id)!}
      />
    </ApplicationContainedPreview>
  );
};

const meta = {
  title: "Features/Applications/Application detail",
  tags: ["!autodocs"],
  parameters: { layout: "fullscreen", controls: { disable: true } },
  component: ApplicationPreview,
  args: { round, application: round.applications[0]! },
  decorators: [
    (Story) => (
      <GrantmakingMessagesProvider>
        <Story />
      </GrantmakingMessagesProvider>
    ),
  ],
} satisfies Meta<typeof ApplicationPreview>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Evidence: Story = {};
export const ChangedEvidence: Story = {
  args: { application: round.applications[2]! },
};
export const MissingSubmission: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Records without a submission show an empty state. Summaries and evidence excerpts remain separate from applicant-authored responses.",
      },
    },
  },
  args: { application: { ...round.applications[0]!, submission: undefined } },
};
export const NoReviewers: Story = {
  args: {
    application: {
      ...round.applications[0]!,
      reviews: { revision: reviewRevisionSchema.parse(0), requests: [], assessments: [] },
    },
    tab: "reviews",
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("region", { name: "Reviewer assessments" })).toHaveTextContent(
      "No assessments or review requests yet.",
    );
    await expect(canvas.queryByText("Sam Morgan")).not.toBeInTheDocument();
  },
};
export const Reviews: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Reviewer assessments and the manager recommendation use the same author-first structure in adjacent columns on desktop. Narrow screens stack the two areas. The recommendation editor replaces its summary while preserving access to reference material.",
      },
    },
  },
  args: { application: round.applications[2]!, tab: "reviews" },
  play: async ({ canvas }) => {
    await expect(
      within(canvas.getByRole("region", { name: "Reviewer assessments" })).getByText(
        "Based on an earlier submission",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      within(canvas.getByRole("region", { name: "Reviewer assessments" })).getByText(
        "Awaiting assessment",
        { exact: true },
      ),
    ).toBeVisible();
  },
};

export const InPreparation: Story = {
  args: {
    application: {
      ...round.applications[0]!,
      requested: null,
      intakeStatus: "in_preparation",
      reviews: { revision: reviewRevisionSchema.parse(0), requests: [], assessments: [] },
      contactId: null,
      managerRecommendation: null,
      submission: { version: 1, answers: [] },
    },
    tab: "reviews",
  },
};
const earlierRound = encodeRoundOverview({
  ...exampleRound,
  applications: [earlierRevised, ...exampleRound.applications.slice(1)],
});

export const EarlierManagerRecommendation: Story = {
  args: {
    application: earlierRound.applications[0]!,
    intakeState: earlierIntakeState,
    tab: "reviews",
  },
};

export const UnknownBasis: Story = {
  args: {
    application: {
      ...round.applications[0]!,
      managerRecommendation: {
        ...round.applications[0]!.managerRecommendation!,
        recorded: undefined,
      },
    },
    tab: "reviews",
  },
  play: async ({ canvas }) => {
    const recommendation = within(canvas.getByRole("region", { name: "Manager recommendation" }));
    await expect(recommendation.getByText("Submission basis not known")).toBeVisible();
    await expect(
      recommendation.queryByRole("button", { name: "Compare changes" }),
    ).not.toBeInTheDocument();
  },
};

export const ReadOnly: Story = { args: { readOnly: true, tab: "reviews" } };

const ExternalReferencePreview = (props: PreviewProps) => {
  const [tab, setTab] = useState<"evidence" | "reviews">("evidence");
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh", overflow: "hidden" }}>
      <section aria-label="Story controls" style={{ padding: "var(--space-2) var(--space-4)" }}>
        <h2>Story controls: external navigation</h2>
        <Inline>
          <Button variant="quiet" onPress={() => setTab("evidence")}>
            Open submission externally
          </Button>
          <Button variant="quiet" onPress={() => setTab("reviews")}>
            Open assessments externally
          </Button>
        </Inline>
      </section>
      <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
        <ApplicationPreview {...props} tab={tab} onTabChange={setTab} />
      </div>
    </div>
  );
};

export const ExternalReferenceNavigation: Story = {
  render: (args) => <ExternalReferencePreview {...args} />,
  parameters: {
    docs: {
      description: {
        story:
          "The extra buttons simulate a parent changing the reference destination. Reading positions and focus follow the same transition as local navigation.",
      },
    },
  },
};

export const ReviewDetails: Story = {
  args: Reviews.args,
  play: async ({ canvas, userEvent }) => {
    const reviews = within(canvas.getByRole("region", { name: "Reviewer assessments" }));
    await userEvent.click(reviews.getAllByRole("button", { name: "Review details" })[0]!);
    await expect(reviews.getByRole("region", { name: "Review details" })).toBeVisible();
    await expect(reviews.getByRole("button", { name: "Back to assessments" })).toBeVisible();
    await expect(canvas.queryByRole("dialog")).not.toBeInTheDocument();
  },
};

/** Without assessments the section sits within the first screen, beside the recommendation. */
const noReviewers = {
  ...round.applications[0]!,
  summary: "",
  reviews: { revision: reviewRevisionSchema.parse(0), requests: [], assessments: [] },
};

const aiReviewSection = (canvas: Parameters<NonNullable<Story["play"]>>[0]["canvas"]) =>
  within(canvas.getByRole("complementary", { name: "Application workspace" }));

const aiReviewStory = (
  aiReviewData: ReturnType<typeof aiReviewDataFixture>,
  play?: Story["play"],
): Story => ({
  args: { application: noReviewers, tab: "reviews", aiReviewData },
  play,
});

/** The AI review section beside the reviewer assessments, before any run. */
export const AiReviewEmpty = aiReviewStory(aiReviewDataFixture(), async ({ canvas }) => {
  await expect(
    aiReviewSection(canvas).getByRole("region", { name: "AI review" }),
  ).toHaveTextContent("No AI review yet.");
  await expect(
    aiReviewSection(canvas).getByRole("button", { name: "Run AI review" }),
  ).toBeVisible();
});
export const AiReviewConsentRequired = aiReviewStory(
  aiReviewDataFixture({ availability: "consent_required" }),
  async ({ canvas }) => {
    await expect(
      aiReviewSection(canvas).getByText(/must turn on Merit AI for this workspace/),
    ).toBeVisible();
    await expect(
      aiReviewSection(canvas).queryByRole("button", { name: /Run/ }),
    ).not.toBeInTheDocument();
  },
);
export const AiReviewDemo = aiReviewStory(
  aiReviewDataFixture({ availability: "demo", provider: null, reviews: [aiReviewFixture()] }),
);
export const AiReviewCurrent = aiReviewStory(aiReviewDataFixture({ reviews: [aiReviewFixture()] }));
export const AiReviewOutdated = aiReviewStory(
  aiReviewDataFixture({ reviews: [outdatedAiReviewFixture()] }),
);
export const AiReviewDetails = aiReviewStory(
  aiReviewDataFixture({ reviews: [aiReviewFixture()] }),
  async ({ canvas, userEvent }) => {
    await userEvent.click(aiReviewSection(canvas).getByRole("button", { name: /Merit AI/ }));
    const full = within(canvas.getByRole("region", { name: "AI review details" }));
    await expect(full.getByRole("heading", { name: "AI review" })).toHaveFocus();
    await expect(full.getByRole("button", { name: "Back to assessments" })).toBeVisible();
  },
);
export const AiReviewEarlierRuns = aiReviewStory(
  aiReviewDataFixture({ reviews: [outdatedAiReviewFixture(), earlierAiReviewFixture()] }),
  async ({ canvas, userEvent }) => {
    await userEvent.click(aiReviewSection(canvas).getByRole("button", { name: /Merit AI/ }));
    const full = within(canvas.getByRole("region", { name: "AI review details" }));
    await userEvent.click(full.getByRole("button", { name: /^Earlier AI reviews/ }));
    await expect(full.getByRole("list", { name: "Earlier AI reviews" })).toBeVisible();
  },
);
