import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type ComponentProps } from "react";
import { expect, fn } from "storybook/test";

import { fromMinorUnits } from "@merit/money";

import type { DecisionFailure } from "../../contracts/decisions";
import { Messages } from "../../messages";
import {
  decisionApplication,
  decisionRound,
  firstDecision,
  oneVersion,
  twoVersions,
} from "../../testing/fixtures";
import { DecisionEditor } from "./decision-editor";

type PreviewProps = Pick<
  ComponentProps<typeof DecisionEditor>,
  "draft" | "conflict" | "onKeepDraft" | "onLoadLatest"
> & {
  history?: "none" | "first" | "amended";
  withBudget?: boolean;
  onSave: (value: { outcome: string; reason: string }) => DecisionFailure | null;
};

const savedVersions = { none: [], first: oneVersion, amended: twoVersions };

const EditablePreview = ({
  history = "none",
  withBudget = true,
  draft: initialDraft,
  onSave,
  ...args
}: PreviewProps) => {
  const [draft, setDraft] = useState(initialDraft);
  return (
    <DecisionEditor
      {...args}
      application={decisionApplication}
      round={
        withBudget
          ? decisionRound
          : {
              budget: null,
              totals: { committed: fromMinorUnits(0n), available: null, withdrawnApplications: 0 },
            }
      }
      versions={savedVersions[history]}
      disabled={false}
      draft={draft}
      onDraftChange={setDraft}
      onSave={({ outcome, reason }) => onSave({ outcome, reason })}
    />
  );
};

const meta = {
  title: "Features/Applications/Decision editor",
  tags: ["!autodocs"],
  decorators: [
    (Story) => (
      <Messages>
        <Story />
      </Messages>
    ),
  ],
  component: EditablePreview,
  args: { onSave: fn<PreviewProps["onSave"]>(() => null) },
} satisfies Meta<typeof EditablePreview>;

export default meta;

type Story = StoryObj<typeof meta>;

/** No decision yet: the section says so and offers to record one. */
export const NoDecision: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No decision recorded")).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Record decision for Community meals" }),
    ).toBeVisible();
  },
};

/** A change starts from the current decision and asks why it is changing. */
export const AmendWithExplanation: Story = {
  args: { history: "first" },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: /Change decision for/ }));

    await expect(canvas.getByLabelText(/Reason/)).toHaveValue(firstDecision.reason);
    await expect(canvas.getByLabelText(/changing this decision/)).toBeVisible();
    await userEvent.type(canvas.getByLabelText(/Reason/), " Revised.");
    await userEvent.click(canvas.getByRole("button", { name: "Save decision" }));
    await expect(canvas.getByLabelText(/changing this decision/)).toHaveAccessibleDescription(
      /Explain why the decision is changing\./,
    );
  },
};

/** The budget preview shows the excess before saving; the server rejects it too. */
export const OverBudget: Story = {
  args: {
    history: "first",
    onSave: fn<PreviewProps["onSave"]>(() => ({
      status: "invalid",
      error: "commitment_exceeds_budget",
      budget: { minorUnits: "6000000", currency: "EUR" },
      committed: { minorUnits: "6100000", currency: "EUR" },
      excess: { minorUnits: "100000", currency: "EUR" },
    })),
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: /Change decision for/ }));
    const amount = canvas.getByRole("textbox", { name: "Amount" });
    await userEvent.clear(amount);
    await userEvent.type(amount, "33000");
    await expect(canvas.getByRole("status", { name: "Budget preview" })).toHaveTextContent(
      /Over budget with this decision\s*€1,000/,
    );

    await userEvent.type(canvas.getByLabelText(/changing this decision/), "Raised after review.");
    await userEvent.click(canvas.getByRole("button", { name: "Save decision" }));
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "This decision would exceed the round budget by €1,000.",
    );
  },
};

/** Funding needs a round budget; a deferral or decline does not. */
export const NoBudget: Story = {
  args: {
    withBudget: false,
    onSave: fn<PreviewProps["onSave"]>(() => ({
      status: "invalid",
      error: "budget_required",
      budget: null,
      committed: { minorUnits: "2000000", currency: "EUR" },
      excess: null,
    })),
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: /Record decision for/ }));
    await expect(
      canvas.getByText("This round has no budget. Set one before funding."),
    ).toBeVisible();
    await userEvent.type(canvas.getByLabelText(/Conditions/), "Confirm the venue.");
    await userEvent.type(canvas.getByLabelText(/Reason/), "Funded with the venue condition.");
    await userEvent.type(canvas.getByLabelText(/Decided by/), "Funding committee");
    await userEvent.type(
      canvas.getByRole("textbox", { name: /Decision date/ }),
      firstDecision.decisionDate,
    );
    await userEvent.click(canvas.getByRole("button", { name: "Save decision" }));
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "This round has no budget. Set a budget before recording funding.",
    );
    // The save error says it, so the preview does not repeat it.
    await expect(
      canvas.queryByText("This round has no budget. Set one before funding."),
    ).not.toBeInTheDocument();
  },
};

/** Another person changed the decision while this draft was open. */
export const ConflictRecovery: Story = {
  args: {
    history: "amended",
    conflict: "record_changed",
    onKeepDraft: fn(),
    onLoadLatest: fn(),
    draft: {
      outcome: "Fund",
      amount: "24000.00",
      conditions: "",
      reason: "My unsaved reason.",
      decidedBy: "Funding committee",
      decisionDate: firstDecision.decisionDate,
      changeExplanation: "My unsaved explanation.",
    },
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: /Resume editing decision for/ }));
    await expect(canvas.getByRole("alert")).toHaveTextContent(
      "Decision changed while you were editing",
    );
    await expect(canvas.getByRole("button", { name: "Save decision" })).toBeDisabled();
    await expect(canvas.getByLabelText(/Reason/)).toHaveValue("My unsaved reason.");
  },
};
