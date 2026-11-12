import type { Meta, StoryObj } from "@storybook/react-vite";

import { Button } from "../../components/button/button";
import linkStyles from "../../components/link/link.module.css";
import { StateMessage } from "./state-message";

const meta = {
  title: "Patterns/State message",
  component: StateMessage,
  parameters: {
    docs: {
      description: {
        component:
          'A centered page-level message with an h1, optional explanation, illustration, and actions. Callers supply translated content and recovery behavior; page wrappers own placement and navigation. Mark decorative illustrations aria-hidden. Pass role="status" for loading announcements; static recovery messages have no live role.',
      },
    },
  },
  args: {
    title: "Workspace unavailable",
    description: "We couldn’t load your workspace. Please try again.",
    actions: <Button>Try again</Button>,
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
      <a href="#demo" className={linkStyles.button} data-variant="primary">
        Try the demo
      </a>
    ),
  },
};
