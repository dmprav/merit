import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";

import { VisuallyHidden } from "./visually-hidden";

const meta = {
  title: "Components/Visually hidden",
  component: VisuallyHidden,
  args: { as: "h2", children: "Version history" },
  render: (args) => (
    <section aria-labelledby="history-title">
      <VisuallyHidden {...args} id="history-title" />
      <p>Compare what changed between submitted versions.</p>
    </section>
  ),
} satisfies Meta<typeof VisuallyHidden>;

export default meta;

type Story = StoryObj<typeof meta>;

export const RegionHeading: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("region", { name: "Version history" })).toBeInTheDocument();
  },
};
