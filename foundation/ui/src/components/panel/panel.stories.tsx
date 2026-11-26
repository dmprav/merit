import type { Meta, StoryObj } from "@storybook/react-vite";

import { TextField } from "../fields/text-field/text-field";
import { Stack } from "../layout/layout";
import { Text } from "../text/text";
import { Panel } from "./panel";

const meta = {
  title: "Components/Panel",
  component: Panel,
  args: { children: null },
  parameters: { controls: { disable: true } },
} satisfies Meta<typeof Panel>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Fieldset: Story = {
  render: () => (
    <Panel as="fieldset">
      <Text as="legend" variant="caption">
        Criterion 1
      </Text>
      <Stack gap={3}>
        <TextField label="Title" defaultValue="Community connection" />
        <TextField label="Guidance" multiline rows={3} />
      </Stack>
    </Panel>
  ),
};

export const Region: Story = {
  render: () => (
    <Panel as="section" padding={6} aria-label="Review invitation">
      <Stack gap={3}>
        <Text as="p" variant="emphasis">
          Workshop Saturdays
        </Text>
        <Text as="p" variant="supporting">
          Invited by Dana Reed
        </Text>
      </Stack>
    </Panel>
  ),
};
