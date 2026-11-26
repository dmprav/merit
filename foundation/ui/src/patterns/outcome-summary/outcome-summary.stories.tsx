import type { Meta, StoryObj } from "@storybook/react-vite";

import { Stack } from "../../components/layout/layout";
import { OutcomeSummary } from "./outcome-summary";

const meta = {
  title: "Patterns/Outcome summary",
  component: OutcomeSummary,
  args: {
    title: "Recommends funding",
    detail: "€22,000 proposed",
  },
} satisfies Meta<typeof OutcomeSummary>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Overview: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <Stack gap={3}>
      <OutcomeSummary title="Recommends funding" detail="€22,000 proposed" />
      <OutcomeSummary title="Recommends funding with a condition" detail="€18,500 proposed" />
      <OutcomeSummary title="Recommends declining" detail="No funding proposed" />
      <OutcomeSummary title="Funding position: Not stated" detail="Proposed amount: Not stated" />
    </Stack>
  ),
};

export const Playground: Story = {};
