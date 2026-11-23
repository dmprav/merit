import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, waitFor } from "storybook/test";

import { Button } from "../../components/button/button";
import { StatusMessage } from "./status-message";
import styles from "./status-message.stories.module.css";

const meta = {
  title: "Patterns/Status message",
  component: StatusMessage,
  args: { message: "Demo loaded", eventId: 0 },
  argTypes: { eventId: { control: false } },
  render: (args) => <Example {...args} />,
} satisfies Meta<typeof StatusMessage>;

export default meta;

type Story = StoryObj<typeof meta>;

const Example = ({ message }: { message: string | null }) => {
  const [event, setEvent] = useState(0);

  return (
    <div className={styles.example}>
      <p>Use a screen reader to hear the message. Repeat the event to announce it again.</p>
      <Button onPress={() => setEvent((value) => value + 1)}>Repeat event</Button>
      <StatusMessage message={message} eventId={event} />
    </div>
  );
};

export const AnnouncementOnly: Story = {
  play: async ({ canvas }) => {
    await waitFor(() => expect(canvas.getByRole("status")).toHaveTextContent("Demo loaded"));
  },
};
