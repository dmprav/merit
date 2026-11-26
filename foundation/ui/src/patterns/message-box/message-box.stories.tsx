import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { fn } from "storybook/test";

import { MessageBox } from "./message-box";
import styles from "./message-box.stories.module.css";

type Chip = { id: string; label: string; removeLabel: string };

const Example = ({
  initialValue = "",
  initialChips = [],
  isBusy = false,
  isSendDisabled = false,
  isLabelHidden = true,
  description,
  onSend,
  onStop,
}: ExampleProps) => {
  const [value, setValue] = useState(initialValue);
  const [chips, setChips] = useState(initialChips);

  return (
    <div className={styles.frame}>
      <MessageBox
        label="Message"
        isLabelHidden={isLabelHidden}
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
        isSendDisabled={isSendDisabled}
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

type ExampleProps = {
  initialValue?: string;
  initialChips?: readonly Chip[];
  isBusy?: boolean;
  isSendDisabled?: boolean;
  isLabelHidden?: boolean;
  description?: string;
  onSend: (text: string) => void;
  onStop: () => void;
};

type MessageBoxStoryArgs = React.ComponentProps<typeof MessageBox> & ExampleProps;

const meta = {
  title: "Patterns/Message box",
  component: MessageBox,
  tags: ["!autodocs"],
  args: {
    label: "Message",
    value: "",
    onChange: fn(),
    sendLabel: "Send message",
    stopLabel: "Stop",
    onSend: fn(),
    onStop: fn(),
  },
  argTypes: {
    label: { control: false },
    value: { control: false },
    onChange: { control: false },
    sendLabel: { control: false },
    stopLabel: { control: false },
    chips: { control: false },
    initialValue: { control: false },
    initialChips: { control: false },
  },
  render: ({
    initialValue,
    initialChips,
    isBusy,
    isSendDisabled,
    isLabelHidden,
    description,
    onSend,
    onStop,
  }) => (
    <Example
      initialValue={initialValue}
      initialChips={initialChips}
      isBusy={isBusy}
      isSendDisabled={isSendDisabled}
      isLabelHidden={isLabelHidden}
      description={description}
      onSend={onSend}
      onStop={onStop}
    />
  ),
} satisfies Meta<MessageBoxStoryArgs>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Empty: Story = {};

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

export const SendDisabled: Story = {
  args: { isSendDisabled: true, initialValue: "Waiting for a decision to be recorded…" },
};

export const WithDescription: Story = {
  args: { description: "Enter sends. Shift+Enter adds a line." },
};

export const VisibleLabel: Story = {
  args: { isLabelHidden: false, description: "Enter sends. Shift+Enter adds a line." },
};
