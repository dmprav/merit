import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useState } from "react";
import { expect } from "storybook/test";

import { Button } from "../../components/button/button";
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

const paragraphs = Array.from(
  { length: 10 },
  (_, index) =>
    `Paragraph ${index + 1}. The recorded review covers the first submission and relies on the venue that was free then, so the assessment has to be read with that in mind.`,
);

/** An answer that arrives a paragraph at a time, restarting whenever the person asks again. */
const Streaming = ({ asks }: { asks: number }) => {
  const [shown, setShown] = useState(0);
  const [questions, setQuestions] = useState(1);

  useEffect(() => {
    if (shown >= paragraphs.length) {
      return;
    }
    const timer = setTimeout(() => setShown(shown + 1), 120);
    return () => clearTimeout(timer);
  }, [shown]);

  // The control stays outside the scroller, as story controls stay outside the product frame, so
  // pressing it cannot scroll the thread.
  return (
    <>
      <div
        className={styles.scroller}
        data-testid="scroller"
        role="region"
        aria-label="Panel"
        tabIndex={0}
      >
        <Conversation label="Conversation" followKey={String(questions)}>
          <ConversationMessage author="person" authorLabel="You">
            <p>Question {questions}</p>
          </ConversationMessage>
          <ConversationMessage author="assistant" authorLabel="Assistant">
            {paragraphs.slice(0, shown).map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </ConversationMessage>
        </Conversation>
      </div>
      {shown >= paragraphs.length && asks > 0 && (
        <Button
          variant="secondary"
          onPress={() => {
            setQuestions(questions + 1);
            setShown(0);
          }}
        >
          Ask again
        </Button>
      )}
    </>
  );
};

// The answer is still arriving when the play ends: the browser suite checks where the panel scrolls.
export const FollowsStreaming: Story = {
  render: () => <Streaming asks={0} />,
  play: async ({ canvas }) => {
    await canvas.findByText(/Paragraph 1\./);
  },
};

export const LeavesTheScrollWherePut: Story = {
  render: () => <Streaming asks={1} />,
  play: async ({ canvas }) => {
    await canvas.findByText(/Paragraph 1\./);
  },
};
