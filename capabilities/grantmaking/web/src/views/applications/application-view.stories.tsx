import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type ComponentProps } from "react";
import { expect, within } from "storybook/test";

import { materialVersionSchema } from "@merit/applications/domain";
import { encodeRoundOverview, decodeRoundView } from "@merit/grantmaking/api";
import type { FundingRoundOverviewData } from "@merit/grantmaking/api";
import { getExampleRound } from "@merit/grantmaking/examples";
import { reviewRevisionSchema } from "@merit/reviews/domain";
import { Button } from "@merit/ui/button";

import { GrantmakingMessagesProvider } from "../../messages";
import { ApplicationContainedPreview } from "../../testing/application-preview";
import { ApplicationView } from "./application-view";

const round = encodeRoundOverview(getExampleRound());

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
  title: "Features/Applications/Overview",
  tags: ["!autodocs"],
  parameters: { layout: "fullscreen" },
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
      canvas.getByText("Application changed since this assessment", { exact: true }),
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
export const EarlierManagerRecommendation: Story = {
  args: {
    application: { ...round.applications[0]!, version: materialVersionSchema.parse(2) },
    tab: "reviews",
  },
};

export const ReadOnly: Story = { args: { readOnly: true, tab: "reviews" } };

const ExternalReferencePreview = (props: PreviewProps) => {
  const [tab, setTab] = useState<"evidence" | "reviews">("evidence");
  return (
    <ApplicationPreview
      {...props}
      tab={tab}
      onTabChange={setTab}
      navigation={
        <>
          <Button variant="quiet" onPress={() => setTab("evidence")}>
            Open submission externally
          </Button>
          <Button variant="quiet" onPress={() => setTab("reviews")}>
            Open assessments externally
          </Button>
        </>
      }
    />
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
