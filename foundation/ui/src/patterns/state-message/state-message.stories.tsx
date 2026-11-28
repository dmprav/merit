import type { Meta, StoryObj } from "@storybook/react-vite";

import { Button } from "../../components/button/button";
import { Icon } from "../../components/icon/icon";
import { Link } from "../../components/link/link";
import { StateMessage } from "./state-message";
import styles from "./state-message.stories.module.css";

const meta = {
  title: "Patterns/State message",
  component: StateMessage,
  parameters: {
    docs: {
      description: {
        component:
          'A centered message with an optional explanation, illustration, and actions. The page size has an h1; the compact size sits inside a dialog or search box with a small icon. Callers supply translated content and recovery behavior; page wrappers own placement and navigation. Mark decorative illustrations aria-hidden. Pass role="status" for loading announcements; static recovery messages have no live role.',
      },
    },
  },
  args: {
    title: "Workspace unavailable",
    description: "We couldn’t load your workspace. Please try again.",
    actions: <Button>Try again</Button>,
  },
  argTypes: {
    actions: { control: false },
    illustration: { control: false },
  },
} satisfies Meta<typeof StateMessage>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Recovery: Story = {};

export const Missing: Story = {
  args: {
    title: "Application not found",
    description: "This application isn’t in the demo.",
    actions: undefined,
    illustration: (
      <svg
        width="64"
        height="72"
        viewBox="0 0 64 72"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M40 6H14a4 4 0 0 0-4 4v52a4 4 0 0 0 4 4h36a4 4 0 0 0 4-4V20L40 6Z" />
        <path d="M40 6v14h14M20 30h24M20 38h14M29 48l10 10M39 48 29 58" />
      </svg>
    ),
  },
};

export const Loading: Story = {
  args: {
    title: "Loading your workspace…",
    role: "status",
    description: undefined,
    actions: undefined,
  },
};

export const LongContent: Story = {
  args: {
    title: "No workspace access yet",
    description:
      "You’re signed in, but no workspace is available to your account. Contact the person who invited you to arrange access. You can explore the demo in the meantime.",
    actions: (
      <Link variant="primary" href="#demo">
        Try the demo
      </Link>
    ),
  },
};

/** The compact size inside a dialog or search box, in its neutral and failure tones. */
export const Compact: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <div className={styles.comparison}>
      <StateMessage
        size="compact"
        title="No results match “harbr”."
        description="Search by funding round, application title, or applicant."
        illustration={<Icon name="search" />}
      />
      <StateMessage
        size="compact"
        tone="danger"
        title="Search isn’t available right now."
        description="Your search is kept. Try again in a moment."
        illustration={<Icon name="attention" />}
        actions={
          <Button variant="quiet">
            <Icon name="reset" />
            Try again
          </Button>
        }
      />
    </div>
  ),
};
