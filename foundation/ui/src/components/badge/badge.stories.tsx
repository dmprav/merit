import type { Meta, StoryObj } from "@storybook/react-vite";

import { Icon } from "../icon/icon";
import { Inline, Stack } from "../layout/layout";
import { Badge } from "./badge";
import styles from "./badge.stories.module.css";

const meta = {
  title: "Components/Badge",
  component: Badge,
  args: { children: "Draft" },
  argTypes: { tone: { control: "select", options: ["neutral", "success", "warning", "danger"] } },
  parameters: {
    docs: {
      description: {
        component:
          "Badge presents short, read-only status or metadata beside the item it describes. Use neutral for routine states, success for confirmed positive outcomes, warning for something needing attention, and danger for failure. Keep funding judgments neutral: a recommendation to fund is not a successful system action. The visible label carries the meaning without color. Use appearance=plain with a decorative icon for a quiet status column; reserve the filled badge for compact metadata that needs a distinct shape. Labels wrap when space or enlarged text requires it. Use a button or link for an action, and Notice for an explanation or recovery step.",
      },
    },
  },
} satisfies Meta<typeof Badge>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Overview: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <Stack gap={5}>
      <Inline>
        <Badge>Draft</Badge>
        <Badge tone="success">Current</Badge>
        <Badge tone="warning">Outdated</Badge>
        <Badge tone="danger">Failed</Badge>
      </Inline>
      <Inline className={styles.mutedSurface}>
        <Badge>Draft</Badge>
        <Badge tone="success">Current</Badge>
        <Badge tone="warning">Outdated</Badge>
        <Badge tone="danger">Failed</Badge>
      </Inline>
    </Stack>
  ),
};

export const Playground: Story = {};

export const LongLabels: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "A narrow metadata column keeps short badges at their natural width and preserves longer qualifications, including unbroken translated words.",
      },
    },
  },
  render: () => (
    <Stack gap={2} className={styles.narrow}>
      <Badge>Read only</Badge>
      <Badge tone="warning">Application changed since this review</Badge>
      <Badge>Review basis unavailable</Badge>
      <Badge lang="de">Finanzierungsentscheidung ausstehend</Badge>
    </Stack>
  ),
};

export const PlainStatus: Story = {
  render: () => (
    <Stack gap={3}>
      <Badge appearance="plain">
        <Icon name="clock" />
        Awaiting acceptance
      </Badge>
      <Badge appearance="plain" tone="warning">
        <Icon name="info" />
        Sending unconfirmed
      </Badge>
      <Badge appearance="plain" tone="danger">
        <Icon name="warning" />
        Email sending failed
      </Badge>
    </Stack>
  ),
};
