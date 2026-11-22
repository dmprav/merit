import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useState } from "react";
import { expect, userEvent, waitFor } from "storybook/test";

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

  return (
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
        </ConversationMessage>
      </Conversation>
    </div>
  );
};

const distanceFromEnd = (scroller: HTMLElement) =>
  scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;

export const FollowsStreaming: Story = {
  render: () => <Streaming asks={0} />,
  play: async ({ canvas }) => {
    const scroller = canvas.getByTestId("scroller");
    await canvas.findByText(/Paragraph 10\./, undefined, { timeout: 5000 });
    await expect(scroller.scrollHeight).toBeGreaterThan(scroller.clientHeight);
    await waitFor(() => expect(distanceFromEnd(scroller)).toBeLessThan(24));
  },
};

export const LeavesTheScrollWherePut: Story = {
  render: () => <Streaming asks={1} />,
  play: async ({ canvas }) => {
    const scroller = canvas.getByTestId("scroller");
    await waitFor(() => expect(scroller.scrollHeight).toBeGreaterThan(scroller.clientHeight + 100));
    scroller.scrollTop = 0;
    await canvas.findByText(/Paragraph 10\./, undefined, { timeout: 5000 });
    await expect(scroller.scrollTop).toBeLessThan(24);
    await expect(distanceFromEnd(scroller)).toBeGreaterThan(100);

    // Asking again follows the end once more.
    await userEvent.click(await canvas.findByRole("button", { name: "Ask again" }));
    await waitFor(() => expect(distanceFromEnd(scroller)).toBeLessThan(24));
    await canvas.findByText(/Paragraph 10\./, undefined, { timeout: 5000 });
    await waitFor(() => expect(distanceFromEnd(scroller)).toBeLessThan(24));
  },
};
