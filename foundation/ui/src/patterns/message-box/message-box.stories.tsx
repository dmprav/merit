import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn } from "storybook/test";

import { MessageBox } from "./message-box";
import styles from "./message-box.stories.module.css";

type Chip = { id: string; label: string; removeLabel: string };

const Example = ({
  initialValue = "",
  initialChips = [],
  isBusy = false,
  description,
  onSend,
  onStop,
}: {
  initialValue?: string;
  initialChips?: readonly Chip[];
  isBusy?: boolean;
  description?: string;
  onSend: (text: string) => void;
  onStop: () => void;
}) => {
  const [value, setValue] = useState(initialValue);
  const [chips, setChips] = useState(initialChips);

  return (
    <div className={styles.frame}>
      <MessageBox
        label="Message"
        isLabelHidden
        placeholder="Ask about this application"
        description={description}
        value={value}
        onChange={setValue}
        sendLabel="Send message"
        onSend={(text) => {
          onSend(text);
          setValue("");
        }}
        isBusy={isBusy}
        stopLabel="Stop"
        onStop={onStop}
        chips={chips.map((chip) => ({
          ...chip,
          onRemove: () => setChips((current) => current.filter((item) => item.id !== chip.id)),
        }))}
      />
    </div>
  );
};

const meta = {
  title: "Patterns/Message box",
  component: Example,
  tags: ["!autodocs"],
  args: { onSend: fn(), onStop: fn() },
} satisfies Meta<typeof Example>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Empty: Story = {};

export const Typing: Story = {
  args: { initialValue: "Which budget lines changed since the first draft?" },
  play: async ({ canvas }) => {
    const input = canvas.getByRole("textbox", { name: "Message" });
    input.focus();
    await expect(input).toHaveFocus();
  },
};

export const LongText: Story = {
  args: {
    initialValue: Array.from(
      { length: 10 },
      (_, index) => `Line ${index + 1} of a message that keeps going.`,
    ).join("\n"),
  },
};

export const WithChips: Story = {
  args: {
    initialChips: [
      {
        id: "application",
        label: "Riverside Youth Arts",
        removeLabel: "Remove Riverside Youth Arts",
      },
      { id: "round", label: "Community grants 2026", removeLabel: "Remove Community grants 2026" },
      {
        id: "document",
        label:
          "Budget narrative and supporting quotations for the new studio equipment, revised after the site visit.pdf",
        removeLabel:
          "Remove Budget narrative and supporting quotations for the new studio equipment, revised after the site visit.pdf",
      },
    ],
  },
};

export const Busy: Story = {
  args: { isBusy: true, initialValue: "And the timeline?" },
};

export const WithDescription: Story = {
  args: { description: "Enter sends. Shift+Enter adds a line." },
};

export const Sending: Story = {
  args: { initialValue: "Summarize the reviews" },
  play: async ({ canvas, args, userEvent }) => {
    await userEvent.type(canvas.getByRole("textbox", { name: "Message" }), "{Enter}");
    await expect(args.onSend).toHaveBeenCalledWith("Summarize the reviews");
    await expect(canvas.getByRole("textbox", { name: "Message" })).toHaveValue("");
  },
};
