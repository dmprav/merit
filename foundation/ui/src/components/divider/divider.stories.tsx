import type { Meta, StoryObj } from "@storybook/react-vite";

import { Button } from "../button/button";
import { Stack } from "../layout/layout";
import { Divider } from "./divider";

const meta = {
  title: "Components/Divider",
  component: Divider,
  parameters: {
    docs: {
      description: {
        component:
          "Divider separates blocks of content with a decorative rule; the surrounding Stack spaces it. Use Stack's divided option for rules between list entries, and the emphasis tone only for the rule that marks the recorded side of a comparison.",
      },
    },
  },
} satisfies Meta<typeof Divider>;

export default meta;

type Story = StoryObj<typeof meta>;

export const BetweenBlocks: Story = {
  render: () => (
    <Stack gap={4}>
      <p>The invitation was sent to dana@example.test.</p>
      <Divider />
      <div>
        <Button variant="quiet">Revoke invitation</Button>
      </div>
    </Stack>
  ),
};

export const Emphasis: Story = { args: { tone: "emphasis" } };
