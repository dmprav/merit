import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type ComponentProps } from "react";
import { expect, fn, waitFor, within } from "storybook/test";

import { fromMinorUnits } from "@merit/money";
import { encodeRecommendation } from "@merit/recommendations/api";

import type { RecommendationFailure } from "../../contracts/recommendations";
import { Messages } from "../../messages";
import { application, round } from "../../testing/fixtures";
import { RecommendationEditor } from "./recommendation-editor";

type PreviewProps = Pick<ComponentProps<typeof RecommendationEditor>, "draft" | "conflict"> & {
  saved?: "funded" | "deferred" | "none";
  onSave: (
    value: ReturnType<typeof encodeRecommendation>,
  ) => Promise<RecommendationFailure | null> | RecommendationFailure | null;
};

const recommendations = {
  funded: application.managerRecommendation,
  deferred: {
    position: "Defer",
    allocation: fromMinorUnits(0n),
    reasoning: "Wait for more information.",
  },
  none: null,
} as const;

const EditablePreview = ({
  saved = "funded",
  draft: initialDraft,
  conflict: initialConflict,
  onSave,
}: PreviewProps) => {
  const [draft, setDraft] = useState(initialDraft);
  const [conflict, setConflict] = useState(initialConflict);
  const [draftReset, setDraftReset] = useState(0);
  return (
    <RecommendationEditor
      application={{ ...application, managerRecommendation: recommendations[saved] }}
      round={round}
      disabled={false}
      draft={draft}
      draftReset={draftReset}
      conflict={conflict}
      onDraftChange={setDraft}
      onKeepDraft={() => setConflict(null)}
      onLoadLatest={() => {
        setConflict(null);
        setDraft(undefined);
        setDraftReset((count) => count + 1);
      }}
      onSave={(value) => onSave(encodeRecommendation(value))}
    />
  );
};

const meta = {
  title: "Features/Applications/Recommendation editor",
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

export const NoRecommendation: Story = {
  args: { saved: "none" },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("button", { name: "Add recommendation for Community meals" }),
    ).toBeVisible();
  },
};

export const BudgetPreview: Story = {
  args: { saved: "deferred" },
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
      /Over budget with draft\s*€14,000/,
    );
  },
};

const failOnceSave = fn<PreviewProps["onSave"]>();

export const SaveFailure: Story = {
  args: {
    onSave: failOnceSave,
  },
  beforeEach: () => {
    failOnceSave.mockReset();
    failOnceSave.mockResolvedValueOnce({ status: "unavailable" }).mockResolvedValue(null);
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
    await expect(amount).toHaveAccessibleDescription(/Enter an amount\./);
  },
};

export const ConcurrentChanges: Story = {
  args: {
    conflict: "record_changed",
    draft: { position: "Fund", amount: "20000", reasoning: "Confirm the delivery dates." },
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: /Resume editing recommendation for/ }),
    );
    await expect(canvas.getByText("Recommendation changed while you were editing")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "View latest" }));
    await expect(canvas.getByText("Latest saved recommendation")).toBeVisible();
  },
};
