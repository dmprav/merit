import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ComponentProps } from "react";
import { expect, within } from "storybook/test";

import { encodeRoundOverview, decodeRoundView } from "@merit/grantmaking/api";
import type { FundingRoundOverviewData } from "@merit/grantmaking/api";
import { roundView, updateRecommendation } from "@merit/grantmaking/api";
import { getExampleRound } from "@merit/grantmaking/examples";
import { fromMinorUnits } from "@merit/money";
import { emptyReviews } from "@merit/reviews/domain";
import { ApplicationPage } from "@merit/ui/application-shell";

import { GrantmakingMessagesProvider } from "../../messages";
import { FundingRoundView } from "./funding-round-view";

const example = getExampleRound();
const overBudget = updateRecommendation(example, "A3", {
  position: "Fund",
  allocation: fromMinorUnits(2200000n),
  reasoning: "The revised venue and delivery plan are confirmed.",
});
if (!overBudget.ok) {
  throw new Error("Invalid over-budget story fixture");
}

const FundingRoundPreview = ({
  round,
  ...props
}: Omit<ComponentProps<typeof FundingRoundView>, "round"> & {
  round: FundingRoundOverviewData;
}) => <FundingRoundView {...props} round={decodeRoundView(round)} />;

const meta = {
  title: "Features/Funding rounds/Overview",
  tags: ["!autodocs"],
  parameters: { layout: "fullscreen" },
  component: FundingRoundPreview,
  args: { round: encodeRoundOverview(example) },
  decorators: [
    (Story) => (
      <ApplicationPage
        width="full"
        locationKey="round"
        breadcrumb={null}
        breadcrumbLabel="Breadcrumb"
      >
        <GrantmakingMessagesProvider>
          <Story />
        </GrantmakingMessagesProvider>
      </ApplicationPage>
    ),
  ],
} satisfies Meta<typeof FundingRoundPreview>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Example: Story = {};
export const Applications: Story = { args: { section: "applications" } };
export const Empty: Story = {
  args: {
    round: encodeRoundOverview(roundView({ ...example, applications: [] })),
    section: "applications",
  },
};
export const OverBudget: Story = {
  args: { round: encodeRoundOverview(overBudget.round), section: "applications" },
};
export const OutdatedReviews: Story = {
  args: {
    section: "applications",
    round: encodeRoundOverview(
      roundView({
        ...example,
        applications: example.applications.filter((application) => application.id === "A3"),
      }),
    ),
  },
  play: async ({ canvas }) => {
    for (const status of canvas.getAllByText("1 outdated review, 1 awaiting review")) {
      await expect(status).toBeVisible();
    }
  },
};

export const Preparing: Story = {
  args: {
    round: encodeRoundOverview(
      roundView({
        ...example,
        title: "Community grants",
        purpose: "",
        criteria: [],
        applications: [],
        budget: null,
        meetingDate: null,
        decisionStatus: "Preparing",
      }),
    ),
  },
};

export const UnknownRequests: Story = {
  args: {
    section: "applications",
    round: encodeRoundOverview(
      roundView({
        ...example,
        budget: null,
        applications: example.applications.map((application, index) =>
          index === 0
            ? { ...application, requested: null, managerRecommendation: null }
            : application,
        ),
      }),
    ),
  },
};

const withdrawnRound = encodeRoundOverview(
  roundView({
    ...example,
    applications: example.applications.map((application, index) =>
      index === 1
        ? {
            ...application,
            withdrawal: {
              withdrawnOn: "2027-01-10",
              reason: "The applicant secured other funding.",
              recorder: { userId: "dana", name: "Dana Reed", recordedAt: "2027-01-11T09:00:00Z" },
            },
          }
        : application,
    ),
  }),
);

export const WithdrawnApplication: Story = {
  args: { section: "applications", round: withdrawnRound },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("1 withdrawn application not counted.")).toBeVisible();
    await expect(canvas.getByText("Withdrawn", { selector: "p" })).toBeVisible();
  },
};
export const WithdrawnFilter: Story = {
  args: { section: "applications", round: withdrawnRound },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: /Show/ }));
    await userEvent.click(await within(document.body).findByRole("option", { name: "Withdrawn" }));

    await expect(canvas.getByRole("status")).toHaveTextContent("1 of");
  },
};

export const ReadOnly: Story = { args: { readOnly: true } };
export const ManagerNeedsReassignment: Story = {
  args: { round: { ...encodeRoundOverview(example), managerNeedsReassignment: true } },
};

const largerRound = roundView({
  ...example,
  budget: fromMinorUnits(60000000n),
  applications: Array.from({ length: 24 }, (_, index) => {
    const source = example.applications[index % example.applications.length];

    if (!source) {
      throw new Error("The comparison story requires example applications");
    }

    return {
      ...source,
      id: `comparison-${index}`,
      title: `${source.title} (${["North", "Riverside", "Old Town", "West End", "Meadow", "Station", "East", "Harbour"][Math.floor(index / 3)]})`,
      requested: index % 7 === 0 ? null : source.requested,
      intakeStatus: index % 7 === 0 ? ("in_preparation" as const) : source.intakeStatus,
      managerRecommendation:
        index % 5 === 0 || index % 7 === 0 ? null : source.managerRecommendation,
      reviews: index % 7 === 0 ? emptyReviews() : source.reviews,
    };
  }),
});
export const ManyApplications: Story = {
  args: { round: encodeRoundOverview(largerRound), section: "applications" },
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(canvas.getByRole("searchbox"), "Riverside");

    await expect(canvas.getByRole("status")).toHaveTextContent("3 of 24 applications");

    await userEvent.click(canvas.getByRole("button", { name: "Clear filters" }));

    await expect(canvas.getAllByRole("row")).toHaveLength(25);
  },
};
