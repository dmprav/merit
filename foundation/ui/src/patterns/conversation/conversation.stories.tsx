import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";

import { Conversation, ConversationMessage } from "./conversation";
import styles from "./conversation.stories.module.css";

const meta = {
  title: "Patterns/Conversation",
  component: Conversation,
  args: { label: "Conversation", children: null },
  decorators: [
    (Story) => (
      <div className={styles.frame}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Conversation>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Turns: Story = {
  render: (args) => (
    <Conversation {...args}>
      <ConversationMessage author="person" authorLabel="You">
        <p>Which applications in this round still need a second review?</p>
      </ConversationMessage>
      <ConversationMessage author="assistant" authorLabel="Assistant">
        <p>Three applications have one review so far.</p>
        <p>Riverside Youth Arts, Harbour Learning Garden, and Northside Repair Cafe.</p>
      </ConversationMessage>
    </Conversation>
  ),
  play: async ({ canvas }) => {
    const log = canvas.getByRole("log", { name: "Conversation" });
    await expect(log).toHaveAttribute("aria-live", "off");
    await expect(canvas.getAllByRole("listitem")).toHaveLength(2);
    await expect(canvas.getByText("You")).toBeInTheDocument();
    await expect(canvas.getByText("Assistant")).toBeInTheDocument();
  },
};

export const LongContent: Story = {
  render: (args) => (
    <Conversation {...args}>
      <ConversationMessage author="person" authorLabel="You">
        <p>
          Can you compare the revised venue arrangements across every application in the round, and
          tell me which of them still rely on a free venue that is no longer available to them?
        </p>
      </ConversationMessage>
      <ConversationMessage author="assistant" authorLabel="Assistant">
        <p>
          Only one application relies on a venue that is no longer free. Its first review assessed
          the earlier arrangement, so it does not cover the change. The other applications either
          pay for their venues or have confirmed bookings, so none of them needs another look.
        </p>
      </ConversationMessage>
    </Conversation>
  ),
};

export const NarrowWidth: Story = {
  decorators: [
    (Story) => (
      <div className={styles.narrow}>
        <Story />
      </div>
    ),
  ],
  render: LongContent.render,
};
