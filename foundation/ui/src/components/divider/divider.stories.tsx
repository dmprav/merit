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

export const Edge: Story = { ...BetweenBlocks, args: { strength: "edge" } };

export const Tight: Story = { ...BetweenBlocks, args: { spacing: 3 } };

/** The same spacing gives the same visible space whatever gap the parent Stack publishes. */
export const AcrossStackGaps: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <Stack gap={6}>
      {([3, 6] as const).map((gap) => (
        <Stack as="section" key={gap} gap={gap} aria-label={`Gap ${gap}`}>
          <p>Above the rule in a stack with gap {gap}.</p>
          <Divider />
          <p>Below the rule in a stack with gap {gap}.</p>
        </Stack>
      ))}
    </Stack>
  ),
};

/** A wrapper between the Stack and the rule hides the Stack's gap, so the rule keeps its spacing. */
export const InsideWrapper: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <Stack gap={3}>
      <section aria-label="Wrapped">
        <p>Above the rule in a wrapper.</p>
        <Divider />
        <p>Below the rule in a wrapper.</p>
      </section>
    </Stack>
  ),
};
