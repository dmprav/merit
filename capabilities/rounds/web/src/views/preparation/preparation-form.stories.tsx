import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn } from "storybook/test";

import { getExampleRound } from "@merit/grantmaking/examples";
import { StatusMessage } from "@merit/ui/status-message";

import {
  preparationDraft,
  type PreparationDraft,
} from "../../controllers/preparation/preparation-state";
import { GrantmakingMessagesProvider } from "../../testing/providers";
import { PreparationForm } from "./preparation-form";

const round = {
  ...getExampleRound(),
  title: "Community grants",
  purpose: "",
  budget: null,
  meetingDate: null,
  criteria: [],
  applications: [],
  managerUserId: "dana",
};

const PreparationExample = ({
  section,
  fail,
  populated = false,
  onSave,
}: {
  section: "purpose" | "criteria" | "budget";
  fail: boolean;
  populated?: boolean;
  onSave: () => void;
}) => {
  const currentRound = populated ? { ...getExampleRound(), managerUserId: "dana" } : round;
  const [draft, setDraft] = useState(
    () => preparationDraft(section, currentRound, 0) as PreparationDraft,
  );
  const [saved, setSaved] = useState(0);
  const [reset, setReset] = useState(0);

  return (
    <GrantmakingMessagesProvider>
      <PreparationForm
        key={`${section}/${reset}`}
        draft={draft}
        round={currentRound}
        onChange={setDraft}
        onCancel={() => {
          setDraft(preparationDraft(section, currentRound, 0) as PreparationDraft);
          setReset((value) => value + 1);
        }}
        onSave={async () => {
          onSave();
          if (fail) {
            return "We couldn’t save this round. Your draft is still here. Try again.";
          }
          setSaved((count) => count + 1);
          return null;
        }}
      />
      <StatusMessage eventId={saved} message={saved ? "Round saved" : null} />
    </GrantmakingMessagesProvider>
  );
};

const meta = {
  title: "Features/Funding rounds/Preparation form",
  tags: ["!autodocs"],
  component: PreparationExample,
  args: { section: "purpose", fail: false, onSave: fn() },
  argTypes: { section: { control: false }, populated: { control: false } },
} satisfies Meta<typeof PreparationExample>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Purpose: Story = {};
export const Criteria: Story = {
  args: { section: "criteria" },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Add criterion" }));
    await userEvent.type(canvas.getByRole("textbox", { name: "Title" }), "Community need");
    await userEvent.type(
      canvas.getByRole("textbox", { name: "Reviewer guidance" }),
      "Consider evidence from residents.",
    );
  },
};
export const UnsetBudget: Story = {
  args: { section: "budget" },
  play: async ({ canvas, userEvent }) => {
    const amount = canvas.getByRole("textbox", { name: "Round budget" });

    await expect(amount).toHaveAccessibleDescription("Euros");
    await expect(amount).toHaveAttribute("placeholder", "Not set");
    await expect(canvas.getByText("€", { exact: true })).not.toBeVisible();

    await userEvent.type(amount, "1250.50");

    await expect(amount).toHaveValue("1250.50");
    await expect(canvas.getByText("€", { exact: true })).toBeVisible();
    await expect(amount).toHaveFocus();

    await userEvent.clear(amount);

    await expect(canvas.getByText("€", { exact: true })).not.toBeVisible();
    await expect(amount).toHaveFocus();
  },
};
export const SaveFailure: Story = {
  args: { fail: true },
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(
      canvas.getByRole("textbox", { name: "Purpose" }),
      "Build community connections.",
    );
    await userEvent.click(canvas.getByRole("button", { name: "Save changes" }));

    await expect(canvas.getByRole("alert")).toHaveTextContent(
      "We couldn’t save this round. Your draft is still here. Try again.",
    );
    await expect(canvas.getByRole("textbox", { name: "Purpose" })).toHaveValue(
      "Build community connections.",
    );
  },
};

export const ReorderCriteria: Story = {
  args: { section: "criteria", populated: true },
  play: async ({ canvas, userEvent }) => {
    const before = canvas
      .getAllByRole("textbox", { name: "Title" })
      .map((input) => (input as HTMLInputElement).value);
    await userEvent.click(canvas.getByRole("button", { name: "Move up criterion 2" }));

    await expect(canvas.getAllByRole("textbox", { name: "Title" })[0]).toHaveValue(before[1]);
    await expect(canvas.getAllByRole("textbox", { name: "Title" })[0]).toHaveFocus();
  },
};
export const RemoveCriterion: Story = {
  args: { section: "criteria", populated: true },
  play: async ({ canvas, userEvent }) => {
    const count = canvas.getAllByRole("group").length;
    await userEvent.click(canvas.getByRole("button", { name: "Remove criterion 1" }));

    await expect(canvas.getAllByRole("group")).toHaveLength(count - 1);
    await expect(canvas.getAllByRole("textbox", { name: "Title" })[0]).toHaveFocus();
  },
};
