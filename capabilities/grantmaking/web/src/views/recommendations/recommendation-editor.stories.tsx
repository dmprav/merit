import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type ComponentProps } from "react";
import { expect, fn, waitFor, within } from "storybook/test";

import { encodeRoundOverview, decodeRoundView } from "@merit/grantmaking/api";
import type { FundingRoundOverviewData } from "@merit/grantmaking/api";
import { updateRecommendation } from "@merit/grantmaking/api";
import { getExampleRound } from "@merit/grantmaking/examples";
import type {
  RecommendationDraft,
  RecommendationFailure,
} from "@merit/recommendations-web/contracts";
import { RecommendationEditor } from "@merit/recommendations-web/work";
import { encodeRecommendation } from "@merit/recommendations/api";
import { emptyReviews } from "@merit/reviews/domain";

import { GrantmakingMessagesProvider } from "../../messages";
import { ApplicationContainedPreview } from "../../testing/application-preview";
import { ApplicationView } from "../applications/application-view";

type PreviewProps = Omit<
  ComponentProps<typeof RecommendationEditor>,
  "round" | "application" | "onSave"
> & {
  round: FundingRoundOverviewData;
  application: { id: string };
  onSave: (
    value: ReturnType<typeof encodeRecommendation>,
  ) => RecommendationFailure | null | Promise<RecommendationFailure | null>;
};

const EditablePreview = (args: PreviewProps) => {
  const [round, setRound] = useState(() => decodeRoundView(args.round));
  const application = round.applications.find((item) => item.id === args.application.id)!;
  const [tab, setTab] = useState<"evidence" | "reviews">("reviews");
  const [draft, setDraft] = useState<RecommendationDraft | undefined>(args.draft);

  return (
    <ApplicationContainedPreview locationKey={application.title}>
      <RecommendationEditor
        {...args}
        draft={draft}
        onDraftChange={setDraft}
        application={application}
        round={round}
        onSave={async (value) => {
          const failure = await args.onSave(encodeRecommendation(value));
          const updated = updateRecommendation(round, application.id, value, "2027-01-15");
          if (!failure && updated.ok) {
            setRound(updated.round);
          }
          return failure;
        }}
      >
        {({ editor, action, closeAction }) => (
          <ApplicationView
            application={application}
            round={round}
            tab={tab}
            onTabChange={setTab}
            editorCloseAction={closeAction}
            recommendationAction={action}
            editor={editor}
          />
        )}
      </RecommendationEditor>
    </ApplicationContainedPreview>
  );
};

const meta = {
  title: "Features/Applications/Recommendation",
  tags: ["!autodocs"],
  decorators: [
    (Story) => (
      <GrantmakingMessagesProvider>
        <Story />
      </GrantmakingMessagesProvider>
    ),
  ],
  parameters: { layout: "fullscreen" },
  component: EditablePreview,
  render: (args) => <EditablePreview {...args} />,
  argTypes: {
    round: { control: false },
    application: { control: false },
    draft: { control: false },
  },
  args: {
    application: { id: "A1" },
    round: encodeRoundOverview(getExampleRound()),
    disabled: false,
    onSave: fn<PreviewProps["onSave"]>(() => null),
    onDraftChange: fn(),
  },
} satisfies Meta<typeof EditablePreview>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const ResumeEditing: Story = {
  args: {
    draft: { position: "Fund", amount: "20000", reasoning: "Confirm the delivery dates." },
  },
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.queryByRole("form")).not.toBeInTheDocument();

    await userEvent.click(
      canvas.getByRole("button", { name: /Resume editing recommendation for/ }),
    );

    await expect(canvas.getByRole("textbox", { name: "Proposed allocation" })).toHaveValue("20000");
    await expect(canvas.getByLabelText(/Reasoning/)).toHaveValue("Confirm the delivery dates.");
  },
};
export const SaveFailure: Story = {
  args: {
    onSave: fn<PreviewProps["onSave"]>(() => ({ status: "unavailable" })),
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: /Edit recommendation for/ }));
    await userEvent.click(canvas.getByRole("button", { name: "Save recommendation" }));

    await expect(
      canvas.getByText(
        "We couldn’t save your recommendation. Your draft is still here. Try again.",
      ),
    ).toBeVisible();
  },
};

