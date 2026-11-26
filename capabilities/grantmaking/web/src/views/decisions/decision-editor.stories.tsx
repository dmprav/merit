import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type ComponentProps } from "react";
import { expect, fn, within } from "storybook/test";

import type { DecisionDraft, DecisionFailure } from "@merit/decisions-web/contracts";
import { DecisionEditor } from "@merit/decisions-web/decisions";
import type { Decision, DecisionVersion } from "@merit/decisions/domain";
import { decodeRoundView, encodeRoundOverview } from "@merit/grantmaking/api";
import type { FundingRoundOverviewData, RoundView } from "@merit/grantmaking/api";
import { getExampleRound } from "@merit/grantmaking/examples";
import { encodeMoney, fromMinorUnits } from "@merit/money";

import { GrantmakingMessagesProvider } from "../../messages";
import { ApplicationContainedPreview } from "../../testing/application-preview";
import { ApplicationView } from "../applications/application-view";

const recorder = { userId: "dana", name: "Dana Reed", provenance: { interface: "web" } } as const;

const firstDecision: Decision = {
  outcome: "Fund",
  amount: fromMinorUnits(2400000n),
  conditions: "",
  reason: "The committee funded the full request and asked for simple reporting.",
  decidedBy: "Funding committee",
  decisionDate: "2027-01-18",
  recorder,
  recordedAt: "2027-01-18T12:00:00.000Z",
  applicationVersion: 1,
};

const amendedDecision: Decision = {
  ...firstDecision,
  outcome: "Fund with conditions",
  amount: fromMinorUnits(2000000n),
  conditions: "Confirm the dates with the community hall in writing.",
  reason: "A later meeting reduced the award until the venue is confirmed.",
  decisionDate: "2027-02-08",
  changeExplanation: "The venue could not confirm all 24 dates.",
  recorder: { ...recorder, provenance: { interface: "mcp", clientId: "Claude" } },
  recordedAt: "2027-02-09T09:30:00.000Z",
};

const twoVersions: readonly DecisionVersion[] = [
  { revision: 2, decision: amendedDecision },
  { revision: 1, decision: firstDecision },
];

const oneVersion: readonly DecisionVersion[] = [{ revision: 1, decision: firstDecision }];

type PreviewProps = Omit<
  ComponentProps<typeof DecisionEditor>,
  "round" | "application" | "onSave" | "versions" | "onDraftChange"
> & {
  round: FundingRoundOverviewData;
  application: { id: string };
  versions: readonly DecisionVersion[];
  /** Funding committed by this round's other applications, in euros. */
  committedElsewhere?: bigint;
  withBudget?: boolean;
  onSave: (value: { outcome: string; reason: string }) => DecisionFailure | null;
};

/** The round as the application page reports it: committed funding comes from decisions. */
const withCommitments = (round: RoundView, committed: bigint, withBudget: boolean) => {
  const budget = withBudget ? round.budget : null;
  const total = fromMinorUnits(committed);
  return {
    ...round,
    budget,
    totals: {
      ...round.totals,
      committed: total,
      available:
        budget === null ? null : fromMinorUnits(BigInt(encodeMoney(budget).minorUnits) - committed),
    },
  };
};

const EditablePreview = ({
  committedElsewhere = 2800000n,
  withBudget = true,
  versions,
  ...args
}: PreviewProps) => {
  const base = decodeRoundView(args.round);
  const current = versions[0]?.decision;
  const committed =
    committedElsewhere +
    (current && (current.outcome === "Fund" || current.outcome === "Fund with conditions")
      ? BigInt(encodeMoney(current.amount).minorUnits)
      : 0n);
  const round = withCommitments(base, committed, withBudget);
  const application = base.applications.find((item) => item.id === args.application.id)!;
  const [tab, setTab] = useState<"evidence" | "reviews">("reviews");
  const [draft, setDraft] = useState<DecisionDraft | undefined>(args.draft);

  return (
    <ApplicationContainedPreview locationKey={application.title}>
      <DecisionEditor
        {...args}
        versions={versions}
        draft={draft}
        onDraftChange={setDraft}
        application={application}
        round={round}
        onSave={async (value) => args.onSave(value)}
      >
        {({ editor, action, closeAction }) => (
          <ApplicationView
            application={application}
            round={round}
            tab={tab}
            onTabChange={setTab}
            decisionVersions={versions}
            decisionAction={action}
            editorTitle="Committee decision"
            editorCloseAction={closeAction}
            editor={editor}
          />
        )}
      </DecisionEditor>
    </ApplicationContainedPreview>
  );
};

const meta = {
  title: "Features/Applications/Committee decision",
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
    versions: { control: false },
  },
  args: {
    application: { id: "A1" },
    round: encodeRoundOverview(getExampleRound()),
    versions: [],
    disabled: false,
    onSave: fn<PreviewProps["onSave"]>(() => null),
  },
} satisfies Meta<typeof EditablePreview>;

