import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, waitFor } from "storybook/test";

import { Button } from "../../components/button/button";
import { Inline, Reading, Stack } from "../../components/layout/layout";
import { StatusMessage } from "./status-message";

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
    <Reading prose={false}>
      <Stack gap={4}>
        <p>Use a screen reader to hear the message. Repeat the event to announce it again.</p>
        <Inline>
          <Button onPress={() => setEvent((value) => value + 1)}>Repeat event</Button>
        </Inline>
        <StatusMessage message={message} eventId={event} />
      </Stack>
    </Reading>
  );
};

export const AnnouncementOnly: Story = {
  play: async ({ canvas }) => {
    await waitFor(() => expect(canvas.getByRole("status")).toHaveTextContent("Demo loaded"));
  },
};
