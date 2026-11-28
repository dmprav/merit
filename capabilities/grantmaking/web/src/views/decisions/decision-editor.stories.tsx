import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type ComponentProps } from "react";
import { expect, fn, within } from "storybook/test";

import type { DecisionDraft, DecisionFailure } from "@merit/decisions-web/contracts";
import { DecisionEditor } from "@merit/decisions-web/decisions";
import { encodeDecision } from "@merit/decisions/api";
import { commitmentOf, decodeDecision, type Decision } from "@merit/decisions/domain";
import { decodeRoundView, encodeRoundOverview } from "@merit/grantmaking/api";
import type { FundingRoundOverviewData, RoundView } from "@merit/grantmaking/api";
import { getExampleRound } from "@merit/grantmaking/examples";
import { add, fromMinorUnits, subtract } from "@merit/money";

import { GrantmakingMessagesProvider } from "../../messages";
import { ApplicationContainedPreview } from "../../testing/application-preview";
import { ApplicationView } from "../applications/application-view";

/** Dates the form accepts, since a decision cannot be dated after today. */
const daysAgo = (days: number) =>
  new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

const yesterday = daysAgo(1);

const recorder = { userId: "dana", name: "Dana Reed", provenance: { interface: "web" } } as const;

const firstDecision: Decision = {
  outcome: "Fund",
  amount: fromMinorUnits(2400000n),
  conditions: "",
  reason: "The committee funded the full request and asked for simple reporting.",
  decidedBy: "Funding committee",
  decisionDate: daysAgo(3),
  recorder,
  recordedAt: `${daysAgo(3)}T14:00:00.000Z`,
  applicationVersion: 1,
};

const amendedDecision: Decision = {
  ...firstDecision,
  outcome: "Fund with conditions",
  amount: fromMinorUnits(2000000n),
  conditions: "Confirm the dates with the community hall in writing.",
  reason: "A later meeting reduced the award until the venue is confirmed.",
  decisionDate: yesterday,
  changeExplanation: "The venue could not confirm all 24 dates.",
  recorder: { ...recorder, provenance: { interface: "mcp", clientId: "Claude" } },
  recordedAt: `${yesterday}T09:30:00.000Z`,
};

type EncodedVersion = { revision: number; decision: ReturnType<typeof encodeDecision> };

// Story arguments are cloned, which money values do not survive, so they carry encoded versions.
const version = (revision: number, decision: Decision): EncodedVersion => ({
  revision,
  decision: encodeDecision(decision),
});

const twoVersions = [version(2, amendedDecision), version(1, firstDecision)];

type PreviewProps = Omit<
  ComponentProps<typeof DecisionEditor>,
  "round" | "application" | "onSave" | "versions" | "onDraftChange"
> & {
  round: FundingRoundOverviewData;
  application: { id: string };
  versions: readonly EncodedVersion[];
  onSave: (value: { outcome: string; reason: string }) => DecisionFailure | null;
};

/** Funding the round's other applications have committed: €28,000, leaving room for €8,000 more. */
const committedElsewhere = fromMinorUnits(2800000n);

/** The round as the application page reports it: committed funding comes from decisions. */
const withCommitments = (round: RoundView, current: Decision | undefined) => {
  const budget = round.budget;
  const committed = add(committedElsewhere, commitmentOf(current ?? null));
  return {
    ...round,
    budget,
    totals: {
      ...round.totals,
      committed,
      available: budget === null ? null : subtract(budget, committed),
    },
  };
};

const EditablePreview = ({ versions: encodedVersions, ...args }: PreviewProps) => {
  const versions = encodedVersions.map((saved) => ({
    revision: saved.revision,
    decision: decodeDecision(saved.decision),
  }));
  const base = decodeRoundView(args.round);
  const round = withCommitments(base, versions[0]?.decision);
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
        // The action log serializes arguments, which money values refuse; log only the plain fields.
        onSave={async (value) => args.onSave({ outcome: value.outcome, reason: value.reason })}
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
            editorJumpLabel="Go to committee decision"
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

/** Two saved versions: the current decision, its recorder, and the history behind it. */
export const SummaryWithHistory: Story = {
  args: { versions: twoVersions },
  play: async ({ canvas, userEvent }) => {
    const section = within(canvas.getByRole("region", { name: "Committee decision" }));
    await expect(section.getAllByText("Funded with conditions")[0]).toBeVisible();
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
    await expect(canvas.getByText(/Go to committee decision/)).toBeInTheDocument();
    await expect(canvas.getByRole("status", { name: "Budget preview" })).toHaveTextContent(
      /Available with this decision\s*€8,000/,
    );
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
      version(2, {
        ...amendedDecision,
        outcome: "Decline",
        amount: fromMinorUnits(0n),
        conditions: "",
        reason: "The applicant can no longer deliver the project.",
        changeExplanation: "The applicant asked to withdraw.",
      }),
      version(1, firstDecision),
    ],
  },
  play: async ({ canvas }) => {
    await expect(canvas.getAllByText("Declined")[0]).toBeVisible();
    await expect(
      canvas.queryByRole("button", { name: /Change decision for/ }),
    ).not.toBeInTheDocument();
  },
};
