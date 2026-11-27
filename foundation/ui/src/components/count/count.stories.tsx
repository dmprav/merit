import type { Meta, StoryObj } from "@storybook/react-vite";

import { Inline } from "../layout/layout";
import { Count } from "./count";

const meta = {
  title: "Components/Count",
  component: Count,
  args: { children: 12 },
  argTypes: { tone: { control: "select", options: ["neutral", "warning"] } },
} satisfies Meta<typeof Count>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Overview: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <Inline>
      <Count>0</Count>
      <Count>12</Count>
      <Count>1,204</Count>
      <Count tone="warning" title="Two are overdue">
        3
      </Count>
    </Inline>
  ),
};

export const Playground: Story = {};
