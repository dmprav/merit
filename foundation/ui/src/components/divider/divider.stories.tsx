import type { Meta, StoryObj } from "@storybook/react-vite";

import { Button } from "../button/button";
import { Stack } from "../layout/layout";
import { Divider } from "./divider";

const meta = {
  title: "Components/Divider",
  component: Divider,
} satisfies Meta<typeof Divider>;

export default meta;

type Story = StoryObj<typeof meta>;

export const BetweenBlocks: Story = {
  render: (args) => (
    <Stack gap={4}>
      <p>The invitation was sent to dana@example.test.</p>
      <Divider {...args} />
      <div>
        <Button variant="quiet">Revoke invitation</Button>
      </div>
    </Stack>
  ),
};

export const Emphasis: Story = { args: { tone: "emphasis" } };
