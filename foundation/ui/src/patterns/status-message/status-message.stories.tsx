import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import { Button } from "../../components/button/button";
import { ApplicationPage, ApplicationShell } from "../application-shell/application-shell";
import shellStyles from "../application-shell/application-shell.module.css";
import { StatusMessage } from "./status-message";
import styles from "./status-message.stories.module.css";

const meta = {
  title: "Patterns/Status message",
  component: StatusMessage,
  args: { message: "Recommendation saved", eventId: 0, confirmation: true },
  argTypes: { eventId: { control: false } },
  render: (args) => <Example {...args} />,
} satisfies Meta<typeof StatusMessage>;

export default meta;

type Story = StoryObj<typeof meta>;

const Example = ({
  message,
  confirmation,
  className,
}: {
  message: string | null;
  confirmation?: boolean;
  className?: string;
}) => {
  const [event, setEvent] = useState(0);

  return (
    <div className={styles.example}>
      <p>
        {confirmation
          ? "The confirmation lasts four seconds. Repeat the event to show the same message again."
          : "Use a screen reader to hear the message. Repeat the event to announce it again."}
      </p>
      <Button onPress={() => setEvent((value) => value + 1)}>Repeat event</Button>
      <StatusMessage
        message={message}
        eventId={event}
        confirmation={confirmation}
        className={className}
      />
    </div>
  );
};

export const Success: Story = {};
export const AnnouncementOnly: Story = { args: { message: "Demo loaded", confirmation: false } };
export const LongMessage: Story = {
  args: {
    message:
      "Your recommendation and its supporting explanation have been saved for the next round review.",
  },
};

export const InWorkspace: Story = {
  args: { ...LongMessage.args, className: shellStyles.confirmation },
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <ApplicationShell
        brand="Merit"
        contextLabel="Alder Foundation"
        openNavigationLabel="Open navigation"
        closeNavigationLabel="Close navigation"
        navigation={<a href="#main">Funding rounds</a>}
        navigationLabel="Main navigation"
        skipLabel="Skip to content"
      >
        <ApplicationPage
          width="full"
          locationKey="confirmation"
          breadcrumb={null}
          breadcrumbLabel="Breadcrumb"
        >
          <h1>Save confirmation</h1>
          <Story />
        </ApplicationPage>
      </ApplicationShell>
    ),
  ],
};
