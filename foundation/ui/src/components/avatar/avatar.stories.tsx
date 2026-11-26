import type { Meta, StoryObj } from "@storybook/react-vite";

import { Inline, Stack } from "../layout/layout";
import { Text } from "../text/text";
import { Avatar } from "./avatar";

const meta = {
  title: "Components/Avatar",
  component: Avatar,
  args: { name: "Dana Reed", size: "compact" },
  argTypes: {
    size: { control: "radio", options: ["compact", "regular"] },
  },
} satisfies Meta<typeof Avatar>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Overview: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <Stack gap={4}>
      <Inline gap={4} align="center">
        <Avatar name="Dana Reed" size="compact" />
        <Text variant="supporting">Compact, full name</Text>
      </Inline>
      <Inline gap={4} align="center">
        <Avatar name="Dana Reed" size="regular" />
        <Text variant="supporting">Regular, full name</Text>
      </Inline>
      <Inline gap={4} align="center">
        <Avatar name="Dana" size="regular" />
        <Text variant="supporting">Single name</Text>
      </Inline>
      <Inline gap={4} align="center">
        <Avatar size="regular" />
        <Text variant="supporting">Unassigned (empty outline)</Text>
      </Inline>
    </Stack>
  ),
};

export const Playground: Story = {};