export default meta;

type Story = StoryObj<typeof meta>;

/** No decision yet: the section says so and offers to record one. */
export const NoDecision: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No decision recorded")).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Record decision for Neighbour Table" }),
    ).toBeVisible();
  },
};

/** Two saved versions: the current decision, its recorder, and the history behind it. */
export const SummaryWithHistory: Story = {
  args: { versions: twoVersions },
  play: async ({ canvas, userEvent }) => {
    const section = within(canvas.getByRole("region", { name: "Committee decision" }));
    await expect(section.getByText("Funded with conditions")).toBeVisible();
    await userEvent.click(section.getByRole("button", { name: /Version history/ }));
    await expect(section.getByText("The venue could not confirm all 24 dates.")).toBeVisible();
    await expect(section.getByText("Version 1")).toBeVisible();
  },
};

/** The first decision starts from the manager's recommendation, shown for comparison. */
export const RecordFirstDecision: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: /Record decision for/ }));

    await expect(canvas.getByRole("button", { name: /Outcome/ })).toHaveTextContent("Fund");
    await expect(canvas.getByRole("textbox", { name: "Amount" })).toHaveValue("24000.00");
    await expect(canvas.getByRole("region", { name: "Manager recommendation" })).toBeVisible();
    await expect(canvas.queryByLabelText(/changing this decision/)).not.toBeInTheDocument();
    await expect(canvas.getByRole("status", { name: "Budget preview" })).toHaveTextContent(
      /Available with this decision\s*€6,000/,
    );
  },
};

/** A change starts from the current decision and asks why it is changing. */
export const AmendWithExplanation: Story = {
  args: { versions: oneVersion },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: /Change decision for/ }));

    await expect(canvas.getByLabelText(/Reason/)).toHaveValue(firstDecision.reason);
    await expect(canvas.getByLabelText(/changing this decision/)).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Save decision" }));
    await expect(canvas.getByLabelText(/changing this decision/)).toHaveAccessibleDescription(
      /Explain why the decision is changing\./,
    );
  },
};

/** The budget preview shows the excess before saving; the server rejects it too. */
export const OverBudget: Story = {
  args: {
    versions: oneVersion,
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
    committedElsewhere: 0n,
    onSave: fn<PreviewProps["onSave"]>(() => ({
      status: "invalid",
      error: "budget_required",
      budget: null,
      committed: { minorUnits: "2400000", currency: "EUR" },
      excess: null,
    })),
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: /Record decision for/ }));
    await expect(
      canvas.getByText("This round has no budget. Set one before funding."),
    ).toBeVisible();
    await userEvent.type(canvas.getByLabelText(/Reason/), "Funded in full.");
    await userEvent.type(canvas.getByLabelText(/Decided by/), "Funding committee");
    await userEvent.type(canvas.getByRole("textbox", { name: /Decision date/ }), "2027-01-18");
    await userEvent.click(canvas.getByRole("button", { name: "Save decision" }));
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "This round has no budget. Set a budget before recording funding.",
    );
  },
};

/** Another person changed the decision while this draft was open. */
export const ConflictRecovery: Story = {
  args: {
    versions: twoVersions,
    conflict: "record_changed",
    onKeepDraft: fn(),
    onLoadLatest: fn(),
    draft: {
      outcome: "Fund",
      amount: "24000.00",
      conditions: "",
      reason: "My unsaved reason.",
      decidedBy: "Funding committee",
      decisionDate: "2027-01-18",
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

const withdrawnRound = getExampleRound();
const withdrawnApplication = withdrawnRound.applications[0];
if (!withdrawnApplication) {
  throw new Error("Expected the Neighbour Table example");
}
withdrawnApplication.withdrawal = {
  withdrawnOn: "2027-02-20",
  reason: "The applicant withdrew.",
  recorder: { userId: "dana", name: "Dana Reed", recordedAt: "2027-02-21T09:00:00Z" },
};

/** A withdrawn application keeps its decision readable and offers no change. */
export const WithdrawnReadOnly: Story = {
  args: {
    round: encodeRoundOverview(withdrawnRound),
    versions: [
      {
        revision: 2,
        decision: {
          ...amendedDecision,
          outcome: "Decline",
          amount: fromMinorUnits(0n),
          conditions: "",
          reason: "The applicant can no longer deliver the project.",
          changeExplanation: "The applicant asked to withdraw.",
        },
      },
      { revision: 1, decision: firstDecision },
    ],
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Declined")).toBeVisible();
    await expect(
      canvas.queryByRole("button", { name: /Change decision for/ }),
    ).not.toBeInTheDocument();
  },
};
