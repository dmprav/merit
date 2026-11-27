import type { Meta, StoryObj } from "@storybook/react-vite";

import { Inline, Stack } from "../layout/layout";
import { Badge } from "./badge";
import styles from "./badge.stories.module.css";

const meta = {
  title: "Components/Badge",
  component: Badge,
  args: { children: "Draft" },
  argTypes: { tone: { control: "select", options: ["neutral", "success", "warning", "danger"] } },
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
      <div className={styles.mutedSurface}>
        <Inline>
          <Badge>Draft</Badge>
          <Badge tone="success">Current</Badge>
          <Badge tone="warning">Outdated</Badge>
          <Badge tone="danger">Failed</Badge>
        </Inline>
      </div>
    </Stack>
  ),
};

export const Playground: Story = {};

export const LongLabels: Story = {
  parameters: {
    controls: { disable: true },
    docs: {
      description: {
        story:
          "A narrow metadata column keeps short badges at their natural width and preserves longer qualifications, including unbroken translated words.",
      },
    },
  },
  render: () => (
    <div className={styles.narrow}>
      <Stack gap={2}>
        <Badge>Not accepted</Badge>
        <Badge tone="warning">Application changed since this review</Badge>
        <Badge>Review basis unavailable</Badge>
        <Badge lang="de">Finanzierungsentscheidung ausstehend</Badge>
      </Stack>
    </div>
  ),
};

export const PlainStatus: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <Stack gap={3}>
      <Badge appearance="plain" icon="clock">
        Awaiting acceptance
      </Badge>
      <Badge appearance="plain" tone="success">
        Accepted
      </Badge>
      <Badge appearance="plain" tone="warning">
        Sending unconfirmed
      </Badge>
      <Badge appearance="plain" tone="danger">
        Email sending failed
      </Badge>
    </Stack>
  ),
};
