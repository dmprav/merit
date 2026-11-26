import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ComponentProps } from "react";
import { expect, within } from "storybook/test";

import { encodeRoundOverview, decodeRoundView } from "@merit/grantmaking/api";
import type { FundingRoundOverviewData } from "@merit/grantmaking/api";
import { roundView, updateRecommendation } from "@merit/grantmaking/api";
import { getExampleRound } from "@merit/grantmaking/examples";
import { fromMinorUnits, subtract } from "@merit/money";
import { emptyReviews } from "@merit/reviews/domain";

import { GrantmakingMessagesProvider } from "../../messages";
import { FundingRoundPreview as FundingRoundView } from "../../testing/application-list-preview";
import { ApplicationContainedPreview } from "../../testing/application-preview";

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
  committedEuros,
  ...props
}: Omit<ComponentProps<typeof FundingRoundView>, "round"> & {
  round: FundingRoundOverviewData;
  /** Funding the round's decisions commit, in whole euros; the overview derives none from records. */
  committedEuros?: number;
}) => {
  const view = decodeRoundView(round);
  if (committedEuros === undefined) {
    return <FundingRoundView {...props} round={view} />;
  }
  const committed = fromMinorUnits(BigInt(committedEuros * 100));
  return (
    <FundingRoundView
      {...props}
      round={{
        ...view,
        totals: {
          ...view.totals,
          committed,
          available: view.budget === null ? null : subtract(view.budget, committed),
        },
      }}
    />
  );
};

const meta = {
  title: "Features/Funding rounds/Overview",
  tags: ["!autodocs"],
  parameters: { layout: "fullscreen", controls: { disable: true } },
  component: FundingRoundPreview,
  args: { round: encodeRoundOverview(example) },
  decorators: [
    (Story) => (
      <ApplicationContainedPreview locationKey="round" width="full">
        <GrantmakingMessagesProvider>
          <Story />
        </GrantmakingMessagesProvider>
      </ApplicationContainedPreview>
    ),
  ],
} satisfies Meta<typeof FundingRoundPreview>;

export default meta;

type Story = StoryObj<typeof meta>;

/** The example round's decisions, which the encoded overview does not carry: Neighbour Table is funded in full. */
const exampleDecisionArgs = {
  decisions: { A1: { outcome: "Fund" } },
  committedEuros: 24000,
} as const;

export const Example: Story = { args: exampleDecisionArgs };
export const Applications: Story = { args: { ...exampleDecisionArgs, section: "applications" } };
/** The committee's decision sits beside the recommendation; the budget summary shows committed funding. */
export const Decisions: Story = {
  args: {
    section: "applications",
    decisions: { A1: { outcome: "Fund" }, A2: { outcome: "Fund with conditions" } },
    // €24,000 awarded and €28,000 awarded with conditions leave €8,000 of the €60,000 budget.
    committedEuros: 52000,
  },
  play: async ({ canvas }) => {
    const funded = within(canvas.getByRole("row", { name: /Neighbour Table/ }));
    await expect(funded.getAllByText("Fund", { exact: true })[0]).toBeVisible();
    await expect(
      within(canvas.getByRole("row", { name: /Workshop Saturdays/ })).getByText("No decision"),
    ).toBeVisible();
    const summary = within(canvas.getByRole("region", { name: "Round summary" }));
    await expect(summary.getByText("Committed")).toBeVisible();
    await expect(summary.getByText("Committed").closest("div")).toHaveTextContent("€52,000");
    await expect(summary.getByText("Available").closest("div")).toHaveTextContent("€8,000");
  },
};
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
    for (const status of canvas.getAllByText("1 of 2 reviewed")) {
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
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Round totals scope" }));
    const body = within(canvasElement.ownerDocument.body);
    await expect(body.getByRole("dialog", { name: "Round totals scope" })).toHaveTextContent(
      "1 withdrawn application not counted.",
    );
    await userEvent.keyboard("{Escape}");
    const applications = within(canvas.getByRole("table", { name: "Applications" }));
    await expect(applications.getByText("Withdrawn", { exact: true })).toBeVisible();
  },
};
export const WithdrawnFilter: Story = {
  args: { section: "applications", round: withdrawnRound },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Filter" }));
    await userEvent.click(within(document.body).getByRole("button", { name: "Participation Any" }));
    await userEvent.click(await within(document.body).findByRole("option", { name: "Withdrawn" }));

    await userEvent.keyboard("{Escape}");
    await expect(canvas.getByRole("status")).toHaveTextContent("1 of");
  },
};

export const ReadOnly: Story = { args: { readOnly: true } };

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
};