export const Validation: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: /Edit recommendation for/ }));
    const amount = canvas.getByRole("textbox", { name: "Proposed allocation" });
    await userEvent.clear(amount);
    await userEvent.click(canvas.getByRole("button", { name: "Save recommendation" }));

    await waitFor(() => expect(amount).toHaveFocus());
    await expect(amount).toHaveAccessibleDescription(
      /Enter an amount with no more than two decimal places/,
    );
  },
};

export const Saving: Story = {
  args: {
    // Keep the pending state available for inspection until the story is remounted.
    onSave: fn<PreviewProps["onSave"]>(() => new Promise(() => {})),
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: /Edit recommendation for/ }));
    await userEvent.click(canvas.getByRole("button", { name: "Save recommendation" }));

    await expect(canvas.getByRole("button", { name: "Saving…" })).toBeDisabled();
    await expect(canvas.getByRole("button", { name: "Close" })).toBeDisabled();
    await expect(canvas.getByRole("button", { name: "Close recommendation" })).toBeDisabled();
    await expect(canvas.getByRole("button", { name: /Recommendation/ })).toBeDisabled();
    await expect(canvas.getByRole("textbox", { name: "Proposed allocation" })).toBeDisabled();
  },
};

export const BudgetPreview: Story = {
  args: { application: { id: "A3" } },
  play: async ({ canvas, userEvent, canvasElement }) => {
    await userEvent.click(canvas.getByRole("button", { name: /Edit recommendation for/ }));
    await userEvent.click(canvas.getByRole("button", { name: /Recommendation$/ }));
    await userEvent.click(
      within(canvasElement.ownerDocument.body).getByRole("option", { name: "Fund" }),
    );
    const amount = canvas.getByRole("textbox", { name: "Proposed allocation" });
    await userEvent.clear(amount);
    await userEvent.type(amount, "22000");

    await expect(canvas.getByRole("status", { name: "Budget preview" })).toHaveTextContent(
      "Over budget with draft €14,000",
    );
  },
};

const noRecommendationRound = getExampleRound();
const noRecommendationApplication = noRecommendationRound.applications[2];
if (!noRecommendationApplication) {
  throw new Error("Expected the Workshop Saturdays example");
}
noRecommendationApplication.managerRecommendation = null;
export const NoRecommendation: Story = {
  args: { round: encodeRoundOverview(noRecommendationRound), application: { id: "A3" } },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("button", { name: "Add recommendation for Workshop Saturdays" }),
    ).toBeVisible();
  },
};

export const DeferDuringPreparation: Story = {
  args: {
    round: encodeRoundOverview({
      ...getExampleRound(),
      applications: getExampleRound().applications.map((application) =>
        application.id === "A1"
          ? {
              ...application,
              intakeStatus: "in_preparation",
              managerRecommendation: null,
              assessments: [],
              reviews: emptyReviews(),
            }
          : application,
      ),
    }),
  },
  play: async ({ canvas, userEvent }) => {
    await expect(
      canvas.queryByRole("region", { name: "Manager recommendation" }),
    ).not.toBeInTheDocument();

    await userEvent.click(
      canvas.getByRole("button", { name: "Defer application: Neighbour Table" }),
    );
    await userEvent.type(
      canvas.getByRole("textbox", { name: "Reasoning" }),
      "Waiting for the applicant’s budget breakdown.",
    );
    await userEvent.click(canvas.getByRole("button", { name: "Save recommendation" }));
    const recommendation = within(
      await canvas.findByRole("region", { name: "Manager recommendation" }),
    );

    await expect(recommendation.getByText("Defer", { exact: true })).toBeVisible();
  },
};
