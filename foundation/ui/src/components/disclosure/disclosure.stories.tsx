import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";

import { Disclosure } from "./disclosure";

const meta = {
  title: "Components/Disclosure",
  component: Disclosure,
  args: {
    title: "Earlier versions",
    count: 2,
    children: <p>Version 1 recommended funding at €18,000 before the venue changed.</p>,
  },
} satisfies Meta<typeof Disclosure>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Collapsed: Story = {
  play: async ({ canvas, userEvent }) => {
    const trigger = canvas.getByRole("button", { name: "Earlier versions 2" });
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(trigger);
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(canvas.getByText(/Version 1 recommended funding/)).toBeVisible();
  },
};

export const Expanded: Story = { args: { defaultExpanded: true } };
