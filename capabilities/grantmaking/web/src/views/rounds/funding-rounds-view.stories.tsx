import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ComponentProps } from "react";

import { encodeRoundSummary, decodeRoundSummary } from "@merit/grantmaking/api";
import { getExampleRound } from "@merit/grantmaking/examples";
import { ApplicationPage } from "@merit/ui/application-shell";

import { GrantmakingMessagesProvider } from "../../messages";
import { FundingRoundsView } from "./funding-rounds-view";

const example = getExampleRound();
const round = encodeRoundSummary({
  organizationId: "example",
  organizationName: example.foundation,
  workspaceSlug: "example",

  publicId: "k7m2p9x4n6rt",
  title: example.title,
  decisionStatus: example.decisionStatus,
  applicationCount: example.applications.length,
  meetingDate: example.meetingDate,
  budget: example.budget,
});

const FundingRoundsPreview = ({
  rounds,
  ...props
}: Omit<ComponentProps<typeof FundingRoundsView>, "rounds"> & {
  rounds: ReturnType<typeof encodeRoundSummary>[];
}) => <FundingRoundsView {...props} rounds={rounds.map(decodeRoundSummary)} />;

const meta = {
  title: "Features/Funding rounds/List",
  tags: ["!autodocs"],
  parameters: { layout: "fullscreen" },
  component: FundingRoundsPreview,
  args: {
    rounds: [round],
    renderRoundLink: (item) => <a href={`/app/example/rounds/${item.publicId}`}>{item.title}</a>,
    renderApplicationsLink: (item, children) => (
      <a href={`/app/example/rounds/${item.publicId}?section=applications`}>{children}</a>
    ),
  },
  decorators: [
    (Story) => (
      <ApplicationPage locationKey="rounds" breadcrumb={null} breadcrumbLabel="Breadcrumb">
        <GrantmakingMessagesProvider>
          <Story />
        </GrantmakingMessagesProvider>
      </ApplicationPage>
    ),
  ],
} satisfies Meta<typeof FundingRoundsPreview>;

export default meta;

export const Default: StoryObj<typeof meta> = {};
export const MultipleRounds: StoryObj<typeof meta> = {
  args: {
    rounds: [
      round,
      {
        ...round,
        publicId: "h7m2p9x4n6rt",
        title: "Community connections and accessible neighbourhood activities 2028",
        applicationCount: 0,
        meetingDate: "2028-01-21",
      },
    ],
  },
};
export const Empty: StoryObj<typeof meta> = { args: { rounds: [] } };
